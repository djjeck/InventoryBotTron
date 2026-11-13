/**
 * What the owner gained, as the `inventorybot-state` plugin tells it in its own event,
 * `inventorybot-state.gained` (MegaBotTron1999's `StateSpec.events` and `announce`, its D83): one
 * event per item gained, so that a script reacts to an item gained without comparing states.
 * Pure logic only.
 *
 * **A gain** is an event that adds an item the owner did not have a moment before, by the game:
 *
 * - an adventure drop, sure or guessed (`sure: false`, the item its guess), and a lucky drop;
 * - a gift (another player's "ti ha dato");
 * - another player's give to the owner, only when its private notice did not already count it (a
 *   give's `notified`); the parser reads the private chat only, so today a give to the owner comes
 *   as its notice, a gift;
 * - a craft's output;
 * - each item a `/usa` adds (a positive count among its items).
 *
 * **Not a gain:** what only observes the inventory (a listing, an `/esamina`, a `/mostra`, a
 * `/ricetta`, a `/dai` refused with the count owned), even when it raises an estimate, nor the
 * lottery or a Pakkomon fight. A guess resolved later moves the count to its real item but is no
 * new gain: it was told once, with `sure: false`.
 *
 * Each carries the item's count after it and whether that count is exact, as the state holds it.
 */
import { isMine, type State, type StateEvent } from '@inventorybottron/state';
import { type BusEvent } from '@megabottron1999/core';
import { z } from 'zod';
import { toStateEvent } from './state.ts';

/** `inventorybot-state.gained`'s payload. */
export const gainedSchema = z
  .object({
    /** The item gained; for a drop the parser guessed, its guess. */
    item: z.string().describe('Item'),
    /** False for a drop whose item is a guess (its sentence and item both unknown). */
    sure: z.boolean().describe('Sure'),
    /** How many of it the owner holds after the gain, as the state estimates it. */
    qty: z.number().describe('Count'),
    /** Whether that count is exact. */
    exact: z.boolean().describe('Exact'),
  })
  .describe('An item the owner gained: a drop, a gift, a craft, what a use gave');

/** One gain: `inventorybot-state.gained`'s payload. */
export type Gained = z.infer<typeof gainedSchema>;

/** The items a state's event adds to the owner's, with whether each is sure; none for another. */
export function gainedItems(e: StateEvent, player: string | null): [string, boolean][] {
  if (e.type === 'give')
    return e.to === player && e.player !== player && e.notified !== true ? [[e.item, true]] : [];
  if (!isMine(e, player)) return [];
  switch (e.type) {
    case 'drop':
      if (e.kind === 'lucky') return [[e.item, true]];
      return e.resolved ? [[e.resolved, e.sure !== false]] : [];
    case 'gift':
      return e.qty > 0 ? [[e.item, true]] : [];
    case 'craft':
      return e.output ? [[e.output, true]] : [];
    case 'use':
      return e.items.filter((x) => x.qty > 0).map((x): [string, boolean] => [x.name, true]);
    default:
      return [];
  }
}

/**
 * What a parser's event, applied live, gained the owner (`announce`): one `gained` per item, its
 * count and exactness as `after` holds it.
 */
export function gains(
  before: State,
  after: State,
  event: BusEvent
): { type: 'gained'; payload: Gained }[] {
  const e = toStateEvent(before, event);
  if (e === undefined) return [];
  const seen = new Set<string>();
  return gainedItems(e, after.owner.player).flatMap(([item, sure]) => {
    if (item.trim() === '' || seen.has(item)) return [];
    seen.add(item);
    const h = Object.hasOwn(after.inventory.items, item) ? after.inventory.items[item] : undefined;
    return [
      {
        type: 'gained' as const,
        payload: { item, sure, qty: h?.qty ?? 0, exact: h?.exact ?? false },
      },
    ];
  });
}
