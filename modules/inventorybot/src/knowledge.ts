/**
 * What the `inventorybot` parser knows of the game: nothing at first, and only what it reads (or
 * what its owner seeds it with from their own export, `seed`), kept in its instance's store. The
 * module ships no knowledge (CLAUDE.md, "Game content"), so this is all it resolves drops with,
 * through the grammar's `resolveDrop`.
 *
 * - **Items** are learned from the replies that name them delimited: the item lines of an
 *   inventory or another listing, a `/mostra`, the lucky adventure's prize (`learnItems`).
 * - **A drop that ends with a known item** teaches its sentence, the rest of it, as a prefix, and
 *   is sure. **A drop that starts with a known prefix** teaches its item, and is sure too: the
 *   prefix came from a sure drop. (A prefix that ends with a space is kept in a second form, with a
 *   line break instead: a player-made item's name may start on a new line, and the grammar drops
 *   the space before it.)
 * - **Any other drop** is unknown: its item is guessed, never learned, and the drop is kept among
 *   the latest unknown ones, which the next unknown drops are cut against (`drop-cut.ts`): two
 *   drops of one sentence part inside the item. Without such a cut, the grammar's
 *   `guessDropItem`. The result is not sure.
 *
 * - **The owner's guesses** (since 0.7.0): each of the owner's drops whose item it guessed is kept
 *   (`guessed`), and settled once what it has learned since resolves it (`settle`): an item that
 *   ends its narrative, or a sentence that starts it, learned from any message it reads, whoever's
 *   and in whichever chat. A whole inventory of the owner's counts every drop before it, as
 *   whatever it was, so the guesses older than one are forgotten unresolved (`forget`), never
 *   corrected after it (issue #1). The parser tells each settled guess as `inventorybot.resolved`,
 *   and the player state moves its count; the state resolves nothing itself.
 *
 * What it keeps is bounded (`MAX_ITEMS`, `MAX_PREFIXES`, `MAX_UNKNOWN`, `MAX_GUESSES`), the oldest dropped first,
 * so that its store document stays small (a few hundred kB at most). Pure logic but for the store,
 * which is any `{read, write}`: the parser's instance store, or a seed's in memory.
 */
import { type DropKnowledge, guessDropItem, resolveDrop } from '@inventorybottron/grammar';
import { z } from 'zod';
import { guessCut } from './drop-cut.ts';

/** The store's document of what it learned. */
export const KNOWLEDGE_DOC = 'knowledge';
/** At most this many learned item names. */
export const MAX_ITEMS = 5000;
/** At most this many learned prefixes (each form counts). */
export const MAX_PREFIXES = 1000;
/** At most this many unknown drops kept, to cut the next ones against. */
export const MAX_UNKNOWN = 200;
/** At most this many of the owner's guesses kept, waiting to be resolved. */
export const MAX_GUESSES = 50;

/** What a seed brings, and what `snapshot` gives: the items and prefixes, oldest first. */
export const seedSchema = z.object({
  items: z.array(z.string()).describe('Item names, as the bot writes them, article included'),
  prefixes: z.array(z.string()).describe("Drops' sentences, everything before the item"),
});
export type Seed = z.infer<typeof seedSchema>;

/** One of the owner's drops whose item was guessed, waiting for what resolves it. */
export const guessSchema = z.object({
  /** Its narrative, which the item ends (the grammar's `raw`). */
  raw: z.string(),
  /** The item it was published as. */
  guess: z.string(),
  rarity: z.string(),
  tags: z.array(z.string()),
  /** The chat it was read in. */
  chat: z.string(),
  /** When it was read (ms), its turn's time. */
  t: z.number(),
});
export type Guess = z.infer<typeof guessSchema>;

/** A guess resolved: the guess, and its real item. */
export type Resolution = Guess & { item: string };

/**
 * The document: a seed's fields, the unknown drops and the owner's guesses (each absent from an
 * older version's).
 */
const keptSchema = seedSchema.extend({
  unknown: z.array(z.string()).default([]),
  guesses: z.array(guessSchema).default([]),
});
type Kept = z.infer<typeof keptSchema>;

/** Where the knowledge is kept: the plugin's store, or anything with its two calls. */
export interface KnowledgeStore {
  read<T>(name: string): T | undefined;
  write(name: string, value: unknown): void;
}

/** A drop's item, as the knowledge resolves it. */
export interface DropItem {
  item: string;
  /** False for a guess: neither its item nor its sentence was known. */
  sure: boolean;
}

/** A prefix as the grammar may find it: as written, and with a line break for its final space. */
export function prefixForms(prefix: string): string[] {
  return prefix.endsWith(' ') ? [prefix, `${prefix.slice(0, -1)}\n`] : [prefix];
}

/** Add `value` to `set`, dropping the oldest beyond `max`; whether it was new. */
function addBounded(set: Set<string>, value: string, max: number): boolean {
  if (set.has(value)) return false;
  set.add(value);
  for (const oldest of set) {
    if (set.size <= max) break;
    set.delete(oldest);
  }
  return true;
}

