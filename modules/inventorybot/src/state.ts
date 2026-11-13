/**
 * The `inventorybot-state` plugin's reading of the parser's events: each one as the player state's
 * event (`@inventorybottron/state`), its schema, and the freshness it gives the sections. Pure
 * logic only.
 *
 * - **`inventorybot.turn`**: a `gain` is the owner's drop, its item resolved by the parser; a guess
 *   (`sure: false`) is applied as one, counted under its guess. A gain of before 0.2.0, without
 *   `raw`, is a lucky drop if sure, and a guess whose narrative is its item if not. Any other
 *   outcome changes nothing.
 * - **`inventorybot.resolved`** (since 0.7.0): the parser's correction of one of those guesses, the
 *   state's `resolved` event: the count moves from the guess to the item. The parser resolves; the
 *   state only records.
 * - **`inventorybot.<kind>`** (`src/replies.ts`, since 0.6.0): the grammar's event of a private
 *   reply, the owner's (`dm`, and their username when the account knows it), read with the command
 *   it answers. What the reply leaves
 *   to its command is resolved as the bot resolves it, by the words of the command's argument
 *   (docs/bot-protocol.md §3): a `/usa`'s item among those held (else those seen), a craft's
 *   recipe among those listed or made.
 */
import { INVENTORY_COMMANDS, INVENTORY_LIST_COMMANDS } from '@inventorybottron/grammar';
import { isoOf, queryArg, type State, type StateEvent } from '@inventorybottron/state';
import { type BusEvent } from '@megabottron1999/core';
import { type Mark } from '@megabottron1999/turns/state-plugin.ts';
import { z } from 'zod';
import { CONTEXT_FIELDS, REPLY_KINDS, replyEvent, type ReplyKind, replyKindOf } from './replies.ts';
import { RESOLVED_EVENT, type resolvedSchema } from './resolved.ts';

/** The plugin's id, and the namespace of its events (`inventorybot-state.changed`). */
export const INVENTORYBOT_STATE = 'inventorybot-state';

/** The parser's events it applies: the turns, and each kind of private reply. */
export const CONSUMES: readonly string[] = [
  'inventorybot.turn',
  ...REPLY_KINDS.map(replyEvent),
  RESOLVED_EVENT,
];

/** The paths of the state its node's panel draws first, and its card's line. */
export const PINS = ['inventory.held', 'drops.latest'];

const date = z.string().nullable();
const holding = z.object({
  qty: z.number().describe('Count'),
  exact: z.boolean().describe('Exact'),
  date: date.describe('Set'),
  via: z.string().describe('By'),
  rarity: z.string().nullable().describe('Rarity'),
  tags: z.array(z.string()).describe('Tags'),
});
const gain = z.object({
  item: z.string().describe('Item'),
  rarity: z.string().describe('Rarity'),
  tags: z.array(z.string()).describe('Tags'),
  date: date.describe('When'),
  sure: z.boolean().describe('Sure'),
});
const pakkomon = z.object({
  name: z.string().describe('Name'),
  came: z
    .object({ via: z.enum(['hatched', 'received']), from: z.string().nullable(), date })
    .nullable()
    .describe('Came'),
  born: z.string().nullable().describe('Born'),
  maker: z.string().nullable().describe('Maker'),
  first_seen: date.describe('First seen'),
  last_seen: date.describe('Last seen'),
  gone: z
    .object({ via: z.enum(['given', 'extracted', 'unlisted']), to: z.string().nullable(), date })
    .nullable()
    .describe('Gone'),
  record: z.object({ wins: z.number(), losses: z.number(), date }).nullable().describe('Record'),
  equipment: z.string().nullable().describe('Equipment'),
  power_ups: z.array(z.string()).describe('Power-ups'),
  power_up_items: z.array(z.string()).describe('Power-up items'),
  fights: z.object({ won: z.number(), lost: z.number(), learned: z.number() }).describe('Fights'),
  best_win: z
    .object({ min: z.number(), max: z.number().nullable() })
    .nullable()
    .describe('Widest win'),
  stunned_until: date.describe('Stunned until'),
  probe: z.string().nullable().describe('Probe'),
});

/** The state's schema: its sections, each described for the panel. */
export const stateSchema = z.object({
  owner: z
    .object({
      player: z.string().nullable().describe('Player'),
      as_of: date.describe('Latest event'),
    })
    .describe('Owner'),
  inventory: z
    .object({
      held: z.number().describe('Items held'),
      items: z.record(z.string(), holding).describe('Items'),
    })
    .describe('Inventory'),
  items: z
    .record(
      z.string(),
      z.object({
        first_seen: date.describe('First seen'),
        used: z.number().optional().describe('Used'),
        last_used: date.optional().describe('Last used'),
      })
    )
    .describe('Items seen'),
  recipes: z
    .record(
      z.string(),
      z.object({ crafted: z.number().describe('Made'), last_crafted: date.describe('Last made') })
    )
    .describe('Recipes made'),
  recipe_list: z
    .object({
      date,
      truncated: z.boolean(),
      recipes: z.record(z.string(), z.string()),
    })
    .nullable()
    .describe('Recipe list'),
  inventory_check: z
    .object({ compared: z.number().describe('Compared'), agreed: z.number().describe('Agreed') })
    .describe('Estimate checked'),
  locations: z
    .record(
      z.string(),
      z.object({
        visited: z.boolean().describe('Visited'),
        adventures: z.number().describe('Adventures'),
      })
    )
    .describe('Places'),
  pakkomon: z.record(z.string(), pakkomon).describe('Pakkomon'),
  shapes: z
    .record(z.string(), z.array(z.object({ shape: z.string(), first_seen: date, last_seen: date })))
    .describe('Shapes'),
  drops: z
    .object({
      latest: z.array(gain).describe('Latest drops'),
    })
    .describe('Drops'),
});

