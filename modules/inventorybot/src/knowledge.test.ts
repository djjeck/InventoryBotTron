import { describe, expect, it } from 'vitest';
import {
  type Guess,
  InventoryKnowledge,
  KNOWLEDGE_DOC,
  type KnowledgeStore,
  MAX_GUESSES,
  MAX_ITEMS,
  MAX_PREFIXES,
  MAX_UNKNOWN,
  prefixForms,
} from './knowledge.ts';

// Invented sentences (CLAUDE.md, "Game content"), with items of scripts/universe.md.
const A = 'mentre conti le nuvole dal tetto del mulino ti cade in mano ';
const B = 'un vecchio pescatore ti saluta dal molo e ti lancia ';

function memory(docs: Record<string, unknown> = {}): KnowledgeStore & {
  docs: Record<string, unknown>;
  writes: number;
} {
  const m = {
    docs,
    writes: 0,
    read: <T>(name: string) => docs[name] as T | undefined,
    write: (name: string, value: unknown) => {
      docs[name] = value;
      m.writes++;
    },
  };
  return m;
}

describe('InventoryKnowledge', () => {
  it('knows nothing at first: a drop is a guess, the last indefinite article', () => {
    const k = new InventoryKnowledge(memory());
    expect(k.resolve(`${A}una perla`)).toEqual({ item: 'una perla', sure: false });
    expect(k.items.size + k.prefixes.size).toBe(0);
  });

  it('learns the items a reply lists, and a drop that ends with one teaches its sentence', () => {
    const store = memory();
    const k = new InventoryKnowledge(store);
    k.learnItems(['un barattolo di miele', '', 'un sasso']);
    // Known, though the article inside its name misleads the guess.
    expect(k.resolve(`${A}un barattolo di miele`)).toEqual({
      item: 'un barattolo di miele',
      sure: true,
    });
    expect(k.prefixes).toEqual(new Set(prefixForms(A)));
    // Its sentence, with an item never seen: sure, and the item learned.
    expect(k.resolve(`${A}una ghianda d'oro`)).toEqual({ item: "una ghianda d'oro", sure: true });
    expect(k.items.has("una ghianda d'oro")).toBe(true);
    expect(store.docs[KNOWLEDGE_DOC]).toEqual({
      items: ['un barattolo di miele', 'un sasso', "una ghianda d'oro"],
      prefixes: prefixForms(A),
      unknown: [],
      guesses: [],
    });
    // Nothing new: nothing written.
    const writes = store.writes;
    k.learnItems(['un sasso']);
    k.resolve(`${A}un sasso`);
    expect(store.writes).toBe(writes);
  });

  it('cuts an unknown drop against the earlier unknown ones, never learning from it', () => {
    const store = memory();
    const k = new InventoryKnowledge(store);
    // Alone, the grammar's guess, misled by the article inside the name.
    expect(k.resolve(`${B}lo stecco di legno di un ghiacciolo`)).toEqual({
      item: 'un ghiacciolo',
      sure: false,
    });
    // Then the cut where two drops of the sentence part.
    expect(k.resolve(`${B}il primo numero di Topo Detective`)).toEqual({
      item: 'il primo numero di Topo Detective',
      sure: false,
    });
    expect(k.resolve(`${B}una spada`)).toEqual({ item: 'una spada', sure: false });
    expect(k.snapshot()).toEqual({ items: [], prefixes: [] });
    expect(store.docs[KNOWLEDGE_DOC]).toMatchObject({ unknown: [...k.unknown] });
    expect(k.unknown.size).toBe(3);
    // The same drop again is kept once.
    k.resolve(`${B}una spada`);
    expect(k.unknown.size).toBe(3);
  });

  it('starts from what its store kept, an older document without unknown drops too', () => {
    const k = new InventoryKnowledge(
      memory({ [KNOWLEDGE_DOC]: { items: ['una perla'], prefixes: [B] } })
    );
    expect(k.resolve(`${B}un dado di legno`)).toEqual({ item: 'un dado di legno', sure: true });
    expect(k.resolve(`${A}una perla`)).toEqual({ item: 'una perla', sure: true });
    // A document it cannot read is no knowledge.
    expect(new InventoryKnowledge(memory({ [KNOWLEDGE_DOC]: { items: 3 } })).items.size).toBe(0);
  });

  it('merges a seed, counting what was new, and gives what it knows as one', () => {
    const store = memory();
    const k = new InventoryKnowledge(store);
    k.learnItems(['un sasso']);
    expect(k.seed({ items: ['un sasso', 'una perla'], prefixes: [A, ' '] })).toEqual({
      items: 1,
      prefixes: 1,
    });
    expect(k.snapshot()).toEqual({ items: ['un sasso', 'una perla'], prefixes: prefixForms(A) });
    const writes = store.writes;
    expect(k.seed(k.snapshot())).toEqual({ items: 0, prefixes: 0 });
    expect(store.writes).toBe(writes);
  });

  it('keeps at most so many of each, the oldest dropped first', () => {
    const k = new InventoryKnowledge(memory());
    k.seed({
      items: Array.from({ length: MAX_ITEMS + 2 }, (_, i) => `un sasso numero ${i}`),
      prefixes: Array.from({ length: MAX_PREFIXES + 2 }, (_, i) => `nel fienile ${i}, trovi`),
    });
    expect(k.items.size).toBe(MAX_ITEMS);
    expect(k.items.has('un sasso numero 0')).toBe(false);
    expect(k.prefixes.size).toBe(MAX_PREFIXES);
    for (let i = 0; i < MAX_UNKNOWN + 2; i++) k.resolve(`nel fienile numero ${i} trovi una spada`);
    expect(k.unknown.size).toBe(MAX_UNKNOWN);
  });
});

