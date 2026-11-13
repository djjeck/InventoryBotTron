/**
 * The `inventorybot` parser's events of the owner's private replies, one event type per kind of
 * reply (since 0.6.0): `inventorybot.<kind>`, `<kind>` the grammar's event type
 * (`@inventorybottron/grammar`) in camel case (`inventorybot.itemInfo` for `item_info`), its payload the grammar's event's fields beside the reply's
 * context. Each is declared with its own schema, so that MegaBotTron1999's editor and a script's
 * types know its fields. Pure logic only.
 *
 * - **What is published:** the kinds of `REPLY_KINDS`, read in the private chat with the bot, where
 *   every reply is the owner's: what lists, shows or moves their items, where they are, their
 *   Pakkomon, and the bot's fixed replies (`miss`: help, a refusal, a not-found) and an item's
 *   cooldown. Not another player's reply in a group: a group's replies stay the turns' (a drop
 *   addressed to the owner), so that every event of these kinds is the owner's.
 * - **Not here:** an adventure drop and the adventure's cooldown, which are the owner's turns,
 *   `inventorybot.turn` (`turn.ts`): one event for each thing, never both. Nor what the grammar
 *   reads of no reply to the owner (a channel's card, a boss announced, a `/stats` of anyone, an old
 *   format).
 */
import { type Event } from '@inventorybottron/grammar';
import { z } from 'zod';

/** The reply's context, beside the grammar's fields. */
const context = {
  chat: z.string().describe('The private chat with the bot'),
  query: z
    .string()
    .nullable()
    .describe(
      "The owner's last command in the chat, which the reply answers; null when none is recent"
    ),
  self: z
    .string()
    .optional()
    .describe("The owner's username, without @, once the account knows it"),
  playback: z
    .literal(true)
    .optional()
    .describe('Read from history (a message missed while down), not news: act on none'),
};

const itemLine = z.object({
  name: z.string(),
  rarity: z.string().nullable(),
  usable: z.boolean(),
  qty: z.number(),
});
const written = z.record(z.string(), z.string());
const side = z.object({ pakkomon: z.string(), owner: z.string() });

/** The grammar's fields of each kind published, and what the kind is. */
const KINDS = {
  inventory: [
    z.object({
      filtered: z.boolean(),
      truncated: z.boolean(),
      items: z.array(itemLine),
      exported: z.literal(true).optional(),
    }),
    'A listing of the owner’s items: an /inventario, a /collezioni, an /inv2 page, or the /esporta file (exported)',
  ],
  title: [z.object({ items: z.array(itemLine) }), 'The title-giving items the owner holds'],
  item_info: [
    z.object({
      item: z.string(),
      rarity: z.string(),
      usable: z.boolean(),
      used_in_raw: z.string().nullable(),
      count: z.number().nullable(),
      source: z.enum(['adventure', 'special', 'recipe']).nullable(),
      from_recipe: z.string().nullable(),
      cooldown: z.string().optional(),
    }),
    'An /esamina card: an item, and how many the owner holds',
  ],
  recipe_detail: [
    z.object({ recipe: z.string(), missing: z.array(itemLine), have: z.array(itemLine) }),
    'A recipe: the ingredients missing and those held',
  ],
  recipe_list: [
    z.object({
      truncated: z.boolean(),
      recipes: z.array(
        z.object({
          name: z.string(),
          level: z.number(),
          ready: z.boolean(),
          missing: z.number(),
        })
      ),
    }),
    'The recipe list: each recipe, ready or missing how many',
  ],
  craft: [
    z.object({
      ingredients: z.array(itemLine),
      output: z.string().nullable(),
      flavor: z.string(),
      level_up: z.number().optional(),
      level_up_text: z.string().optional(),
    }),
    'A recipe made: the ingredients spent and the item made',
  ],
  show: [
    z.object({ qty: z.number(), item: z.string(), rarity: z.string(), usable: z.boolean() }),
    'A /mostra: an item the owner shows, at least that many',
  ],
  use: [
    z.object({
      text: z.string(),
      items: z.array(itemLine),
      named: z.string().optional(),
      takes: z.array(z.string()).optional(),
      pakkomon_use: z
        .enum([
          'hatch',
          'equip',
          'scan',
          'heal',
          'power_up',
          'probe',
          'scale',
          'extract',
          'customise',
        ])
        .optional(),
      pakkomon: z.array(z.string()).optional(),
      reading: z.string().optional(),
      scan: z.array(z.object({ pakkomon: z.string(), remaining: z.number() })).optional(),
    }),
    'A /usa: what the use did, and the items it gave or took',
  ],
  gift: [
    z.object({ from: z.string(), qty: z.number(), item: z.string() }),
    'Another player gave the owner items',
  ],
  give: [
    z.object({ to: z.string().nullable(), qty: z.number(), item: z.string() }),
    'The owner gave another player items',
  ],
  travel: [
    z.object({
      location: z.string().nullable(),
      exits: z.array(z.string()),
      narrative: z.string().nullable(),
      written,
    }),
    'The owner travelled: the place reached and its exits',
  ],
  travel_blocked: [
    z.object({ location: z.string(), written }),
    'A /viaggio refused: the place cannot be reached from here',
  ],
  travel_requirement: [
    z.object({ item: z.string(), location: z.string(), written }),
    'A /viaggio refused: the item a place on the way requires',
  ],
  location: [
    z.object({ location: z.string(), exits: z.array(z.string()), written }),
    'Where the owner is, and its exits',
  ],
  item_cooldown: [
    z.object({
      item: z.string(),
      action: z.enum(['use', 'give']),
      remaining: z.number(),
      precision: z.number(),
    }),
    'A /usa or /dai refused: the item is still cooling down, for remaining seconds',
  ],
  miss: [
    z.object({
      reply: z.string(),
      command: z.string().optional(),
      owned: z.number().optional(),
      prize: z.string().optional(),
    }),
    'One of the bot’s fixed replies (help, a refusal, a not-found), by its name in the grammar',
  ],
  pakkomon_record: [
    z.object({
      pakkomon: z.string(),
      wins: z.number(),
      losses: z.number(),
      equipment: itemLine.nullable(),
      stunned_for: z.number(),
      born: z.string().nullable(),
      maker: z.string().nullable(),
      power_ups: z.array(z.string()),
    }),
    'A Pakkomon’s record',
  ],
  pakkomon_ready: [z.object({ pakkomon: z.string() }), 'A Pakkomon waits for any challenger'],
  pakkomon_challenge: [
    z.object({ pakkomon: z.string(), opponent: z.string() }),
    'A Pakkomon challenges another player',
  ],
  pakkomon_stunned: [
    z.object({ pakkomon: z.string().nullable(), remaining: z.number() }),
    'A fight refused: a Pakkomon is still stunned, for remaining seconds',
  ],
  pakkomon_fight: [
    z.object({
      winner: side,
      loser: side,
      hit: z.boolean(),
      ending: z.string().nullable(),
      stun_min: z.number().nullable(),
      stun_max: z.number().nullable(),
      move: z.string().nullable(),
      prize: itemLine.nullable(),
      learned: z.boolean(),
      wound: z.string().nullable(),
      spoils: z.array(z.object({ player: z.string(), points: z.number() })).nullable(),
    }),
    'A Pakkomon fight: the winner, the loser and what followed',
  ],
} as const;

