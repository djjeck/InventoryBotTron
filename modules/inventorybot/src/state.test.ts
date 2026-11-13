import { apply, initialState, type State } from '@inventorybottron/state';
import { type BusEvent } from '@megabottron1999/core';
import { describe, expect, it } from 'vitest';
import { replyBus } from '#test/events.ts';
import { freshness, stateSchema, toStateEvent } from './state.ts';

const T0 = Date.parse('2026-11-06T12:00:00Z');
const AT = '2026-11-06T12:00:00+00:00';

const turn = (outcome: Record<string, unknown>): BusEvent =>
  ({ type: 'inventorybot.turn', t: T0, chat: '@InventoryBot', outcome }) as BusEvent;
const reply = (r: Record<string, unknown>, query: string | null, self?: string): BusEvent =>
  replyBus(r, query, { ...(self === undefined ? {} : { self }), playback: true });
const gain = (more: Record<string, unknown> = {}) =>
  turn({
    kind: 'gain',
    bot: 'InventoryBot',
    item: 'una perla',
    rarity: 'R',
    tags: [],
    sure: true,
    ...more,
  });

/** A state holding `items` (name to count), having seen them. */
function holding(items: Record<string, number>): State {
  const s = initialState();
  apply(s, {
    type: 'inventory',
    filtered: false,
    truncated: true,
    items: Object.entries(items).map(([name, qty]) => ({ name, rarity: 'C', usable: true, qty })),
    dm: true,
  });
  return s;
}

describe("the parser's events, as the state's", () => {
  it('a_gain_is_a_drop_and_anything_else_nothing', () => {
    const s = initialState();
    expect(
      toStateEvent(s, gain({ raw: 'trovi una perla', tags: ['usabile'], sure: false }))
    ).toEqual({
      type: 'drop',
      kind: 'adventure',
      raw: 'trovi una perla',
      rarity: 'R',
      usable: true,
      sure: false,
      dm: true,
      date: AT,
      resolved: 'una perla',
    });
    // Without its narrative (published before 0.2.0): sure, a delimited item; else a guess.
    expect(toStateEvent(s, gain())).toMatchObject({ kind: 'lucky', item: 'una perla' });
    expect(toStateEvent(s, gain({ sure: false, tags: undefined }))).toMatchObject({
      kind: 'adventure',
      raw: 'una perla',
      usable: false,
    });
    expect(toStateEvent(s, turn({ kind: 'nothing', reason: 'cooldown' }))).toBeUndefined();
    expect(toStateEvent(s, { type: 'inventorybot.turn', t: T0 } as BusEvent)).toBeUndefined();
    expect(toStateEvent(s, { type: 'inventorybot.other', t: T0 } as BusEvent)).toBeUndefined();
    expect(toStateEvent(s, { type: 'other.inventory', t: T0 } as BusEvent)).toBeUndefined();
  });

  it('a_reply_is_the_owners_its_use_and_recipe_found_by_the_words_of_its_command', () => {
    const use = { type: 'use', text: '', items: [] };
    const s = holding({ 'un barattolo di miele': 1, 'un dado di legno': 1, 'un sasso': 0 });
    expect(toStateEvent(s, reply(use, '/usa miele # @lucia_b', 'mario_r'))).toEqual({
      ...use,
      dm: true,
      date: AT,
      query: '/usa miele # @lucia_b',
      player: 'mario_r',
      used_item: 'un barattolo di miele',
    });
    // Held first, else seen; several or none: not known.
    expect(toStateEvent(s, reply(use, '/usa sasso', undefined))).toMatchObject({
      used_item: 'un sasso',
    });
    expect(toStateEvent(s, reply(use, '/usa un', undefined))).not.toHaveProperty('used_item');
    expect(toStateEvent(s, reply(use, '/usa spada', undefined))).not.toHaveProperty('used_item');
    expect(toStateEvent(s, reply(use, '/usa', undefined))).not.toHaveProperty('used_item');
    expect(toStateEvent(s, reply(use, null))).toMatchObject({ query: null });
    expect(toStateEvent(s, reply({ ...use, used_item: 'x' }, '/usa miele'))).toMatchObject({
      used_item: 'x',
    });
    const craft = { type: 'craft', ingredients: [], output: null, flavor: '' };
    s.recipe_list = {
      date: null,
      truncated: false,
      recipes: { Muro: 'pronta', 'Merenda veloce': 'manca 1' },
    };
    s.recipes['Torre'] = { crafted: 1, last_crafted: null };
    expect(toStateEvent(s, reply(craft, '/ricetta muro'))).toMatchObject({ recipe: 'Muro' });
    expect(toStateEvent(s, reply(craft, '/ricetta torre'))).toMatchObject({ recipe: 'Torre' });
    expect(toStateEvent(s, reply(craft, '/ricetta r'))).not.toHaveProperty('recipe');
    expect(toStateEvent(s, reply({ ...craft, recipe: 'Muro' }, '/ricetta torre'))).toMatchObject({
      recipe: 'Muro',
    });
    expect(toStateEvent(initialState(), reply(craft, '/ricetta torre'))).not.toHaveProperty(
      'recipe'
    );
  });

  it('a_reply_of_each_kind_is_its_grammar_event_without_the_bus_or_the_context', () => {
    const items = [{ name: 'un sasso', rarity: 'C', usable: false, qty: 2 }];
    const inventory = { type: 'inventory', filtered: false, truncated: false, items };
    expect(toStateEvent(initialState(), reply(inventory, '/inventario', 'mario_r'))).toEqual({
      ...inventory,
      dm: true,
      date: AT,
      query: '/inventario',
      player: 'mario_r',
    });
    const miss = { type: 'miss', reply: 'dai_not_enough', command: '/dai', owned: 2 };
    expect(toStateEvent(initialState(), reply(miss, '/dai lucia_b 3 sasso'))).toEqual({
      ...miss,
      dm: true,
      date: AT,
      query: '/dai lucia_b 3 sasso',
    });
  });

  it('the_schema_takes_every_state', () => {
    expect(stateSchema.safeParse(initialState()).success).toBe(true);
    expect(stateSchema.safeParse(holding({ 'un sasso': 2 })).success).toBe(true);
  });
});

