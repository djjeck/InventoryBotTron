/**
 * A guess corrected: the owner's drop whose item its reader guessed (`sure: false`), counted under
 * the guess, whose real item the reader learned since and tells in a `resolved` event. The reader
 * owns the resolution (it knows every item and sentence it has read, any player's); the state only
 * records it: the count moves from the guess to the item, the item is seen at the drop's date, and
 * the drop among the latest is named by its item. Pure logic only.
 *
 * The count moves only while the guess is still counted: a listing since (a whole inventory, or one
 * whose scope held the guess) has counted the drop as whatever it was, and set the guess to what it
 * listed, so moving it again would count the drop twice (issue #1). A reader tells a resolution
 * before the reply that taught it, so a listing that names the item counts it after the move.
 */
import { type Holdings } from './holdings.ts';
import { seen } from './seen.ts';
import { type ResolvedEvent, type State } from './types.ts';

/** Applies a resolved guess, in place. */
export function applyResolved(s: State, e: ResolvedEvent, hold: Holdings): void {
  if (e.item === '') return;
  const facts = { rarity: e.rarity, tags: e.usable ? ['usabile'] : [] };
  if (e.item !== e.guess && (hold.get(e.guess)?.qty ?? 0) > 0) {
    hold.delta(e.guess, -1, e.dropped);
    hold.delta(e.item, 1, e.dropped, facts);
  }
  seen(s, e.item, e.dropped);
  const gain = s.drops.latest.find((g) => !g.sure && g.item === e.guess && g.date === e.dropped);
  if (gain !== undefined) Object.assign(gain, { item: e.item, sure: true });
}
