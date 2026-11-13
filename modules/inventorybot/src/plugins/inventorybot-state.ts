/**
 * The `inventorybot-state` plugin: the owner's player state at InventoryBot, kept by
 * MegaBotTron1999's `statePlugin` (its docs/bot-os-api.md §5, bot-os.md D72) from the
 * `inventorybot` parser's events, with InventoryBotTron's reducer (`@inventorybottron/state`), as
 * `src/state.ts` reads them.
 *
 * - **Its input:** `events`, required, bound to the `inventorybot` parser's events output (the
 *   namespace `inventorybot`): `inventorybot.turn` (the drops) and `inventorybot.reply` (the
 *   private replies that list, show or move the owner's items).
 * - **Freshness:** a whole listing is a `snapshot` of the inventory; a drop, a use, a craft or any
 *   other change a `delta`; a drop the parser is not sure of `uncertain`.
 * - **Pending drops:** a guess is counted and kept in `drops.pending`, with its narrative, until an
 *   event teaches its item, when the reducer moves its count to the item.
 * - **Its interface:** `state.get`, `state.freshness`, and `state.count({ name })` (how many of an
 *   item the owner holds) and `state.held()` (every item held, with its count).
 * - **Its config:** `pin`, by default `inventory.held` (how many items the owner holds) and
 *   `drops.latest` (the latest drops), the line of its card.
 *
 * It never sends, and announces each change as `inventorybot-state.changed`, the sections changed;
 * an event its reducer refuses is recorded as `inventorybot-state.refused`.
 */
import { initialState, reduce, type State } from '@inventorybottron/state';
import { type Plugin } from '@megabottron1999/core';
import { statePlugin } from '@megabottron1999/turns/state-plugin.ts';
import { z } from 'zod';
import {
  CONSUMES,
  freshness,
  INVENTORYBOT_STATE,
  PINS,
  stateSchema,
  toStateEvent,
} from '#src/state.ts';

/** The state, as `statePlugin` keeps it: an object of sections. */
type Kept = State & Record<string, unknown>;

const held = (s: State): Record<string, number> =>
  Object.fromEntries(
    Object.entries(s.inventory.items).flatMap(([n, h]) => (h.qty > 0 ? [[n, h.qty]] : []))
  );

const base = statePlugin<Kept>({
  id: INVENTORYBOT_STATE,
  description: "The owner's state at @InventoryBot: the inventory, the items, recipes and places",
  schema: stateSchema,
  initial: initialState() as Kept,
  consumes: CONSUMES,
  reduce: (state, event) => {
    const e = toStateEvent(state, event);
    if (e === undefined) return state;
    // The owner's username, once a reply carries it: their own replies are known as theirs.
    const self = event['self'];
    const owned =
      state.owner.player === null && typeof self === 'string'
        ? { ...state, owner: { ...state.owner, player: self } }
        : state;
    return reduce(owned, e) as Kept;
  },
  freshness,
  queries: {
    count: {
      help: 'How many of an item the owner holds, as the state estimates it',
      input: z.object({ name: z.string() }),
      output: z.number(),
      run: (s, input: { name: string }) => held(s)[input.name] ?? 0,
    },
    held: {
      help: 'Every item the owner holds, with its count',
      output: z.record(z.string(), z.number()),
      run: (s) => held(s),
    },
  },
});

/** Its node's config: the state plugin's, with the pins the owner wants first by default. */
const config = (base.manifest.config as z.ZodObject<{ pin: z.ZodDefault<z.ZodArray> }>).extend({
  pin: (base.manifest.config as z.ZodObject<{ pin: z.ZodDefault<z.ZodArray> }>).shape.pin
    .unwrap()
    .default(PINS)
    .describe(
      'Paths of the state (dotted: inventory.held) drawn first in its panel; the first two make the line on its card'
    ),
});

export const inventorybotStatePlugin: Plugin = {
  ...base,
  manifest: { ...base.manifest, config },
};

/** The module's plugin entry (MegaBotTron1999's docs/bot-os-api.md §7.2). */
export const plugins: Plugin[] = [inventorybotStatePlugin];