describe('the freshness', () => {
  const inv = (query: string | null, o: Record<string, unknown> = {}) =>
    reply({ type: 'inventory', filtered: false, truncated: false, items: [], ...o }, query);

  it('a_whole_listing_is_a_snapshot', () => {
    for (const q of ['/inventario', '/i', '/collezioni', '/inv2'])
      expect(freshness(inv(q), []), q).toEqual({ inventory: 'snapshot' });
    expect(freshness(inv(null, { exported: true }), ['items'])).toEqual({
      items: 'delta',
      inventory: 'snapshot',
    });
  });

  it('a_part_of_one_or_any_other_change_a_delta', () => {
    expect(freshness(inv('/inventario C'), ['inventory'])).toEqual({ inventory: 'delta' });
    expect(freshness(inv('/inventario', { truncated: true }), ['inventory'])).toEqual({
      inventory: 'delta',
    });
    expect(freshness(inv(null), [])).toEqual({});
    expect(freshness(reply({ type: 'use' }, '/usa x'), ['inventory'])).toEqual({
      inventory: 'delta',
    });
    expect(freshness(gain(), ['inventory', 'drops'])).toEqual({
      inventory: 'delta',
      drops: 'delta',
    });
  });

  it('a_guess_uncertain', () => {
    expect(freshness(gain({ sure: false }), ['owner', 'inventory', 'drops'])).toEqual({
      owner: 'delta',
      inventory: 'uncertain',
      drops: 'uncertain',
    });
    expect(freshness(turn({ kind: 'nothing' }), [])).toEqual({});
  });
});
