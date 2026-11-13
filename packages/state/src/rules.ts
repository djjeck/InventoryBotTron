/**
 * The rules the player state reads replies by, which a reader of a whole export (the wiki's
 * phase 5) shares with the state: whose a reply is, what a command's argument is, which unlisted
 * items an inventory listing proves the player does not have, which uses failed, a name's key, the
 * game's renames, and the two messages of one transfer. Pure logic only.
 */
import {
  codePointLength,
  type Event,
  INVENTORY_COMMANDS,
  INVENTORY_LIST_COMMANDS,
  pakkomonItem,
  sliceCodePoints,
  splitWords,
  stripEndChars,
  stripWs,
  WS_CLASS,
} from '@inventorybottron/grammar';
import { isoDateSeconds } from './dates.ts';

/** Whether an optional string is present and non-empty. */
const truthy = (s: string | null | undefined): s is string =>
  s !== null && s !== undefined && s !== '';

/** The fields `isMine` reads. */
export interface Addressing {
  player?: string | null | undefined;
  dm?: boolean | undefined;
  forwarded?: boolean | undefined;
  broadcast?: boolean | undefined;
}

/**
 * Whether a bot reply is about the owner (their moves, holdings, crafts).
 *
 * Addressed replies belong to the @username they name. Unaddressed ones ("Troppo presto", gift
 * notices) are the owner's only in the private chat. Forwarded bot messages and group broadcasts
 * ("[W]", "[N]") belong to nobody: they did not happen at that time and place.
 */
export function isMine(e: Addressing, player: string | null): boolean {
  if (e.forwarded || e.broadcast) return false;
  if (truthy(e.player)) return e.player === player;
  return Boolean(e.dm);
}

/**
 * The argument of a command among `cmds` (`/ricetta torre` is `torre`), "" without one, null for
 * another command.
 */
export function queryArg(q: string | null | undefined, ...cmds: string[]): string | null {
  for (const c of cmds) {
    if (truthy(q) && q.toLowerCase().startsWith(c + ' '))
      return stripWs(sliceCodePoints(q, codePointLength(c) + 1));
    if (truthy(q) && q.toLowerCase() === c) return '';
  }
  return null;
}

/**
 * `/inventario` arguments that are rarity filters (docs/bot-protocol.md 6.8): "C" lists C and C+
 * items, "C+" only C+, "L" every Ln, "L2" only L2. "M" is accepted but always lists nothing. The
 * letter is case-insensitive ("c" is "C", "l1" is "L1"); ASCII letters only.
 */
export const RARITY_FILTER = /^(?:[CNRSXUcnrsxu]\+?|[Ll]\p{Nd}*)(?=\n?$)/u;

/** An item's rarity, as the caller knows it. */
export type RarityOf = (name: string) => string | null | undefined;

/** The fields `inventoryScope` reads of an event. */
export type Listing = Event & { query?: string | null | undefined };

/**
 * Which unlisted items an inventory reply proves the player does not have: a predicate on item
 * names (every one for the `/esporta` file), or null when the reply says nothing about unlisted
 * items: it was truncated (or is one `/inv2` page of several), its command is unknown, it used the
 * "M" filter, which does not work in the bot, or it is a `/collezioni` or `/inv2` with an argument.
 */
export function inventoryScope(e: Listing, rarityOf: RarityOf): ((name: string) => boolean) | null {
  if (e.type !== 'inventory' || e.truncated) return null;
  if (e.exported) return () => true;
  if (e.query === null || e.query === undefined) return null;
  // /collezioni and /inv2 list everything; nothing is known of what they do with an argument.
  const list = queryArg(e.query, ...INVENTORY_LIST_COMMANDS);
  if (list !== null) return list === '' ? () => true : null;
  const raw = stripWs(queryArg(e.query, ...INVENTORY_COMMANDS) || '');
  if (!raw) return () => true;
  if (raw === 'M' || raw === 'm') return null;
  if (RARITY_FILTER.test(raw)) {
    const arg = raw.toUpperCase();
    return (n) => {
      const r = rarityOf(n) || '';
      if (arg === 'L') return r.startsWith('L');
      return arg.endsWith('+') || arg.startsWith('L') ? r === arg : stripEndChars(r, '+') === arg;
    };
  }
  // Text filter: every word must appear in the name, case-insensitively, also inside another
  // word ("otto" lists "un bottone"); "[C]" is text too and matches nothing.
  const words = splitWords(raw.toLowerCase());
  return (n) => {
    const lower = n.toLowerCase();
    return words.every((w) => lower.includes(w));
  };
}

