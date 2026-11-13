import { describe, expect, it } from 'vitest';
import { at, dm, inventory, line, OWNER } from '#test/events.ts';
import { apply, initialState } from './reduce.ts';
import { type PlayerPakkomon, type State, type StateEvent } from './types.ts';

function run(events: StateEvent[], player: string | null = OWNER): State {
  const s = initialState(player);
  for (const e of events) apply(s, e);
  return s;
}

const ZAMPA = 'Zampa 🐯';
const BRINA = 'Brina 🐸';
const item = (name: string): string => `un Pakkomon di nome ${name}`;
const one = (s: State, name = ZAMPA): PlayerPakkomon | undefined =>
  Object.values(s.pakkomon).find((p) => p.name === name);

const fight = (
  winner: [string, string],
  loser: [string, string],
  min: number,
  o: { hit?: boolean; learned?: boolean; stun?: [number, number | null] | null } = {}
): StateEvent => ({
  type: 'pakkomon_fight',
  winner: { pakkomon: winner[0], owner: winner[1] },
  loser: { pakkomon: loser[0], owner: loser[1] },
  hit: o.hit ?? false,
  ending: null,
  stun_min: o.stun === null ? null : (o.stun?.[0] ?? 10),
  stun_max: o.stun === null ? null : o.stun === undefined ? 20 : o.stun[1],
  move: null,
  prize: null,
  learned: o.learned ?? false,
  wound: null,
  spoils: null,
  player: winner[1],
  date: at(min),
});

const use = (min: number, fields: Record<string, unknown>): StateEvent =>
  dm({ type: 'use', text: '', items: [], ...fields } as StateEvent, min);

