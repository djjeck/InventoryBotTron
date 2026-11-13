/**
 * The state's tests' events: the grammar's events with their context, in the invented universe
 * (scripts/universe.md), the owner `mario_r`.
 */
import { type ItemLine } from '@inventorybottron/grammar';
import { isoOf } from '#src/dates.ts';
import { type StateEvent } from '#src/types.ts';

export const OWNER = 'mario_r';
export const T0 = Date.parse('2026-11-06T12:00:00Z');

/** The date `min` minutes after T0. */
export const at = (min: number): string => isoOf(T0 + min * 60_000);

/** An item line. */
export const line = (
  name: string,
  rarity: string | null = 'C',
  qty = 1,
  usable = false
): ItemLine => ({
  name,
  rarity,
  usable,
  qty,
});

/** One of the owner's replies in the private chat, `min` minutes after T0. */
export function dm<E extends StateEvent>(e: E, min = 0, query?: string): E {
  return { ...e, dm: true, date: at(min), ...(query === undefined ? {} : { query }) };
}

/** An inventory listing of the owner's. */
export const inventory = (
  items: ItemLine[],
  min = 0,
  query = '/inventario',
  o: { filtered?: boolean; truncated?: boolean; exported?: true } = {}
): StateEvent =>
  dm(
    {
      type: 'inventory',
      filtered: o.filtered ?? query !== '/inventario',
      truncated: o.truncated ?? false,
      items,
      ...(o.exported ? { exported: true as const } : {}),
    },
    min,
    query
  );

/** An adventure drop of the owner's, its item resolved (a guess unless `sure`). */
export const drop = (
  raw: string,
  item: string,
  min = 0,
  o: { sure?: boolean; rarity?: string; usable?: boolean; location?: string } = {}
): StateEvent =>
  dm(
    {
      type: 'drop',
      kind: 'adventure',
      raw,
      rarity: o.rarity ?? 'C',
      usable: o.usable ?? false,
      resolved: item,
      ...(o.sure === undefined ? {} : { sure: o.sure }),
      ...(o.location === undefined ? {} : { location: o.location }),
    },
    min,
    '/avventura'
  );
