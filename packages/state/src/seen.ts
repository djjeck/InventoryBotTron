/** The items the owner has seen, and the shapes of their shaped items. Pure logic only. */
import { shapeOf, unshaped } from '@inventorybottron/grammar';
import { instant } from './dates.ts';
import { ensure, put } from './records.ts';
import { type PlayerShape, type State } from './types.ts';

/** The shapes an item had: `shape`, seen at `date`. */
export function shaped(s: State, item: string, shape: string | null, date: string | null): void {
  if (shape === null) return;
  const shapes = ensure(s.shapes, item, (): PlayerShape[] => []);
  const sh = shapes.find((x) => x.shape === shape);
  if (sh === undefined) shapes.push({ shape, first_seen: date, last_seen: date });
  else {
    if (instant(date) < instant(sh.first_seen)) sh.first_seen = date;
    if (instant(date) > instant(sh.last_seen)) sh.last_seen = date;
  }
}

/** An item seen at `date`: its first sighting, and its shape. */
export function seen(s: State, name: string | null | undefined, date: string | null): void {
  if (!name) return;
  if (!Object.hasOwn(s.items, name)) put(s.items, name, { first_seen: date });
  shaped(s, unshaped(name), shapeOf(name), date);
}