describe("the owner's Pakkomon", () => {
  it('from_its_hatching_to_its_giving_and_back', () => {
    const s = run([
      use(0, { pakkomon_use: 'hatch', pakkomon: [ZAMPA], used_item: 'una ghianda' }),
      fight([ZAMPA, OWNER], [BRINA, 'lucia_b'], 1, { learned: true }),
      fight([ZAMPA, OWNER], [BRINA, 'lucia_b'], 2, { stun: [30, null] }),
      fight([BRINA, 'lucia_b'], [ZAMPA, 'MARIO_R'], 3),
      dm(
        {
          type: 'pakkomon_record',
          pakkomon: ZAMPA,
          wins: 2,
          losses: 1,
          equipment: line('una spada di cartone', 'S'),
          stunned_for: 600,
          born: '2026-11-06',
          maker: OWNER,
          power_ups: ['⚡'],
        },
        4
      ),
      dm({ type: 'give', to: 'lucia_b', qty: 1, item: item(ZAMPA) }, 5),
      { type: 'give', to: OWNER, qty: 1, item: item(ZAMPA), player: 'lucia_b', date: at(6) },
    ]);
    expect(one(s)).toStrictEqual({
      name: ZAMPA,
      came: { via: 'hatched', from: 'una ghianda', date: at(0) },
      born: '2026-11-06',
      maker: OWNER,
      first_seen: at(0),
      last_seen: at(6),
      gone: null,
      record: { wins: 2, losses: 1, date: at(4) },
      equipment: 'una spada di cartone',
      power_ups: ['⚡'],
      power_up_items: [],
      fights: { won: 2, lost: 1, learned: 1 },
      best_win: { min: 30, max: null },
      stunned_until: '2026-11-06T12:14:00+00:00',
      probe: null,
    });
    // Only the owner's are followed.
    expect(one(s, BRINA)).toBeUndefined();
  });

  it('a_list_of_all_of_them_tells_which_are_gone', () => {
    const s = run([
      dm({ type: 'pakkomon_ready', pakkomon: ZAMPA }, 0),
      dm({ type: 'pakkomon_challenge', pakkomon: BRINA, opponent: 'lucia_b' }, 0),
      inventory([line(item(BRINA), 'X')], 1),
      dm({ type: 'pakkomon_stunned', pakkomon: BRINA, remaining: 60 }, 2),
      dm({ type: 'pakkomon_stunned', pakkomon: null, remaining: 60 }, 2),
      inventory([line(item(ZAMPA), 'X')], 3, '/inventario Zampa'),
    ]);
    expect(one(s)?.gone).toBeNull();
    expect(one(s, BRINA)?.stunned_until).toBe('2026-11-06T12:03:00+00:00');
    const later = run([
      dm({ type: 'pakkomon_ready', pakkomon: ZAMPA }, 0),
      use(1, { pakkomon_use: 'scan', scan: [{ pakkomon: BRINA, remaining: 0 }] }),
    ]);
    expect(one(later)?.gone).toStrictEqual({ via: 'unlisted', to: null, date: at(1) });
    expect(one(later, BRINA)?.stunned_until).toBeNull();
  });

  it('what_uses_do_to_it', () => {
    const s = run([
      dm({ type: 'gift', from: 'lucia_b', qty: 1, item: item(ZAMPA) }, 0),
      use(1, { pakkomon_use: 'equip', pakkomon: [ZAMPA], takes: ['una spada'] }),
      use(2, { pakkomon_use: 'heal', pakkomon: [ZAMPA] }),
      use(3, { pakkomon_use: 'power_up', pakkomon: [ZAMPA], named: 'una perla' }),
      use(4, { pakkomon_use: 'power_up', pakkomon: [ZAMPA], used_item: 'una perla' }),
      use(5, { pakkomon_use: 'probe', pakkomon: [ZAMPA], reading: 'forte' }),
      use(6, { pakkomon_use: 'scale', pakkomon: [ZAMPA, BRINA] }),
      use(7, { pakkomon_use: 'customise', pakkomon: [ZAMPA] }),
      use(8, { pakkomon_use: 'extract', pakkomon: [BRINA] }),
      use(9, { pakkomon_use: 'power_up' }),
      dm(
        {
          type: 'item_info',
          item: item(ZAMPA),
          rarity: 'X',
          usable: true,
          used_in_raw: null,
          count: 1,
          source: null,
          from_recipe: null,
        },
        10
      ),
      dm({ type: 'show', item: 'una perla', qty: 1, rarity: 'R', usable: false }, 11),
    ]);
    expect(one(s)).toMatchObject({
      came: { via: 'received', from: 'lucia_b', date: at(0) },
      equipment: 'una spada',
      power_up_items: ['una perla'],
      probe: 'forte',
      last_seen: at(10),
    });
    expect(one(s, BRINA)?.gone).toStrictEqual({ via: 'extracted', to: null, date: at(8) });
  });

  it('none_without_an_owner_nor_from_a_forwarded_reply', () => {
    expect(run([dm({ type: 'pakkomon_ready', pakkomon: ZAMPA })], null).pakkomon).toStrictEqual({});
    const fwd = {
      ...dm({ type: 'pakkomon_ready', pakkomon: ZAMPA }),
      forwarded: true,
    } as StateEvent;
    expect(run([fwd]).pakkomon).toStrictEqual({});
    expect(
      run([fight([BRINA, 'lucia_b'], [ZAMPA, OWNER], 0, { hit: true })]).pakkomon
    ).toMatchObject({
      [ZAMPA]: { stunned_until: null, fights: { won: 0, lost: 1, learned: 0 } },
    });
    expect(
      run([fight([ZAMPA, OWNER], [BRINA, 'x'], 0, { stun: null })]).pakkomon[ZAMPA]?.best_win
    ).toBeNull();
    // A date not known neither starts nor ends what is known.
    const undated = run([{ type: 'pakkomon_ready', pakkomon: ZAMPA, dm: true }]);
    expect(undated.pakkomon[ZAMPA]).toMatchObject({ first_seen: null, last_seen: null });
  });
});
