import { describe, expect, it } from 'vitest';
import { at, dm, drop, inventory, line, OWNER } from '#test/events.ts';
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

/** The reader's correction of the guess of `min`, told at `told`. */
const resolved = (min: number, told: number, item = 'una corda di canapa'): StateEvent =>
  dm(
    { type: 'resolved', guess: 'canapa', item, dropped: at(min), rarity: 'N', usable: true },
    told
  );

describe('a drop whose item is a guess', () => {
  it('is_counted_under_its_guess_and_not_seen', () => {
    const s = run([guessed(0)]);
    expect(qty(s)).toStrictEqual({ canapa: 1 });
    expect(s.inventory.items['canapa']).toMatchObject({ exact: false, rarity: 'N' });
    // Not seen: it may be no item at all.
    expect(s.items).toStrictEqual({});
    expect(s.drops).toStrictEqual({
      latest: [{ item: 'canapa', rarity: 'N', tags: [], date: at(0), sure: false }],
    });
  });

  it('is_corrected_only_by_its_reader', () => {
    // Every reply that names the item, or teaches the sentence, leaves the guess as it was.
    const s = run([
      guessed(0),
      drop('nella palude trovi un sasso', 'un sasso', 5, { sure: true }),
      dm({ type: 'show', qty: 1, item: 'una corda di canapa', rarity: 'N', usable: false }, 6),
    ]);
    expect(qty(s)).toStrictEqual({ canapa: 1, 'un sasso': 1, 'una corda di canapa': 1 });
    expect(s.drops.latest[0]).toMatchObject({ item: 'canapa', sure: false });
  });
});

describe('a resolved guess', () => {
  it('moves_the_count_from_the_guess_to_the_item_at_the_drops_date', () => {
    const s = run([guessed(0), resolved(0, 5)]);
    expect(qty(s)).toStrictEqual({ canapa: 0, 'una corda di canapa': 1 });
    expect(s.inventory.items['una corda di canapa']).toStrictEqual({
      qty: 1,
      exact: false,
      date: at(0),
      via: 'movimento',
      rarity: 'N',
      tags: ['usabile'],
    });
    expect(s.items['una corda di canapa']).toStrictEqual({ first_seen: at(0) });
    expect(s.drops.latest).toStrictEqual([
      { item: 'una corda di canapa', rarity: 'N', tags: [], date: at(0), sure: true },
    ]);
    // The owner's latest event is the correction's.
    expect(s.owner.as_of).toBe(at(5));
  });

  it('adds_to_the_items_count_then_a_listing_that_names_it_sets_it', () => {
    // The reader tells the correction before the listing that taught it.
    const s = run([
      inventory([line('una corda di canapa', 'N', 2)], 0, '/inventario corda'),
      guessed(1),
      resolved(1, 5),
      inventory([line('una corda di canapa', 'N', 3)], 5, '/inventario corda'),
    ]);
    expect(qty(s)).toStrictEqual({ 'una corda di canapa': 3, canapa: 0 });
  });

  it('a_guess_that_was_right_is_only_confirmed', () => {
    const s = run([
      drop('trovi un sasso', 'un sasso', 0, { sure: false }),
      dm(
        {
          type: 'resolved',
          guess: 'un sasso',
          item: 'un sasso',
          dropped: at(0),
          rarity: 'C',
          usable: false,
        },
        1
      ),
    ]);
    expect(qty(s)).toStrictEqual({ 'un sasso': 1 });
    expect(s.items['un sasso']).toStrictEqual({ first_seen: at(0) });
    expect(s.drops.latest[0]?.sure).toBe(true);
  });

  it('is_never_counted_twice_after_a_whole_inventory', () => {
    // Issue #1: the item is gone by the snapshot, which lists neither it nor the guess.
    for (const snapshot of [
      inventory([line('un sasso', 'C', 2)], 5, '/esporta', { exported: true }),
      inventory([line('un sasso', 'C', 2)], 5),
    ]) {
      const s = run([guessed(0), snapshot, resolved(0, 10)]);
      expect(qty(s)).toStrictEqual({ canapa: 0, 'un sasso': 2 });
      // The drop is still named by its item, which is seen.
      expect(s.drops.latest[0]).toMatchObject({ item: 'una corda di canapa', sure: true });
    }
  });

  it('of_a_drop_it_never_counted_moves_nothing', () => {
    const s = run([resolved(0, 1)]);
    expect(qty(s)).toStrictEqual({});
    expect(s.drops.latest).toStrictEqual([]);
    // An empty item is no correction.
    const empty = run([guessed(0), resolved(0, 1, '')]);
    expect(qty(empty)).toStrictEqual({ canapa: 1 });
    expect(empty.items).toStrictEqual({});
  });

  it('is_another_players_never', () => {
    const theirs = { ...resolved(0, 1), dm: false, player: 'lucia_b' } as StateEvent;
    const s = run([guessed(0), theirs]);
    expect(qty(s)).toStrictEqual({ canapa: 1 });
  });
});
