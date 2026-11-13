/**
 * Where a drop's item begins, guessed from another drop of the same sentence: two drops of one
 * sentence share the sentence and part ways inside the item, and the item begins with its article
 * (docs/bot-protocol.md §1: "an item name includes its article"). So the cut is the last article
 * that starts a word before the two drops part, and is taken only when they part in that article
 * or in the word right after it; anything longer they share after an article may as well be
 * sentence, and gives no cut. They may also part right at the article, each with its own.
 *
 * The articles are a rule of the language, not knowledge of the game (CLAUDE.md, "Game content"):
 * the definite ones of the protocol's grammar (§1, `article`) and the indefinite ones of the
 * grammar's `guessDropItem`. An item named with a quantifier ("tre metri di …") has no cut here,
 * and two sentences that start alike and part at an article, or a word after one, give a wrong
 * cut: the result is only a guess, and the parser says so. Pure logic: no Node API, nothing of MegaBotTron1999.
 */

/** An article at the start of a string, with the space after it, or its apostrophe form. */
const ARTICLE = /^(?:(?:il|lo|la|i|gli|le|un|uno|una)[ \n]|(?:l|un)['’])/u;
/** A word's end: the article must start one. */
const SPACE = /[ \n]/u;
/** At most one more word after the article: where the drops part. */
const ONE_WORD = /^\S*(?:[ \n]\S*)?$/u;

/** Whether an article starts a word at `i` of `s`. */
function articleAt(s: string, i: number): boolean {
  return (i === 0 || SPACE.test(s[i - 1] as string)) && ARTICLE.test(s.slice(i));
}

/**
 * Where the item of drop `a` begins, from drop `b` (their `raw` narratives): the index in `a`,
 * the sentence before it (never empty), or undefined when the two give no cut: they do not part,
 * one is the other's beginning, or what they share after the last article is longer than it and
 * one word.
 */
export function cutBetween(a: string, b: string): number | undefined {
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  if (shared === a.length || shared === b.length) return undefined;
  // From where they part (both may start an article there: "lo …", "il …") back.
  for (let p = shared; p > 0; p--) {
    if (!articleAt(a, p) || !articleAt(b, p)) continue;
    return ONE_WORD.test(a.slice(p, shared)) ? p : undefined;
  }
  return undefined;
}

/**
 * The cut of `raw` that the drops of `others` give, the longest sentence of them (the most
 * specific), or undefined when none gives one.
 */
export function guessCut(raw: string, others: Iterable<string>): number | undefined {
  let best: number | undefined;
  for (const other of others) {
    const p = cutBetween(raw, other);
    if (p !== undefined && p > (best ?? 0)) best = p;
  }
  return best;
}