describe("the owner's guesses", () => {
  const guess = (raw: string, t: number): Guess => ({
    raw,
    guess: 'una corda',
    rarity: 'C',
    tags: [],
    chat: '@InventoryBot',
    t,
  });

  it('are settled by what is learned since, kept across a restart, and forgotten by time', () => {
    const store = memory();
    const k = new InventoryKnowledge(store);
    k.guessed(guess(`${A}una corda di canapa`, 1));
    k.guessed(guess(`${B}una corda di canapa`, 2));
    k.guessed(guess(`${B}una spada di legno`, 3));
    // Nothing learned: nothing settled.
    expect(k.settle()).toEqual([]);
    k.learnItems(['un sasso']);
    expect(k.settle()).toEqual([]);
    // An item that ends a narrative settles every guess it resolves, and teaches its sentence,
    // which settles another in turn.
    k.learnItems(['una corda di canapa']);
    expect(k.settle().map((r) => [r.t, r.item])).toEqual([
      [1, 'una corda di canapa'],
      [2, 'una corda di canapa'],
      [3, 'una spada di legno'],
    ]);
    expect(k.prefixes.has(A)).toBe(true);
    // Kept in the store: a restart knows those left, which what it learns next resolves.
    k.guessed(guess('nel fienile trovi una perla', 4));
    const again = new InventoryKnowledge(store);
    expect(again.guesses.map((g) => g.t)).toEqual([4]);
    expect(again.settle()).toEqual([]);
    again.learnItems(['una perla']);
    expect(again.settle().map((r) => r.item)).toEqual(['una perla']);
    // Forgotten at or before a time, unresolved.
    again.guessed(guess(`${A}x`, 4));
    again.guessed(guess(`${A}y`, 6));
    again.forget(3);
    expect(again.guesses.map((g) => g.t)).toEqual([4, 6]);
    again.forget(5);
    expect(again.guesses.map((g) => g.t)).toEqual([6]);
  });

  it('keeps at most its bound, the oldest dropped first', () => {
    const k = new InventoryKnowledge(memory());
    for (let t = 0; t < MAX_GUESSES + 2; t++) k.guessed(guess(`${A}x`, t));
    expect(k.guesses).toHaveLength(MAX_GUESSES);
    expect(k.guesses[0]?.t).toBe(2);
  });
});

describe('prefixForms', () => {
  it('gives a final space its line-break form', () => {
    expect(prefixForms('trovi ')).toEqual(['trovi ', 'trovi\n']);
    expect(prefixForms("trovi l'")).toEqual(["trovi l'"]);
  });
});
