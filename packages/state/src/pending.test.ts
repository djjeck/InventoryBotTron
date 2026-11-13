import { describe, expect, it } from 'vitest';
import { at, dm, drop, inventory, line, OWNER } from '#test/events.ts';
import { MAX_PENDING, taughtItems } from './pending.ts';
import { apply, initialState } from './reduce.ts';
import { type State, type StateEvent } from './types.ts';

function run(events: StateEvent[]): State {
  const s = initialState(OWNER);
  for (const e of events) apply(s, e);
  return s;
}

const qty = (s: State): Record<string, number> =>
  Object.fromEntries(Object.entries(s.inventory.items).map(([n, h]) => [n, h.qty]));

/** A drop whose item the reader guessed: the last words after an article. */
const guessed = (min: number): StateEvent =>
  drop('nella palude trovi una corda di canapa', 'canapa', min, { sure: false, rarity: 'N' });

describe('a drop whose item is a guess', () => {
  it('is_counted_under_its_guess_and_kept_pending', () => {
    const s = run([guessed(0)]);
    expect(qty(s)).toStrictEqual({ canapa: 1 });
    expect(s.inventory.items['canapa']).toMatchObject({ exact: false, rarity: 'N' });
    // Not seen: it may be no item at all.
    expect(s.items).toStrictEqual({});
    expect(s.drops.pending).toStrictEqual([
      {
        raw: 'nella palude trovi una corda di canapa',
        guess: 'canapa',
        rarity: 'N',
        tags: [],
        date: at(0),
      },
    ]);
    expect(s.drops.latest).toStrictEqual([
      { item: 'canapa', rarity: 'N', tags: [], date: at(0), sure: false },
    ]);
  });

  it('is_resolved_by_a_sure_drop_of_its_sentence', () => {
    const s = run([guessed(0), drop('nella palude trovi un sasso', 'un sasso', 5, { sure: true })]);
    expect(qty(s)).toStrictEqual({ canapa: 0, 'una corda di canapa': 1, 'un sasso': 1 });
    expect(s.inventory.items['una corda di canapa']).toMatchObject({
      rarity: 'N',
      via: 'movimento',
    });
    expect(s.items['una corda di canapa']).toStrictEqual({ first_seen: at(0) });
    expect(s.drops.pending).toStrictEqual([]);
    expect(s.drops.latest.map((g) => [g.item, g.sure])).toStrictEqual([
      ['una corda di canapa', true],
      ['un sasso', true],
    ]);
  });

  it('is_resolved_by_a_sure_drop_of_its_item', () => {
    const s = run([
      guessed(0),
      drop('sul molo trovi una corda di canapa', 'una corda di canapa', 5),
    ]);
    expect(qty(s)).toStrictEqual({ canapa: 0, 'una corda di canapa': 2 });
    expect(s.drops.pending).toStrictEqual([]);
  });

  it('is_resolved_by_a_listing_that_already_counts_it', () => {
    // A listing exact for the item counts the drop already, and zeroes the guess.
    const full = run([guessed(0), inventory([line('una corda di canapa', 'N', 1)], 5)]);
    expect(qty(full)).toStrictEqual({ canapa: 0, 'una corda di canapa': 1 });
    expect(full.inventory.items['una corda di canapa']?.exact).toBe(true);
    expect(full.drops.pending).toStrictEqual([]);
    // A cut one says nothing of the guess, which loses the drop.
    const cut = run([
      guessed(0),
      inventory([line('una corda di canapa', 'N', 1)], 5, '/inventario', { truncated: true }),
    ]);
    expect(qty(cut)).toStrictEqual({ canapa: 0, 'una corda di canapa': 1 });
  });

  it('is_resolved_by_a_listing_that_names_its_item_without_counting_it', () => {
    const s = run([
      guessed(0),
      dm({
        type: 'recipe_detail',
        recipe: 'Corso di vela',
        missing: [],
        have: [line('una corda di canapa', 'N', 1)],
      }),
    ]);
    // The recipe's lower bound, then the drop moved from its guess.
    expect(qty(s)).toStrictEqual({ canapa: 0, 'una corda di canapa': 2 });
  });

  it('a_guess_that_was_right_is_only_confirmed', () => {
    const s = run([
      drop('trovi un sasso', 'un sasso', 0, { sure: false }),
      dm({ type: 'show', qty: 1, item: 'un sasso', rarity: 'C', usable: false }, 1),
    ]);
    expect(qty(s)).toStrictEqual({ 'un sasso': 1 });
    expect(s.drops.pending).toStrictEqual([]);
    expect(s.drops.latest[0]?.sure).toBe(true);
  });

  it('stays_pending_while_nothing_resolves_it', () => {
    const s = run([
      guessed(0),
      drop('nel bosco trovi un sasso', 'un sasso', 1, { sure: true }),
      inventory([line('una perla')], 2, '/inventario', { truncated: true }),
      dm({ type: 'cooldown' }, 3),
      drop('altrove una perla', 'una perla', 4, { sure: false }),
      {
        type: 'show',
        qty: 1,
        item: 'una corda di canapa',
        rarity: 'N',
        usable: false,
        player: 'gino_x',
        date: at(5),
      },
    ]);
    // Another player's /mostra teaches the item too.
    expect(s.drops.pending.map((p) => p.guess)).toStrictEqual(['una perla']);
  });

  it('keeps_at_most_its_bound', () => {
    const s = run(Array.from({ length: MAX_PENDING + 3 }, (_, i) => guessed(i)));
    expect(s.drops.pending).toHaveLength(MAX_PENDING);
    expect(s.drops.pending[0]?.date).toBe(at(3));
  });

  it('teaches_from_every_listing', () => {
    const l = line('un sasso');
    const names = (e: Record<string, unknown>) => taughtItems(e as unknown as StateEvent);
    expect(names({ type: 'title', items: [l] })).toStrictEqual(['un sasso']);
    expect(names({ type: 'use', text: '', items: [l] })).toStrictEqual(['un sasso']);
    expect(
      names({ type: 'craft', ingredients: [l], output: 'una spada', flavor: '' })
    ).toStrictEqual(['un sasso', 'una spada']);
    expect(names({ type: 'craft', ingredients: [], output: null, flavor: '' })).toStrictEqual([]);
    expect(names({ type: 'gift', item: 'un sasso' })).toStrictEqual(['un sasso']);
    expect(names({ type: 'give', item: 'un sasso' })).toStrictEqual(['un sasso']);
    expect(names({ type: 'item_info', item: 'un sasso' })).toStrictEqual(['un sasso']);
    expect(names({ type: 'drop', kind: 'lucky', item: 'un sasso' })).toStrictEqual(['un sasso']);
    expect(names({ type: 'drop', kind: 'adventure', raw: 'x' })).toStrictEqual([]);
  });

  it('a_sentence_is_taught_in_both_forms_and_only_by_a_whole_sure_drop', () => {
    // A player-made name may start on a new line, where the grammar drops the space.
    const s = run([
      drop('nella palude trovi\nuna corda di canapa', 'canapa', 0, { sure: false }),
      drop('nella palude trovi un sasso', 'un sasso', 1, { sure: true }),
    ]);
    expect(s.drops.pending).toStrictEqual([]);
    expect(qty(s)['una corda di canapa']).toBe(1);
    // A drop whose item is its whole narrative, or does not end it, teaches no sentence.
    const none = run([
      guessed(0),
      drop('un sasso', 'un sasso', 1, { sure: true }),
      drop('nella palude trovi una spada!', 'una spada', 2, { sure: true }),
    ]);
    expect(none.drops.pending).toHaveLength(1);
  });
});