/** The knowledge of one parser instance, read from and written to its store. */
export class InventoryKnowledge implements DropKnowledge {
  /** The item names, oldest first. */
  readonly items = new Set<string>();
  /** The prefixes, oldest first, in both forms. */
  readonly prefixes = new Set<string>();
  /** The latest unknown drops' narratives, oldest first. */
  readonly unknown = new Set<string>();
  /** The owner's guesses not resolved yet, oldest first. */
  guesses: Guess[] = [];
  /** Whether it learned something since its guesses were last settled. */
  #learned = false;

  readonly #store: KnowledgeStore;

  constructor(store: KnowledgeStore) {
    this.#store = store;
    const kept = keptSchema.safeParse(store.read<Kept>(KNOWLEDGE_DOC));
    if (!kept.success) return;
    this.#merge(kept.data);
    for (const raw of kept.data.unknown) addBounded(this.unknown, raw, MAX_UNKNOWN);
    this.guesses = kept.data.guesses.slice(-MAX_GUESSES);
  }

  /** The item of a drop, from its narrative (`raw`), learning what it teaches. */
  resolve(raw: string): DropItem {
    const found = resolveDrop(raw, this);
    if (found !== null) {
      // A known item teaches its sentence; a known sentence, its item.
      if (found.sure ? this.#addPrefix(found.prefix) : this.#addItem(found.item)) this.#keep();
      return { item: found.item, sure: true };
    }
    const cut = guessCut(raw, this.unknown);
    if (addBounded(this.unknown, raw, MAX_UNKNOWN)) this.#keep();
    return { item: cut === undefined ? guessDropItem(raw) : raw.slice(cut), sure: false };
  }

  /** One of the owner's drops whose item it guessed, kept until `settle` resolves it. */
  guessed(guess: Guess): void {
    this.guesses.push(guess);
    this.guesses.splice(0, this.guesses.length - MAX_GUESSES);
    this.#keep();
  }

  /**
   * The guesses that what it learned since resolves, each with its item, oldest first, no longer
   * kept: an item learned that ends the narrative, or a sentence learned that starts it. A guess
   * resolved teaches as a drop does (its sentence, or its item).
   */
  settle(): Resolution[] {
    const settled: Resolution[] = [];
    // What a resolved guess teaches may resolve another: until nothing new is learned.
    while (this.#learned && this.guesses.length > 0) {
      this.#learned = false;
      const now: Resolution[] = [];
      this.guesses = this.guesses.filter((g) => {
        const found = resolveDrop(g.raw, this);
        if (found === null || found.item === '') return true;
        now.push({ ...g, item: found.item });
        return false;
      });
      for (const r of now) this.resolve(r.raw);
      settled.push(...now);
    }
    this.#learned = false;
    if (settled.length > 0) this.#keep();
    return settled;
  }

  /** Forgets the guesses read at `t` or before, unresolved: a whole inventory counted them. */
  forget(t: number): void {
    const kept = this.guesses.filter((g) => g.t > t);
    if (kept.length === this.guesses.length) return;
    this.guesses = kept;
    this.#keep();
  }

  /** Learn item names a reply lists; the store is written if one is new. */
  learnItems(names: Iterable<string>): void {
    let changed = false;
    for (const name of names) if (this.#addItem(name)) changed = true;
    if (changed) this.#keep();
  }

  /** Add a seed's items and prefixes to what it knows; how many of each were new. */
  seed(seed: Seed): { items: number; prefixes: number } {
    const added = this.#merge(seed);
    if (added.items + added.prefixes > 0) this.#keep();
    return added;
  }

  /** What it knows, as a seed would bring it. */
  snapshot(): Seed {
    return { items: [...this.items], prefixes: [...this.prefixes] };
  }

  #merge(seed: Seed): { items: number; prefixes: number } {
    let items = 0;
    let prefixes = 0;
    for (const item of seed.items) if (this.#addItem(item)) items++;
    for (const prefix of seed.prefixes) if (this.#addPrefix(prefix)) prefixes++;
    return { items, prefixes };
  }

  #addItem(item: string): boolean {
    const added = item.trim() !== '' && addBounded(this.items, item, MAX_ITEMS);
    if (added) this.#learned = true;
    return added;
  }

  #addPrefix(prefix: string): boolean {
    let added = false;
    if (prefix.trim() !== '')
      for (const form of prefixForms(prefix))
        if (addBounded(this.prefixes, form, MAX_PREFIXES)) added = true;
    if (added) this.#learned = true;
    return added;
  }

  #keep(): void {
    this.#store.write(KNOWLEDGE_DOC, {
      items: [...this.items],
      prefixes: [...this.prefixes],
      unknown: [...this.unknown],
      guesses: this.guesses,
    });
  }
}