/** The kinds of reply published, each as `inventorybot.<kind>`. */
export type ReplyKind = keyof typeof KINDS;

/** The kinds of reply published, in their order in the manifest. */
export const REPLY_KINDS = Object.keys(KINDS) as ReplyKind[];

/** The grammar's fields of an event of a kind. */
type Fields<K extends ReplyKind> = Omit<Extract<Event, { type: K }>, 'type'>;
type Out<K extends ReplyKind> = z.output<(typeof KINDS)[K][0]>;
/** Whether a kind's schema has the grammar's fields, no more, no fewer, of their types. */
type Agrees<K extends ReplyKind> = [
  Exclude<keyof Fields<K>, keyof Out<K>> | Exclude<keyof Out<K>, keyof Fields<K>>,
] extends [never]
  ? Fields<K> extends Out<K>
    ? true
    : false
  : false;
// The type check that each schema says what the grammar reads: a field added to an event of the
// grammar fails it until its schema has it.
const agrees: { [K in ReplyKind]: Agrees<K> } = {
  inventory: true,
  title: true,
  item_info: true,
  recipe_detail: true,
  recipe_list: true,
  craft: true,
  show: true,
  use: true,
  gift: true,
  give: true,
  travel: true,
  travel_blocked: true,
  travel_requirement: true,
  location: true,
  item_cooldown: true,
  miss: true,
  pakkomon_record: true,
  pakkomon_ready: true,
  pakkomon_challenge: true,
  pakkomon_stunned: true,
  pakkomon_fight: true,
};
void agrees;

/**
 * The event type of a kind of reply: `inventorybot.` and the kind in camel case
 * (`inventorybot.itemInfo` for `item_info`), since an event's name is letters and digits.
 */
export const replyEvent = (kind: ReplyKind): string =>
  `inventorybot.${kind.replace(/_([a-z])/gu, (_, c: string) => c.toUpperCase())}`;

/** Each event type's kind of reply. */
const KIND_OF: ReadonlyMap<string, ReplyKind> = new Map(REPLY_KINDS.map((k) => [replyEvent(k), k]));

/** The kind of reply of an event type; none for another type. */
export const replyKindOf = (type: string): ReplyKind | undefined => KIND_OF.get(type);

/** Each kind's event type and its payload's schema: the context, then the grammar's fields. */
export const REPLY_SCHEMAS: Record<string, z.ZodObject> = Object.fromEntries(
  REPLY_KINDS.map((k) => {
    const [fields, what] = KINDS[k];
    return [replyEvent(k), z.object(context).extend(fields.shape).describe(what)];
  })
);

/** Whether the grammar's event is of a kind published. */
export function isReplyKind(type: string): type is ReplyKind {
  return Object.hasOwn(KINDS, type);
}

/** The context's fields, which are not the grammar's. */
export const CONTEXT_FIELDS: readonly string[] = Object.keys(context);

/** A grammar's event as its event's payload: the context, then its fields, `type` left out. */
export function replyPayload(
  ev: Event,
  ctx: { chat: string; query: string | null; self?: string | undefined; playback?: boolean }
): Record<string, unknown> {
  const { type: _, ...fields } = ev;
  return {
    chat: ctx.chat,
    query: ctx.query,
    ...(ctx.self === undefined ? {} : { self: ctx.self }),
    ...(ctx.playback === true ? { playback: true } : {}),
    ...fields,
  };
}
