import { describe, expect, it } from 'vitest';
import { instant, isoDateSeconds, isoOf, isoPlusSeconds } from './dates.ts';
import {
  inventoryScope,
  isFailedUse,
  isMine,
  type Listing,
  nameKey,
  pakkomonOf,
  queryArg,
  renamed,
  sameTransfer,
} from './rules.ts';

const listing = (query: string | null, o: Partial<Listing> = {}): Listing =>
  ({ type: 'inventory', filtered: true, truncated: false, items: [], query, ...o }) as Listing;

describe('the rules', () => {
  it('whose_a_reply_is', () => {
    const cases: [Parameters<typeof isMine>[0], boolean][] = [
      [{ player: 'mario_r' }, true],
      [{ player: 'lucia_b', dm: true }, false],
      [{ dm: true }, true],
      [{ dm: false }, false],
      [{ dm: true, forwarded: true }, false],
      [{ player: 'mario_r', broadcast: true }, false],
      [{}, false],
    ];
    for (const [e, want] of cases) expect(isMine(e, 'mario_r'), JSON.stringify(e)).toBe(want);
  });

  it('a_commands_argument', () => {
    expect(queryArg('/ricetta Torre', '/ricetta')).toBe('Torre');
    expect(queryArg('/RICETTA', '/ricetta')).toBe('');
    expect(queryArg('/ricettario', '/ricetta')).toBeNull();
    expect(queryArg(null, '/ricetta')).toBeNull();
  });

  it('the_scope_of_an_inventory_listing', () => {
    const rarity = (n: string): string | null =>
      ({ a: 'C', b: 'C+', c: 'L2', d: 'L1', e: null })[n] ?? null;
    const covered = (query: string | null, o: Partial<Listing> = {}): string[] | null => {
      const scope = inventoryScope(listing(query, o), rarity);
      return scope === null ? null : ['a', 'b', 'c', 'd', 'e'].filter(scope);
    };
    expect(covered('/inventario')).toStrictEqual(['a', 'b', 'c', 'd', 'e']);
    expect(covered('/i c')).toStrictEqual(['a', 'b']);
    expect(covered('/inventario C+')).toStrictEqual(['b']);
    expect(covered('/inventario L')).toStrictEqual(['c', 'd']);
    expect(covered('/inventario L2')).toStrictEqual(['c']);
    expect(covered('/inventario M')).toBeNull();
    expect(covered('/inventario a')).toStrictEqual(['a']);
    expect(covered('/collezioni')).toStrictEqual(['a', 'b', 'c', 'd', 'e']);
    expect(covered('/inv2 3')).toBeNull();
    expect(covered(null)).toBeNull();
    expect(covered(null, { exported: true })).toStrictEqual(['a', 'b', 'c', 'd', 'e']);
    expect(covered('/inventario', { truncated: true })).toBeNull();
    expect(inventoryScope({ type: 'cooldown' }, rarity)).toBeNull();
  });

  it('failed_uses_names_and_pakkomon', () => {
    expect(isFailedUse('@u, non hai abbastanza ghiande')).toBe(true);
    expect(isFailedUse('Rarità ammesse: C, N')).toBe(true);
    expect(isFailedUse('@u, apri il barattolo')).toBe(false);
    expect(nameKey('Zampa  🐯️ ')).toBe('Zampa 🐯');
    expect(pakkomonOf('un Pakkomon di nome Zampa 🐯')).toBe('Zampa 🐯');
    expect(pakkomonOf('un sasso')).toBeNull();
  });

  it('renames_the_items_of_an_event', () => {
    const r = new Map([['un sasso', 'una perla']]);
    expect(
      renamed(
        {
          type: 'craft',
          ingredients: [{ name: 'un sasso', qty: 1 }],
          output: 'un sasso',
          flavor: 'un sasso',
        },
        r
      )
    ).toStrictEqual({
      type: 'craft',
      ingredients: [{ name: 'una perla', qty: 1 }],
      output: 'una perla',
      flavor: 'un sasso',
    });
    const stats = { type: 'stats', item: 'un sasso' };
    expect(renamed(stats, r)).toBe(stats);
    expect(renamed({ type: 'drop', resolved: 'una spada', items: 'x' }, r)).toStrictEqual({
      type: 'drop',
      resolved: 'una spada',
      items: 'x',
    });
  });

  it('the_two_messages_of_one_transfer', () => {
    const give = {
      date: '2026-11-06T12:00:00+01:00',
      item: 'una perla',
      qty: 2,
      player: 'lucia_b',
    };
    const gift = { date: '2026-11-06T11:02:00+00:00', item: 'una perla', qty: 2, from: 'lucia_b' };
    expect(sameTransfer(give, gift)).toBe(true);
    expect(sameTransfer(give, { ...gift, qty: 1 })).toBe(false);
    expect(sameTransfer(give, { ...gift, date: '2026-11-06T11:02:01+00:00' })).toBe(false);
    expect(sameTransfer(give, { ...gift, date: null })).toBe(false);
  });
});

describe('the dates', () => {
  it('compare_as_instants', () => {
    expect(instant('2026-11-06T12:00:00+01:00')).toBe(instant('2026-11-06T11:00:00+00:00'));
    expect(instant('2026-11-06T12:00:00+01:00')).toBe(instant('2026-11-06T12:00:00+01:00'));
    expect(instant(null)).toBe(-Infinity);
    expect(instant('ieri')).toBe(-Infinity);
    for (const bad of [
      '2026-02-30T12:00:00+00:00',
      '2026-11-06T12:00:00+24:00',
      '2026-11-06T12:00:00+01:60',
    ])
      expect(isoDateSeconds(bad)).toBeNull();
  });

  it('later_with_the_same_offset', () => {
    expect(isoPlusSeconds('2026-12-31T23:30:00-05:30', 3600)).toBe('2027-01-01T00:30:00-05:30');
    expect(isoPlusSeconds('ieri', 1)).toBeNull();
    expect(isoOf(Date.parse('2026-11-06T12:00:00.900Z'))).toBe('2026-11-06T12:00:00+00:00');
  });
});
