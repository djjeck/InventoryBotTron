/**
 * `node scripts/seed-knowledge.ts EXPORT [EXPORT …] > seed.json`: the knowledge the owner seeds
 * their `inventorybot` node with, from their own Telegram Desktop HTML exports (the private chat
 * with the bot, the game's groups). It reads every message of the bot in them, in order, as the
 * node reads them live (the module's `learnFrom`), and prints what that teaches as the input of
 * the node's action `seed`: `{"items": [...], "prefixes": [...]}`. A summary goes to stderr.
 *
 * It writes nothing: the seed goes to stdout, for the owner to keep outside this repository and
 * send to their instance (README, "Seeding the parser"). The exports, and the seed made of them,
 * never enter a repository (CLAUDE.md, "Game content"). Exit codes: 0 done, 2 wrong arguments.
 */
import { classify } from '@inventorybottron/grammar';
import {
  InventoryKnowledge,
  type KnowledgeStore,
  type Seed,
} from '@inventorybottron/inventorybot/knowledge.ts';
import { learnFrom, listedItems, readReply } from '@inventorybottron/inventorybot/read.ts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BotMessage, botMessages, exportPages } from './export-pages.ts';

export const USAGE =
  'usage: node scripts/seed-knowledge.ts EXPORT_FOLDER [EXPORT_FOLDER …] > seed.json';

/** What a seed read, for the owner's summary. */
export interface SeedReport {
  seed: Seed;
  messages: number;
  drops: number;
  sure: number;
}

/** A store in memory: the seed's knowledge is never written anywhere. */
function memory(): KnowledgeStore {
  const docs = new Map<string, unknown>();
  return {
    read: <T>(name: string) => docs.get(name) as T | undefined,
    write: (n, v) => void docs.set(n, v),
  };
}

/** What the bot's messages teach, read in order as the node reads them. */
export function seedFrom(messages: Iterable<BotMessage & { fileText?: string }>): SeedReport {
  const known = new InventoryKnowledge(memory());
  let count = 0;
  let drops = 0;
  let sure = 0;
  for (const m of messages) {
    count++;
    const { ev } = readReply(m.text);
    const learned = learnFrom(ev, known);
    if (ev.type === 'drop') {
      drops++;
      if (learned.sure) sure++;
    }
    // The /esporta file, every item the player owns, beside its caption.
    if (m.fileText !== undefined)
      known.learnItems(listedItems(classify(m.text.normalize('NFC').trim(), null, m.fileText)));
  }
  return { seed: known.snapshot(), messages: count, drops, sure };
}

/** The bot's messages in the exports under `dirs`, each with its linked text file's content. */
export function* exportMessages(
  dirs: readonly string[]
): Generator<BotMessage & { fileText?: string }> {
  for (const dir of dirs)
    for (const page of exportPages(dir))
      for (const m of botMessages(fs.readFileSync(page, 'utf8'))) {
        const file = m.file === undefined ? undefined : path.join(path.dirname(page), m.file);
        const fileText =
          file !== undefined && fs.existsSync(file)
            ? fs.readFileSync(file, 'utf8').replace(/\r\n?/gu, '\n')
            : undefined;
        yield { ...m, ...(fileText === undefined ? {} : { fileText }) };
      }
}

/** The CLI: the seed on `out`, the summary on `err`; the exit code. */
export function main(
  args: readonly string[],
  out: (s: string) => void,
  err: (s: string) => void
): number {
  if (
    args.length === 0 ||
    args.some((a) => a.startsWith('-') || !fs.statSync(a, { throwIfNoEntry: false })?.isDirectory())
  ) {
    err(USAGE);
    return 2;
  }
  const r = seedFrom(exportMessages(args));
  out(`${JSON.stringify(r.seed)}\n`);
  err(
    `${r.messages} messages of the bot, ${r.drops} drops (${r.sure} sure as read in order): ` +
      `${r.seed.items.length} items, ${r.seed.prefixes.length} prefixes.`
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(
    process.argv.slice(2),
    (s) => process.stdout.write(s),
    (s) => console.error(s)
  );