/** The words of a command's argument, lower case, before any `#`; none without one. */
function words(query: string | null | undefined, command: string): string[] {
  const arg = queryArg(query, command);
  if (arg === null) return [];
  return (arg.split('#')[0] ?? '')
    .toLowerCase()
    .split(/\s+/u)
    .filter((w) => w !== '');
}

/** The one name of each pool in turn whose every word `ws` holds (the bot's lookup), if one. */
function lookup(ws: readonly string[], ...pools: (() => string[])[]): string | undefined {
  if (ws.length === 0) return undefined;
  for (const pool of pools) {
    const found = pool().filter((n) => ws.every((w) => n.toLowerCase().includes(w)));
    if (found.length === 1) return found[0];
    if (found.length > 1) return undefined;
  }
  return undefined;
}

/** A bus event's own fields, which are not its payload's. */
const BUS_FIELDS: ReadonlySet<string> = new Set(['type', 't', 'instance']);

/** A reply's event as the state applies it, what its command names resolved against the state. */
function fromReply(s: State, e: BusEvent, kind: ReplyKind): StateEvent {
  const fields = Object.fromEntries(
    Object.entries(e).filter(([k]) => !BUS_FIELDS.has(k) && !CONTEXT_FIELDS.includes(k))
  );
  const query = (e['query'] as string | null | undefined) ?? null;
  const self = e['self'] as string | undefined;
  const ev = {
    ...fields,
    type: kind,
    dm: true,
    date: isoOf(e.t),
    query,
    ...(self === undefined ? {} : { player: self }),
  } as StateEvent;
  if (ev.type === 'use' && ev.used_item === undefined) {
    const item = lookup(
      words(query, '/usa'),
      () => Object.keys(s.inventory.items).filter((n) => (s.inventory.items[n]?.qty ?? 0) > 0),
      () => Object.keys(s.items)
    );
    if (item !== undefined) return { ...ev, used_item: item };
  }
  if (ev.type === 'craft' && ev.recipe === undefined) {
    const recipe = lookup(words(query, '/ricetta'), () => [
      ...new Set([...Object.keys(s.recipe_list?.recipes ?? {}), ...Object.keys(s.recipes)]),
    ]);
    if (recipe !== undefined) return { ...ev, recipe };
  }
  return ev;
}

/** A turn's gain as the state's drop; none for any other outcome. */
function fromTurn(e: BusEvent): StateEvent | undefined {
  const o = e['outcome'] as Record<string, unknown> | undefined;
  if (o?.['kind'] !== 'gain') return undefined;
  const item = o['item'] as string;
  const rarity = o['rarity'] as string;
  const usable = ((o['tags'] as string[] | undefined) ?? []).includes('usabile');
  const sure = o['sure'] !== false;
  const raw = o['raw'] as string | undefined;
  const context = { dm: true, date: isoOf(e.t), resolved: item };
  if (raw === undefined && sure)
    return { type: 'drop', kind: 'lucky', item, rarity, usable: false, ...context };
  return { type: 'drop', kind: 'adventure', raw: raw ?? item, rarity, usable, sure, ...context };
}

/** A guess resolved by the parser, as the state's correction of the owner's drop. */
function fromResolved(e: BusEvent): StateEvent {
  const r = e as unknown as z.output<typeof resolvedSchema>;
  return {
    type: 'resolved',
    guess: r.guess,
    item: r.item,
    dropped: isoOf(r.date),
    rarity: r.rarity,
    usable: r.tags.includes('usabile'),
    dm: true,
    date: isoOf(e.t),
  };
}

/** The state's event of one of the parser's, the owner's name learned from it; none to apply. */
export function toStateEvent(s: State, e: BusEvent): StateEvent | undefined {
  if (e.type === 'inventorybot.turn') return fromTurn(e);
  if (e.type === RESOLVED_EVENT) return fromResolved(e);
  const kind = replyKindOf(e.type);
  return kind === undefined ? undefined : fromReply(s, e, kind);
}

/** Whether a reply lists the whole inventory: complete, and with no filter. */
function wholeListing(e: BusEvent): boolean {
  if (e.type !== replyEvent('inventory') || e['truncated'] === true) return false;
  const q = e['query'] as string | null | undefined;
  return (
    e['exported'] === true || queryArg(q, ...INVENTORY_COMMANDS, ...INVENTORY_LIST_COMMANDS) === ''
  );
}

/**
 * The freshness an event gives the sections it touched: a whole listing is a `snapshot` of the
 * inventory (even when it changed nothing), a drop the parser is not sure of an `uncertain`
 * change, anything else a `delta` of each section it changed.
 */
export function freshness(e: BusEvent, changed: readonly string[]): Partial<Record<string, Mark>> {
  const marks: Partial<Record<string, Mark>> = Object.fromEntries(
    changed.map((c): [string, Mark] => [c, 'delta'])
  );
  if (wholeListing(e)) marks['inventory'] = 'snapshot';
  const o = e['outcome'] as { kind?: string; sure?: boolean } | undefined;
  if (e.type === 'inventorybot.turn' && o?.kind === 'gain' && o.sure === false)
    for (const c of ['inventory', 'drops']) if (changed.includes(c)) marks[c] = 'uncertain';
  return marks;
}
