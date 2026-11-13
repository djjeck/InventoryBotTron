import { initialState, reduce, type State, type StateEvent } from '@inventorybottron/state';
import { type BusEvent } from '@megabottron1999/core';
import { describe, expect, it } from 'vitest';
import { gainedItems, gainedSchema, gains } from './gains.ts';
import { toStateEvent } from './state.ts';

// Invented sentences (CLAUDE.md, "Game content"), with items of scripts/universe.md.
const OWNER = 'mario_r';
const T0 = Date.parse('2026-11-06T12:00:00Z');
const S = 'mentre conti le nuvole dal tetto del mulino ti cade in mano ';

const turn = (outcome: Record<string, unknown>): BusEvent =>
  ({ type: 'inventorybot.turn', t: T0, chat: '@InventoryBot', outcome }) as BusEvent;
const reply = (r: Record<string, unknown>, query: string | null = null): BusEvent =>
  ({
    type: 'inventorybot.reply',
    t: T0,
    chat: '@InventoryBot',
    query,
    self: OWNER,
    reply: r,
  }) as BusEvent;
const drop = (item: string, sure: boolean, more: Record<string, unknown> = {}) =>
  turn({ kind: 'gain', bot: 'InventoryBot', item, rarity: 'C', tags: [], sure, ...more });

/** The owner's state after a whole listing of `items` (name to count). */
function holding(items: Record<string, number>): State {
  return reduce(initialState(OWNER), {
    type: 'inventory',
    filtered: false,
    truncated: false,
    items: Object.entries(items).map(([name, qty]) => ({ name, rarity: 'C', usable: false, qty })),
    dm: true,
    query: '/inventario',
    player: OWNER,
  });
}

/** What the plugin announces of `event` on `before`: applied as its reducer applies it. */
function told(before: State, event: BusEvent) {
  const e = toStateEvent(before, event);
  const after = e === undefined ? before : reduce(before, e);
  return gains(before, after, event).map((g) => g.payload);
}

