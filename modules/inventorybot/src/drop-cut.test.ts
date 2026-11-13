import { describe, expect, it } from 'vitest';
import { cutBetween, guessCut } from './drop-cut.ts';

// Invented sentences (CLAUDE.md, "Game content"), with items of scripts/universe.md.
const S = 'mentre conti le nuvole dal tetto del mulino ti cade in mano ';

describe('cutBetween', () => {
  it('cuts at the article where two drops of one sentence part', () => {
    expect(cutBetween(`${S}un sasso`, `${S}una perla`)).toBe(S.length);
    expect(cutBetween(`${S}un sasso`, `${S}un secchio di fango`)).toBe(S.length);
    expect(cutBetween(`${S}un dado di legno`, `${S}una conchiglia`)).toBe(S.length);
  });

  it('cuts at definite articles and apostrophes, also when the drops part right there', () => {
    expect(cutBetween(`${S}lo stecco di legno di un ghiacciolo`, `${S}il primo numero`)).toBe(
      S.length
    );
    expect(cutBetween(`${S}l'ancora`, `${S}l'ombra`)).toBe(S.length);
    expect(cutBetween(`${S}un'ancora`, `${S}una spada`)).toBe(S.length);
  });

  it('cuts at the last article, whatever articles the sentence holds', () => {
    const s = 'un gufo ti guarda e la sua ala lascia cadere ';
    expect(cutBetween(`${s}una ghianda`, `${s}un sasso`)).toBe(s.length);
  });

  it('gives no cut when the drops share more than the article and a word', () => {
    expect(cutBetween(`${S}un barattolo di miele`, `${S}un barattolo di vetro`)).toBeUndefined();
    // Two sentences that start alike part long after their last shared article.
    expect(
      cutBetween('nel mulino una gazza ti porta un sasso', 'nel mulino una gazza ti ruba una perla')
    ).toBeUndefined();
  });

  it('gives no cut for the same drop, one drop the beginning of the other, or no article', () => {
    expect(cutBetween(`${S}un sasso`, `${S}un sasso`)).toBeUndefined();
    expect(cutBetween(`${S}un sasso`, `${S}un sasso grosso`)).toBeUndefined();
    expect(cutBetween('trovi sassi', 'trovi perle')).toBeUndefined();
    // Never an empty sentence.
    expect(cutBetween('un sasso', 'una perla')).toBeUndefined();
    // An article inside a word starts nothing.
    expect(cutBetween(`${S}sul sasso`, `${S}sul secchio`)).toBeUndefined();
  });
});

describe('guessCut', () => {
  it('takes the longest sentence the others give, or none', () => {
    const other = 'nel fienile ';
    const drops = [`${S}una perla`, `${other}un dado di legno`, `${S}un sasso`];
    expect(guessCut(`${S}una conchiglia`, drops)).toBe(S.length);
    expect(guessCut(`${S}una conchiglia`, [])).toBeUndefined();
    // A sentence that is a longer one's beginning: the longer wins.
    const longer = `${S}e poi `;
    expect(guessCut(`${longer}una spada`, [`${S}una perla`, `${longer}un sasso`])).toBe(
      longer.length
    );
  });
});
