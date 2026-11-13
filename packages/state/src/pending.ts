/**
 * The drops whose item is a guess (`drops.pending`), resolved when an event teaches their item.
 *
 * A drop's item is not delimited from its sentence (docs/bot-protocol.md 6.1): a reader that knew
 * neither guesses it (`sure: false`), and the state counts the drop under its guess and keeps it
 * pending, with its narrative. Each later event teaches item names (a listing's, a recipe's, a
 * craft's, a `/mostra`'s, a gift's) and a sure drop teaches its sentence too; a pending drop that
 * one of them resolves (the grammar's `resolveDrop`: a taught item that ends its narrative, or a
 * taught sentence that starts it) moves its count from the guess to its item, unless the event
 * itself set that holding exactly (a listing that already counts it), and stops being pending.
 * Pure logic only.
 */
import { resolveDrop } from '@inventorybottron/grammar';
import { type Holdings } from './holdings.ts';
import { seen } from './seen.ts';
import { type State, type StateEvent } from './types.ts';

/** At most this many drops kept pending, the oldest dropped first. */
export const MAX_PENDING = 50;
/** At most this many of the latest drops kept. */
export const MAX_LATEST = 10;

/** The item names an event gives delimited. */
export function taughtItems(e: StateEvent): string[] {
  switch (e.type) {
    case 'inventory':
    case 'title':
    case 'use':
      return e.items.map((i) => i.name);
    case 'recipe_detail':
      return [...e.missing, ...e.have].map((i) => i.name);
    case 'craft':
      return [...e.ingredients.map((i) => i.name), ...(e.output ? [e.output] : [])];
    case 'show':
    case 'item_info':
    case 'gift':
    case 'give':
      return [e.item];
    case 'drop':
      return e.kind === 'lucky' ? [e.item] : e.resolved && e.sure !== false ? [e.resolved] : [];
    default:
      return [];
  }
}

/**
 * The sentence a sure adventure drop teaches: its narrative before its item, in both forms a
 * reader may find it in (a final space, or a line break before a player-made name).
 */
function taughtPrefixes(e: StateEvent): string[] {
  if (e.type !== 'drop' || e.kind !== 'adventure' || !e.resolved || e.sure === false) return [];
  if (!e.raw.endsWith(e.resolved) || e.raw.length === e.resolved.length) return [];
  const prefix = e.raw.slice(0, e.raw.length - e.resolved.length);
  return prefix.endsWith(' ') ? [prefix, `${prefix.slice(0, -1)}\n`] : [prefix];
}

/** Resolves the pending drops that what `e` teaches resolves, in place. */
export function learnFrom(s: State, e: StateEvent, hold: Holdings): void {
  if (s.drops.pending.length === 0) return;
  const items = new Set(taughtItems(e).filter((n) => n.trim() !== ''));
  const prefixes = taughtPrefixes(e);
  if (items.size === 0 && prefixes.length === 0) return;
  s.drops.pending = s.drops.pending.filter((p) => {
    const found = resolveDrop(p.raw, { items, prefixes });
    if (found === null || found.item === '') return true;
    if (found.item !== p.guess) {
      if (!hold.exactNow.has(p.guess)) hold.delta(p.guess, -1, p.date);
      if (!hold.exactNow.has(found.item))
        hold.delta(found.item, 1, p.date, { rarity: p.rarity, tags: p.tags });
    }
    seen(s, found.item, p.date);
    const gain = s.drops.latest.find((g) => !g.sure && g.item === p.guess && g.date === p.date);
    if (gain !== undefined) Object.assign(gain, { item: found.item, sure: true });
    return false;
  });
}