describe('what the owner gained', () => {
  it('a_drop_sure_or_guessed_and_a_lucky_one', () => {
    const s = holding({ 'un sasso': 2 });
    expect(told(s, drop('un sasso', true, { raw: `${S}un sasso` }))).toEqual([
      { item: 'un sasso', sure: true, qty: 3, exact: true },
    ]);
    // A guess: its guess, an estimate.
    expect(told(s, drop('una perla', false, { raw: `${S}una perla` }))).toEqual([
      { item: 'una perla', sure: false, qty: 1, exact: false },
    ]);
    // The lucky adventure: no narrative, its item delimited.
    expect(told(s, drop('una conchiglia', true))).toEqual([
      { item: 'una conchiglia', sure: true, qty: 1, exact: false },
    ]);
    // Not a gain: anything else a turn tells.
    expect(
      told(s, turn({ kind: 'nothing', bot: 'InventoryBot', reason: 'cooldown', retryMs: 1 }))
    ).toEqual([]);
  });

  it('a_gift_a_craft_and_what_a_use_gives', () => {
    const s = holding({ 'una perla': 1, 'un sasso': 3 });
    expect(told(s, reply({ type: 'gift', from: 'lucia_b', qty: 2, item: 'una perla' }))).toEqual([
      { item: 'una perla', sure: true, qty: 3, exact: true },
    ]);
    const craft = {
      type: 'craft',
      ingredients: [{ name: 'un sasso', rarity: 'C', usable: false, qty: 2 }],
      output: 'una spada di legno',
      flavor: 'e mescoli tutto con cura...',
    };
    expect(told(s, reply(craft, '/ricetta Torre'))).toEqual([
      { item: 'una spada di legno', sure: true, qty: 1, exact: false },
    ]);
    // A craft with no output gains nothing; its ingredients are spent, not gained.
    expect(told(s, reply({ ...craft, output: null }, '/ricetta Torre'))).toEqual([]);
    // A use: each item it adds, once, not what it takes.
    const use = {
      type: 'use',
      text: 'apri il barattolo',
      items: [
        { name: 'una ghianda', rarity: 'C', usable: false, qty: 2 },
        { name: 'un sasso', rarity: 'C', usable: false, qty: -1 },
        { name: 'una ghianda', rarity: 'C', usable: false, qty: 1 },
      ],
    };
    expect(told(s, reply(use, '/usa barattolo'))).toEqual([
      { item: 'una ghianda', sure: true, qty: 3, exact: false },
    ]);
  });

  it('not_what_only_observes_the_inventory', () => {
    const s = holding({ 'una perla': 1 });
    const line = { name: 'una perla', rarity: 'C', usable: false, qty: 4 };
    for (const [r, q] of [
      [{ type: 'inventory', filtered: false, truncated: false, items: [line] }, '/inventario'],
      [{ type: 'item_info', item: 'una perla', rarity: 'C', usable: false, count: 4 }, '/esamina'],
      [{ type: 'show', qty: 4, item: 'una perla', rarity: 'C', usable: false }, '/mostra perla'],
      [{ type: 'recipe_detail', recipe: 'Torre', missing: [], have: [line] }, '/ricetta Torre'],
      [{ type: 'miss', reply: 'dai_not_enough', owned: 4 }, '/dai lucia_b 5 perla'],
      [{ type: 'give', to: 'lucia_b', qty: 1, item: 'una perla' }, '/dai lucia_b perla'],
    ] as const)
      expect(told(s, reply(r, q))).toEqual([]);
  });

  it('a_give_to_the_owner_unless_its_notice_counted_it', () => {
    const give = (more: object = {}): StateEvent => ({
      type: 'give',
      to: OWNER,
      qty: 1,
      item: 'una perla',
      player: 'lucia_b',
      ...more,
    });
    expect(gainedItems(give(), OWNER)).toEqual([['una perla', true]]);
    expect(gainedItems(give({ notified: true }), OWNER)).toEqual([]);
    expect(gainedItems(give({ to: 'gino_x' }), OWNER)).toEqual([]);
    // Another player's own gains are not the owner's.
    expect(
      gainedItems(
        { type: 'gift', from: 'lucia_b', qty: 1, item: 'una perla', player: 'gino_x' },
        OWNER
      )
    ).toEqual([]);
  });

  it('a_guess_resolved_later_is_told_once', () => {
    const s = holding({});
    const raw = `${S}un dado di legno`;
    const first = drop('legno', false, { raw });
    const guessed = reduce(s, toStateEvent(s, first) as StateEvent);
    expect(gains(s, guessed, first).map((g) => g.payload)).toEqual([
      { item: 'legno', sure: false, qty: 1, exact: false },
    ]);
    // A gift of the real item resolves it: the gift is told, the drop not again.
    const gift = reply({ type: 'gift', from: 'lucia_b', qty: 1, item: 'un dado di legno' });
    const resolved = reduce(guessed, toStateEvent(guessed, gift) as StateEvent);
    expect(gains(guessed, resolved, gift).map((g) => g.payload)).toEqual([
      { item: 'un dado di legno', sure: true, qty: 2, exact: false },
    ]);
  });

  it('every_payload_fits_its_schema', () => {
    const s = holding({ 'un sasso': 1 });
    for (const g of gains(s, s, drop('un sasso', true, { raw: `${S}un sasso` })))
      expect(gainedSchema.parse(g.payload)).toEqual(g.payload);
    // An item the state does not hold (none here): a count of 0, not exact.
    expect(gains(initialState(OWNER), initialState(OWNER), drop('un sasso', true))).toEqual([
      { type: 'gained', payload: { item: 'un sasso', sure: true, qty: 0, exact: false } },
    ]);
    expect(gains(s, s, { type: 'other.event', t: T0 } as BusEvent)).toEqual([]);
    expect(gains(s, s, drop(' ', true))).toEqual([]);
  });
});
