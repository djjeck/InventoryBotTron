/**
 * InventoryBot's messages, read with the grammar (`@inventorybottron/grammar`) as the outcomes of
 * the owner's turns (`turn.ts`), for the `inventorybot` parser.
 *
 * - The grammar classifies a reply; this module tells whose it is. The bot answers in the group
 *   without replying to the command, and names the player: "@mario_r, <sentence><item> [C]!",
 *   maybe with a title after the username ("@mario_r il cartografo, …"), and "[W] " before it when
 *   it announces the adventure to another group; the lucky adventure, "Complimenti @mario_r, …"
 *   (docs/bot-protocol.md §4, §5, §6.1, §6.2). The addressee and its title are taken off before the
 *   grammar reads the reply, and the gain is the owner's only if it names them.
 * - A drop's item is not delimited from its sentence: the parser's knowledge (`knowledge.ts`)
 *   finds it, `sure` when it knew the item or the sentence, else as a guess. Every drop it reads,
 *   whoever's, teaches it, and so do the items the replies list (an inventory, a recipe's
 *   ingredients, a `/mostra`, the lucky prize). The tags are the grammar's: `usabile` or none.
 * - Its cooldown names nobody: read in the private chat only, with its wait.
 * - Whatever else it says to the owner is no adventure's.
 *
 * The bot writes some accented letters decomposed, so the text is read in its composed form (NFC),
 * and the items are kept in it.
 */
import { classify, type Event } from '@inventorybottron/grammar';
import { type BotMessage, type TurnReading } from '@megabottron1999/turns/turn-parser.ts';
import { type InventoryKnowledge } from './knowledge.ts';
import { INVENTORYBOT, type InventoryOutcome, TURN_REST_MS } from './turn.ts';

/** A drop's addressee: "[W] " for an announced one, "@user", maybe a title, and ", ". */
const ADDRESSED = /^(?:\[W\] )?@(\w+)(?: [^,\n]*)?, /u;
/** The lucky adventure's. */
const LUCKY = /^Complimenti @(\w+), /u;

/**
 * The item names a reply gives delimited (docs/bot-protocol.md §6): an inventory's or a title
 * list's lines, a recipe's ingredients missing and owned, a craft's ingredients, a `/mostra`'s
 * item and the lucky adventure's prize. Not `/esamina`'s, whose name follows a title with no comma
 * between (§6.7), which the parser cannot tell apart without knowing the titles.
 */
export function listedItems(ev: Event): string[] {
  switch (ev.type) {
    case 'inventory':
    case 'title':
      return ev.items.map((i) => i.name);
    case 'recipe_detail':
      return [...ev.missing, ...ev.have].map((i) => i.name);
    case 'craft':
      return ev.ingredients.map((i) => i.name);
    case 'show':
      return [ev.item];
    case 'drop':
      return ev.kind === 'lucky' ? [ev.item] : [];
    default:
      return [];
  }
}

/**
 * The reply as the grammar reads it: in its composed form, trimmed, and an addressed one with its
 * "[W] " and the addressee's title taken off; with the addressee, and whether it is the lucky
 * adventure's.
 */
export function readReply(text: string): { ev: Event; to?: string; lucky: boolean } {
  const composed = text.normalize('NFC').trim();
  const lucky = LUCKY.exec(composed);
  const addressed = lucky === null ? ADDRESSED.exec(composed) : null;
  const to = lucky?.[1] ?? addressed?.[1];
  const ev = classify(
    addressed === null ? composed : `@${addressed[1]}, ${composed.slice(addressed[0].length)}`,
    null
  );
  return { ev, ...(to === undefined ? {} : { to }), lucky: lucky !== null };
}

/**
 * What one of the bot's messages teaches `known`, and the drop's item if it is one: every reply,
 * whoever it addresses, the owner's or another player's. The seed of an export (`seed.ts`) reads
 * each message with it, as the parser does live.
 */
export function learnFrom(ev: Event, known: InventoryKnowledge): { item: string; sure: boolean } {
  known.learnItems(listedItems(ev));
  if (ev.type !== 'drop') return { item: '', sure: false };
  return ev.kind === 'lucky' ? { item: ev.item, sure: true } : known.resolve(ev.raw);
}

/**
 * What a message of the bot tells the parser of `known`'s instance: a gain or a cooldown, a
 * message claimed and unread, or nothing. Whatever it reads teaches `known`.
 */
export function readInventoryBot(m: BotMessage, known: InventoryKnowledge): TurnReading {
  const { ev, to, lucky } = readReply(m.text);
  const mine = to !== undefined && to.toLowerCase() === m.self?.toLowerCase();
  const gain = learnFrom(ev, known);
  if (ev.type === 'drop' && to !== undefined) {
    if (!mine) return undefined;
    const outcome: InventoryOutcome = {
      kind: 'gain',
      bot: INVENTORYBOT,
      item: gain.item,
      rarity: ev.rarity,
      tags: ev.usable ? ['usabile'] : [],
      sure: gain.sure,
    };
    return { outcome, restMs: TURN_REST_MS };
  }
  // A lucky adventure of the owner's it cannot read is theirs, and unread.
  if (lucky && mine) return { unread: true };
  if (!m.private) return undefined;
  if (ev.type === 'cooldown') {
    const wait = ev.remaining === undefined ? TURN_REST_MS : ev.remaining * 1000;
    const outcome: InventoryOutcome = {
      kind: 'nothing',
      bot: INVENTORYBOT,
      reason: 'cooldown',
      retryMs: wait,
    };
    return { outcome, restMs: wait };
  }
  return m.answers ? { unread: true } : undefined;
}
