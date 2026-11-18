/**
 * The `inventorybot-state` plugin: the owner's player state at InventoryBot, kept by
 * MegaBotTron1999's `statePlugin` (its docs/bot-os-api.md §5, bot-os.md D72) from the
 * `inventorybot` parser's events, with InventoryBotTron's reducer (`@inventorybottron/state`), as
 * `src/state.ts` reads them.
 *
 * - **Its inputs:** `events`, required, bound to the `inventorybot` parser's events output (the
 *   namespace `inventorybot`): `inventorybot.turn` (the drops) and each kind of private reply,
 *   `inventorybot.<kind>` (`src/replies.ts`: the listings, cards, recipes, crafts, uses, gifts and
 *   gives, places and Pakkomon), since 0.6.0; and, since 0.10.0, the turn parser's `sent` and
 *   `reply`. `parser`, required, bound to the `inventorybot` parser's interface
 *   (`actions.sent`): the sends a shell player tells it of, handed on (MegaBotTron1999's D141).
 * - **The owner's readiness** (since 0.10.0, MegaBotTron1999's D141): when `/avventura` may be
 *   played again, the section `readiness`, reduced by the shell's `ReadinessModel`
 *   (`INVENTORYBOT_READINESS`) from the parser's events: the turn's rest, as the bot states it. A
 *   shell player binds its `state` input here (`state.ready`, `state.commands`, `state.bot`,
 *   `actions.sent`). Its second migration adds the section, empty, to a state kept before.
 * - **Freshness:** a whole listing is a `snapshot` of the inventory; a drop, a use, a craft or any
 *   other change a `delta`; a drop the parser is not sure of `uncertain`.
 * - **Guessed drops:** a guess is counted under its guess, and moved to its item when the parser
 *   resolves it (`inventorybot.resolved`, since 0.7.0). The state resolves nothing itself, and
 *   tells nothing of a correction: its events announce new facts, never corrections of past ones.
 *   Since 0.7.0 it keeps no `drops.pending` (its first migration takes it out of a kept state).
 * - **Its interface:** `state.get`, `state.freshness`, and `state.count({ name })` (how many of an
 *   item the owner holds) and `state.held()` (every item held, with its count); the readiness's
 *   `state.ready`, `state.commands`, `state.bot` and `actions.sent`.
 * - **Its config:** `pin`, by default `inventory.held` (how many items the owner holds) and
 *   `drops.latest` (the latest drops), the line of its card.
 *
 * - **What happened** (since 0.5.0): `inventorybot-state.gained`, one per item the owner gained
 *   (a drop, sure or guessed, a gift, a give to them not counted by its notice, a craft's output,
 *   what a `/usa` gave), `{ item, sure, qty, exact }`, told live only (`src/gains.ts`). A state
 *   plugin offers rich domain events, so that the owner writes a small script on the fly ("when I
 *   find X, …") instead of comparing states.
 * - **The owner's summary** (since 0.8.0, MegaBotTron1999's D92): beside the state plugin's
 *   `N events applied`, a line of what it told since the last summary, `N items gained, M new`
 *   (`summaryLines`): the `gained` events published (live gains only, as they are), new the
 *   items held for the first time (`qty` 1), `, M new` left out at 0; no line when it told none.
 *   Counted in memory only: a restart forgets them.
 *
 * It never sends, and announces each change as `inventorybot-state.changed`, the sections changed;
 * an event its reducer refuses is recorded as `inventorybot-state.refused`.
 */
import { initialState, reduce, type State } from '@inventorybottron/state';
import {
  counted,
  type MigrationStore,
  type Plugin,
  type PluginContext,
  type SummaryLines,
  type SummaryWindow,
  Tally,
} from '@megabottron1999/core';
import { STATE_DOC, statePlugin } from '@megabottron1999/turns/state-plugin.ts';
import { z } from 'zod';
import { gainedSchema, gains } from '#src/gains.ts';
import {
  CONSUMES,
  freshness,
  INVENTORYBOT_READINESS,
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

/**
 * Its store's migrations: the first (0.7.0) takes `drops.pending` out of a kept state, now that the
 * parser keeps the guesses; the second (0.10.0) adds the readiness's section, nothing known yet.
 */
export const MIGRATIONS = [
  (store: MigrationStore): void => {
    const kept = store.read<{ state?: { drops?: Record<string, unknown> } }>(STATE_DOC);
    if (kept?.state?.drops === undefined || !('pending' in kept.state.drops)) return;
    delete kept.state.drops['pending'];
    store.write(STATE_DOC, kept);
  },
  (store: MigrationStore): void => {
    const kept = store.read<{ state?: Record<string, unknown> }>(STATE_DOC);
    if (kept?.state === undefined || kept.state['readiness'] !== undefined) return;
    store.write(STATE_DOC, {
      ...kept,
      state: { ...kept.state, readiness: INVENTORYBOT_READINESS.initial() },
    });
  },
];

const base = statePlugin<Kept>({
  id: INVENTORYBOT_STATE,
  description: "The owner's state at @InventoryBot: the inventory, the items, recipes and places",
  schema: stateSchema,
  initial: initialState() as Kept,
  consumes: CONSUMES,
  // The owner's readiness, the parser's events reduced by the shell (D141): the turn's rest only.
  readiness: INVENTORYBOT_READINESS,
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
  migrations: MIGRATIONS,
  events: { gained: gainedSchema },
  announce: gains,
  queries: {
    count: {
      help: 'How many of an item the owner holds, as the state estimates it',
      input: z.object({ name: z.string() }),
      output: z.number(),
      run: (s, input: { name: string }) => {
        // An item is named by a player: only an own property counts (not `constructor`'s).
        const items = held(s);
        return Object.hasOwn(items, input.name) ? (items[input.name] ?? 0) : 0;
      },
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

/** Its `gained` events, as its bus publishes them. */
const GAINED = `${INVENTORYBOT_STATE}.gained`;

/**
 * Its line in the owner's summary for a window (D92): the items it told gained, and of them those
 * new (held for the first time, `qty` 1), counted as `gained` and `new` in `tally`; none when it
 * told none, so that a quiet window adds nothing.
 */
export function summaryLines(tally: Tally, w: SummaryWindow): string[] {
  const gained = tally.count('gained', w);
  if (gained === 0) return [];
  const fresh = tally.count('new', w);
  return [`${counted(gained, 'item')} gained${fresh > 0 ? `, ${fresh} new` : ''}`];
}

/**
 * Its node: the state plugin's, with its gains counted as they are published, and its own line
 * added to the state plugin's in the owner's summary (one section, its node's).
 */
const create = (ctx: PluginContext): ReturnType<Plugin['create']> => {
  const tally = new Tally(ctx.clock);
  const bus: PluginContext['bus'] = {
    ...ctx.bus,
    publish: (type, payload, t) => {
      if (type === GAINED) {
        tally.add('gained');
        if (payload['qty'] === 1) tally.add('new');
      }
      ctx.bus.publish(type, payload, t);
    },
  };
  const summary = ctx.summary;
  return base.create({
    ...ctx,
    bus,
    ...(summary === undefined
      ? {}
      : {
          summary: {
            ...summary,
            contribute: (lines: SummaryLines) =>
              summary.contribute((w) => [...(lines(w) ?? []), ...summaryLines(tally, w)]),
          },
        }),
  });
};

export const inventorybotStatePlugin: Plugin = {
  ...base,
  manifest: { ...base.manifest, config },
  create,
};

/** The module's plugin entry (MegaBotTron1999's docs/bot-os-api.md §7.2). */
export const plugins: Plugin[] = [inventorybotStatePlugin];