/** `/usa` replies where the use failed for a reason worth keeping (a requirement). */
export const USE_FAILED: readonly (string | RegExp)[] = [
  'non hai la chiave giusta',
  'non le hai ancora tutte',
  'non puoi teletrasportarti in quei luoghi',
  // A player named by the argument (echoed before these) lacks what the use needs.
  ' non ha un walkie talkie',
  " non e' un nuovo arrivato",
  // A Pakkomon that cannot take the use.
  "quel pakkomon ha gia' bevuto",
  'i pakkomon boss vanno sfidati in Arena',
  // What the use needs from the player: items, their number or rarity, an ability.
  'non hai abbastanza ',
  'devi introdurre esattamente ',
  "gli oggetti inseriti devono essere tutti della stessa rarita'",
  /^Rarità ammesse: /u,
  'non ti senti in grado di ',
];

/** Whether a use's reply says it failed (`USE_FAILED`). */
export const isFailedUse = (text: string): boolean =>
  USE_FAILED.some((k) => (typeof k === 'string' ? text.includes(k) : k.test(text)));

/**
 * A name's key for matching names typed by hand with the bot's: whitespace as single spaces,
 * without the emoji variation selector, zero-width joiners, gender signs and skin tones that a
 * hand-typed emoji may add.
 */
export function nameKey(name: string): string {
  return stripWs(
    name
      .normalize('NFC')
      .replace(/\u{FE0F}|\u{200D}|\u{2640}|\u{2642}|[\u{1F3FB}-\u{1F3FF}]/gu, '')
      .replace(new RegExp(`${WS_CLASS}+`, 'gu'), ' ')
  );
}

const PAKKOMON_PREFIX = pakkomonItem('');

/** The Pakkomon an item name is ("un Pakkomon di nome X" is "X"), or null. */
export const pakkomonOf = (item: string): string | null =>
  item.startsWith(PAKKOMON_PREFIX) ? item.slice(PAKKOMON_PREFIX.length) : null;

/** Event fields holding one item name. */
const ITEM_FIELDS: ReadonlySet<string> = new Set(['item', 'output', 'resolved', 'used_item']);
/** Event fields holding item lines (`{name, rarity, usable, qty}`). */
const ITEM_LINE_FIELDS: ReadonlySet<string> = new Set(['items', 'ingredients', 'missing', 'have']);

/**
 * A copy of an event with every renamed item name replaced by the current one (`renames`, old
 * name to new). Only item fields change: places, chat titles, queries, texts and recipe names stay
 * as they are; a `/stats` reply, whose fields are free-form, stays whole.
 */
export function renamed<T extends { type: string }>(e: T, renames: ReadonlyMap<string, string>): T {
  if (e.type === 'stats') return e;
  const name = (n: unknown): unknown => (typeof n === 'string' ? (renames.get(n) ?? n) : n);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (ITEM_FIELDS.has(k)) out[k] = name(v);
    else if (ITEM_LINE_FIELDS.has(k) && Array.isArray(v))
      out[k] = v.map((x: { name: string }) => ({ ...x, name: name(x.name) }));
    else out[k] = v;
  }
  return out as T;
}

/** The fields `sameTransfer` reads. */
export interface Transfer {
  date?: string | null | undefined;
  item: string;
  qty: number;
}

/**
 * Largest gap, in seconds, between a group "/dai … a @u" and the private notice "@x ti ha dato"
 * of the same transfer, in either order.
 */
export const TRANSFER_WINDOW = 120;

/** A group "/dai … a @u" and the private notice "@x ti ha dato" of it (within `TRANSFER_WINDOW`). */
export function sameTransfer(
  give: Transfer & { player?: string | null | undefined },
  gift: Transfer & { from: string }
): boolean {
  const a = isoDateSeconds(give.date);
  const b = isoDateSeconds(gift.date);
  if (a === null || b === null) return false;
  return (
    gift.from === give.player &&
    gift.item === give.item &&
    gift.qty === give.qty &&
    Math.abs(a - b) <= TRANSFER_WINDOW
  );
}
