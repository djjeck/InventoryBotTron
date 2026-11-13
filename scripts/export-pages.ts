/**
 * The bot's messages in a Telegram Desktop HTML chat export, for `seed-knowledge.ts`: the export
 * format the InventoryBot wiki reads, documented there
 * ([`docs/telegram-export.md`](https://github.com/djjeck/InventoryBot-wiki/blob/main/docs/telegram-export.md),
 * the Windows and the macOS export alike). Only what a seed needs is read, as the wiki's phase 1
 * reads it: each message's author (its `from_name`, the previous message's for a joined one, the
 * inner one of a forward) and its text (`div.text`: the text nodes, `<br>` as a line break,
 * entities decoded, tags dropped, stripped), and the text file a message links to (`/esporta`'s);
 * no date, id or reply.
 *
 * `botMessages` is pure, the page given as a string; `exportPages` lists an export's pages on
 * disk, in their order.
 */
import fs from 'node:fs';
import path from 'node:path';

/** A message of the bot: its text, and the path of the text file it links to, if any. */
export interface BotMessage {
  text: string;
  /** Relative to its page, as the export writes it. */
  file?: string;
}

/** A page's name: `messages.html`, then `messages2.html`, … (no zero padding). */
const PAGE = /^messages(?:[2-9]|[1-9][0-9]+)?\.html$/u;
/** Elements that have no end tag. */
const VOID = new Set(['br', 'img', 'meta', 'link', 'hr', 'input', 'wbr']);
/** A tag or a text node, comments and doctypes aside. */
const TOKEN =
  /<!--[\s\S]*?-->|<!\w[^>]*>|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/gu;
const ATTR = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** HTML entities decoded: the named ones Telegram writes, and the numeric ones. */
export function decodeEntities(s: string): string {
  return s.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(\w+));/giu,
    (whole, dec?: string, hex?: string, name?: string) => {
      if (dec !== undefined) return String.fromCodePoint(Number(dec));
      if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
      return ENTITIES[(name as string).toLowerCase()] ?? whole;
    }
  );
}

function attrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(ATTR))
    out[(m[1] as string).toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? '');
  return out;
}

/** A display name as written: stripped, and an inline bot's "via @…" left out. */
const author = (s: string): string => s.replace(/\s+via\s+@\w+$/u, '').trim();

interface Current {
  sender?: string;
  forwarded?: string;
  text?: string;
  file?: string;
}

/**
 * The messages of `bot` (its display name, `InventoryBot`) in one page of an export, in order:
 * those it wrote, and those forwarded from it.
 */
export function botMessages(html: string, bot = 'InventoryBot'): BotMessage[] {
  const out: BotMessage[] = [];
  /** The open divs (and anchors), each with its class. */
  const stack: { tag: string; cls: string }[] = [];
  let cur: Current | undefined;
  let lastSender: string | undefined;
  /** What is being captured, the div's depth where it ends, and its text so far. */
  let capture: { what: 'sender' | 'forwarded' | 'text'; depth: number; buf: string[] } | undefined;
  let skipDepth: number | undefined; // a forward's date span, inside its from_name
  /** The depth of the forwarded body's div, while inside it. */
  let fwdDepth: number | undefined;

  const flush = (): void => {
    if (cur === undefined) return;
    const sender = cur.sender ?? lastSender;
    lastSender = sender;
    const by = cur.forwarded ?? sender;
    if (cur.text !== undefined && by === bot)
      out.push({ text: cur.text, ...(cur.file === undefined ? {} : { file: cur.file }) });
    cur = undefined;
  };

  for (const m of html.matchAll(TOKEN)) {
    const [, close, rawTag, attrText, data] = m;
    if (data !== undefined) {
      if (capture !== undefined && skipDepth === undefined) capture.buf.push(decodeEntities(data));
      continue;
    }
    if (rawTag === undefined) continue; // a comment or a doctype
    const tag = rawTag.toLowerCase();
    if (close === '') {
      const a = attrs(attrText ?? '');
      const cls = a['class'] ?? '';
      if (tag === 'br') {
        capture?.buf.push('\n');
        continue;
      }
      if (VOID.has(tag) || (attrText ?? '').trimEnd().endsWith('/')) continue;
      stack.push({ tag, cls });
      const depth = stack.length;
      if (tag === 'div' && cls.startsWith('message')) {
        flush();
        if (cls.startsWith('message default')) cur = {};
        fwdDepth = undefined;
      } else if (cur !== undefined && capture === undefined) {
        if (tag === 'div' && cls.startsWith('forwarded body')) fwdDepth = depth;
        else if (tag === 'div' && cls === 'from_name')
          capture = { what: fwdDepth === undefined ? 'sender' : 'forwarded', depth, buf: [] };
        else if (tag === 'div' && cls === 'text') capture = { what: 'text', depth, buf: [] };
        else if (tag === 'a' && /(?:^|\s)media_file(?:\s|$)/u.test(cls) && a['href'] !== undefined)
          cur.file = a['href'];
      } else if (capture?.what === 'forwarded' && tag === 'span' && cls.includes('date'))
        skipDepth ??= depth;
      continue;
    }
    // An end tag closes the innermost open element of its name.
    const at = stack.findLastIndex((e) => e.tag === tag);
    if (at < 0) continue;
    const depth = at + 1;
    stack.length = at;
    if (skipDepth !== undefined && depth <= skipDepth) skipDepth = undefined;
    if (capture !== undefined && depth <= capture.depth) {
      const value = capture.buf.join('').trim();
      if (cur !== undefined) {
        if (capture.what === 'text') cur.text = value;
        else if (capture.what === 'sender') cur.sender = author(value);
        else cur.forwarded = author(value);
      }
      capture = undefined;
    }
    if (fwdDepth !== undefined && depth <= fwdDepth) fwdDepth = undefined;
  }
  flush();
  return out;
}

/**
 * The pages of the exports under `dir`, in order: each folder's `messages.html`,
 * `messages2.html`, … by number, the folders by name at every level.
 */
export function exportPages(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const pages = entries
    .filter((e) => e.isFile() && PAGE.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => pageNumber(a) - pageNumber(b))
    .map((name) => path.join(dir, name));
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
    .flatMap((name) => exportPages(path.join(dir, name)));
  return [...pages, ...folders];
}

function pageNumber(name: string): number {
  const n = /(\d+)\.html$/u.exec(name);
  return n === null ? 1 : Number(n[1]);
}
