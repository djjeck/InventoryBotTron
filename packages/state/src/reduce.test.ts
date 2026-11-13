import { describe, expect, it } from 'vitest';
import { at, dm, drop, inventory, line, OWNER } from '#test/events.ts';
import { apply, initialState, reduce } from './reduce.ts';
import { type Know, type State, type StateEvent } from './types.ts';

/** The state after `events`, from the owner's initial one. */
function run(events: StateEvent[], know: Know = {}): State {
  const s = initialState(OWNER);
  for (const e of events) apply(s, e, know);
  return s;
}

/** The quantities of the inventory. */
const qty = (s: State): Record<string, number> =>
  Object.fromEntries(Object.entries(s.inventory.items).map(([n, h]) => [n, h.qty]));

describe('the reducer', () => {
  it('starts_empty_and_reduce_is_pure', () => {
    const s = initialState();
    expect(s.owner).toStrictEqual({ player: null, as_of: null });
    const e = inventory([line('un sasso', 'C', 2)]);
    const next = reduce(s, e);
    expect(qty(next)).toStrictEqual({ 'un sasso': 2 });
    expect(s.inventory.items).toStrictEqual({});
    expect(next.owner.as_of).toBe(at(0));
  });

  it('a_full_listing_is_exact_and_zeroes_what_it_leaves_out', () => {
    const s = run([
      inventory([line('un sasso', 'C', 2), line('una perla', 'R', 1, true)], 0),
      inventory([line('una perla', 'R', 3, true)], 5),
    ]);
    expect(qty(s)).toStrictEqual({ 'un sasso': 0, 'una perla': 3 });
    expect(s.inventory.held).toBe(1);
    expect(s.inventory.items['una perla']).toStrictEqual({
      qty: 3,
      exact: true,
      date: at(5),
      via: 'inventario',
      rarity: 'R',
      tags: ['usabile'],
    });
    expect(s.items['un sasso']).toStrictEqual({ first_seen: at(0) });
  });

  it('an_exported_inventory_is_a_full_exact_snapshot', () => {
    // Before: an exact count, a lower bound, a count from a move only, and a guessed drop.
    const s = run([
      inventory([line('un sasso', 'C', 2)], 0),
      dm({ type: 'show', qty: 2, item: 'una perla', rarity: 'R', usable: true }, 1),
      dm({ type: 'gift', from: 'lucia_b', qty: 3, item: 'una conchiglia' }, 2),
      drop('nel bosco trovi un dado di legno', 'dado di legno', 3, { sure: false }),
      // The file, whatever command it is read with (none here): every item the owner has.
      inventory([line('una perla', 'R', 5, true), line('un dado di legno', 'C', 1)], 4, '', {
        exported: true,
      }),
    ]);
    expect(qty(s)).toStrictEqual({
      'un sasso': 0,
      'una perla': 5,
      'una conchiglia': 0,
      'dado di legno': 0,
      'un dado di legno': 1,
    });
    expect(Object.values(s.inventory.items).every((h) => h.exact && h.via === 'esporta')).toBe(
      true
    );
    expect(s.inventory.held).toBe(2);
    // The guess resolved by the file's name, its count not moved again on top of the file's.
    expect(s.drops.pending).toStrictEqual([]);
    expect(s.drops.latest.map((g) => [g.item, g.sure])).toStrictEqual([['un dado di legno', true]]);
  });

  it('filters_zero_only_their_scope', () => {
    const base = inventory([line('un sasso', 'C', 2), line('una perla', 'R', 1)], 0);
    // By words, by rarity (the state's own rarities), and an "M" or a cut list, nothing.
    expect(qty(run([base, inventory([], 1, '/inventario sasso')]))).toStrictEqual({
      'un sasso': 0,
      'una perla': 1,
    });
    expect(qty(run([base, inventory([], 1, '/i r')]))).toStrictEqual({
      'un sasso': 2,
      'una perla': 0,
    });
    expect(qty(run([base, inventory([], 1, '/inventario M')]))).toStrictEqual({
      'un sasso': 2,
      'una perla': 1,
    });
    expect(
      qty(
        run([base, inventory([line('una perla', 'R', 4)], 1, '/inventario', { truncated: true })])
      )
    ).toStrictEqual({ 'un sasso': 2, 'una perla': 4 });
    // The reader's rarities, when it gives them.
    expect(
      qty(run([base, inventory([], 1, '/inventario C')], { rarityOf: () => 'C' }))
    ).toStrictEqual({ 'un sasso': 0, 'una perla': 0 });
  });

  it('names_the_command_that_listed_it', () => {
    const via = (query: string, o = {}) =>
      run([inventory([line('un sasso')], 0, query, o)]).inventory.items['un sasso']?.via;
    expect(via('/collezioni')).toBe('collezioni');
    expect(via('/inv2')).toBe('inv2');
    expect(via('/esporta', { exported: true })).toBe('esporta');
    expect(via('/inventario')).toBe('inventario');
  });

  it('reads_the_observations_of_single_items', () => {
    const s = run([
      dm({
        type: 'item_info',
        item: 'un sasso',
        rarity: 'C',
        usable: false,
        used_in_raw: null,
        count: 4,
        source: 'adventure',
        from_recipe: null,
      }),
      dm({ type: 'show', qty: 2, item: 'una perla', rarity: 'R', usable: true }),
      dm({ type: 'show', qty: 1, item: 'un sasso', rarity: 'C', usable: false }),
      dm({
        type: 'recipe_detail',
        recipe: 'Muro',
        missing: [line('una ghianda', 'C', 2)],
        have: [line('una ghianda', 'C', 1), line('una conchiglia', 'C', 3)],
      }),
    ]);
    expect(qty(s)).toStrictEqual({
      'un sasso': 4,
      'una perla': 2,
      'una ghianda': 1,
      'una conchiglia': 3,
    });
    expect(s.inventory.items['una perla']?.exact).toBe(false);
    expect(s.inventory.items['una ghianda']?.exact).toBe(true);
  });

  it('checks_a_recipe_list_against_the_estimate', () => {
    const ingredients = new Map([
      ['Muro', new Map([['un sasso', 3]])],
      ['Torre', new Map([['una spada', 1]])],
      ['Corso di vela', new Map<string, number>()],
    ]);
    const know: Know = { ingredients: (r) => ingredients.get(r) };
    const list = dm({
      type: 'recipe_list',
      truncated: false,
      recipes: [
        { name: 'Muro', level: 1, ready: false, missing: 1 },
        { name: 'Torre', level: 1, ready: true, missing: 0 },
        { name: 'Corso di vela', level: 1, ready: true, missing: 0 },
        { name: 'Gara di cucina', level: 2, ready: false, missing: 4 },
      ],
    } as StateEvent);
    const s = run([inventory([line('un sasso', 'C', 2)]), list], know);
    expect(s.inventory_check).toStrictEqual({ compared: 2, agreed: 1 });
    expect(s.recipe_list?.recipes).toStrictEqual({
      Muro: 'manca 1',
      Torre: 'pronta',
      'Corso di vela': 'pronta',
      'Gara di cucina': 'manca 4',
    });
    // A ready recipe holds its ingredients.
    expect(s.inventory.items['una spada']).toMatchObject({ qty: 1, exact: false, via: 'ricetta' });
    // Without the reader's recipes, nothing is compared.
    expect(run([list]).inventory_check).toStrictEqual({ compared: 0, agreed: 0 });
  });

  it('a_craft_takes_its_ingredients_and_gives_its_output', () => {
    const craft = (min: number, recipe?: string): StateEvent =>
      dm(
        {
          type: 'craft',
          ingredients: [line('un sasso', 'C', 2)],
          output: 'un dado di legno',
          flavor: '',
          ...(recipe === undefined ? {} : { recipe }),
        },
        min
      );
    const s = run([
      inventory([line('un sasso', 'C', 3)], 0),
      craft(1, 'Muro'),
      craft(2, 'Muro'),
      craft(3),
    ]);
    // A craft proves its ingredients were held: at least what it took.
    expect(qty(s)).toStrictEqual({ 'un sasso': 0, 'un dado di legno': 3 });
    expect(s.inventory.items['un sasso']?.exact).toBe(false);
    expect(s.recipes).toStrictEqual({ Muro: { crafted: 2, last_crafted: at(2) } });
    // Below zero: under-counted, no longer exact.
    const under = run([
      inventory([line('un sasso', 'C', 1)], 0, '/inventario', { truncated: true }),
      dm({ type: 'give', to: 'lucia_b', qty: 3, item: 'un sasso' }, 1),
    ]);
    expect(under.inventory.items['un sasso']).toMatchObject({ qty: 0, exact: false });
  });

  it('counts_drops_and_the_places_of_adventures', () => {
    const s = run([
      drop('nel bosco trovi un sasso', 'un sasso', 0, {
        sure: true,
        location: 'il bosco nebbioso di Valtorbo 🌲',
      }),
      drop('nel bosco trovi una perla', 'una perla', 1, {
        rarity: 'R',
        usable: true,
        location: 'il bosco nebbioso di Valtorbo 🌲',
      }),
      dm(
        {
          type: 'drop',
          kind: 'lucky',
          item: 'una spada',
          rarity: 'N',
          usable: false,
          resolved: 'una spada',
        },
        2
      ),
      dm({ type: 'drop', kind: 'adventure', raw: 'nulla', rarity: 'C', usable: false }, 3),
      dm(
        { type: 'travel', location: 'la valle ventosa 🏞', exits: [], narrative: null, written: {} },
        4
      ),
      dm(
        { type: 'location', location: 'il bosco nebbioso di Valtorbo 🌲', exits: [], written: {} },
        5
      ),
      { type: 'stats', luogo: 'la palude sussurrante 🌾', dm: true } as unknown as StateEvent,
      dm({ type: 'travel', location: null, exits: [], narrative: 'x', written: {} }, 6),
    ]);
    expect(qty(s)).toStrictEqual({ 'un sasso': 1, 'una perla': 1, 'una spada': 1 });
    expect(s.inventory.items['una perla']).toMatchObject({
      via: 'movimento',
      exact: false,
      rarity: 'R',
      tags: ['usabile'],
    });
    expect(s.locations).toStrictEqual({
      'il bosco nebbioso di Valtorbo 🌲': { visited: true, adventures: 2 },
      'la valle ventosa 🏞': { visited: true, adventures: 0 },
      'la palude sussurrante 🌾': { visited: true, adventures: 0 },
    });
    expect(s.drops.latest.map((g) => [g.item, g.sure])).toStrictEqual([
      ['un sasso', true],
      ['una perla', true],
      ['una spada', true],
    ]);
  });

  it('keeps_only_the_latest_drops', () => {
    const s = run(
      Array.from({ length: 12 }, (_, i) => drop(`trovi un sasso`, 'un sasso', i, { sure: true }))
    );
    expect(s.drops.latest).toHaveLength(10);
    expect(s.drops.latest.at(-1)?.date).toBe(at(11));
  });

  it('gifts_and_gives_move_items', () => {
    const s = run([
      dm({ type: 'gift', from: 'lucia_b', qty: 2, item: 'una perla' }, 0),
      dm({ type: 'give', to: 'lucia_b', qty: 1, item: 'una perla' }, 1),
      // Another player's give to the owner, unless its notice counted it already.
      { type: 'give', to: OWNER, qty: 4, item: 'un sasso', player: 'gino_x', date: at(2) },
      {
        type: 'give',
        to: OWNER,
        qty: 4,
        item: 'un sasso',
        player: 'gino_x',
        date: at(3),
        notified: true,
      },
      // Another player's, and a broadcast, change nothing.
      { type: 'gift', from: 'aldo', qty: 9, item: 'una spada', player: 'gino_x', date: at(4) },
      {
        type: 'gift',
        from: 'aldo',
        qty: 9,
        item: 'una spada',
        dm: true,
        broadcast: true,
        date: at(5),
      },
    ]);
    expect(qty(s)).toStrictEqual({ 'una perla': 1, 'un sasso': 4 });
    expect(s.owner.as_of).toBe(at(1));
  });

  it('a_use_gives_its_items_and_counts_the_item_used', () => {
    const use = (
      min: number,
      text: string,
      used_item?: string,
      items = [line('una ghianda', 'C', 2)]
    ) => dm({ type: 'use', text, items, ...(used_item === undefined ? {} : { used_item }) }, min);
    const s = run(
      [
        inventory(
          [line('un barattolo di miele', 'N', 2, true), line('un dado di legno', 'C', 1, true)],
          0
        ),
        use(1, 'apri il barattolo', 'un barattolo di miele'),
        use(2, 'tiri il dado e fai 3!', 'un dado di legno', []),
        use(3, 'non hai abbastanza ghiande', 'un barattolo di miele', []),
        use(4, 'prendi la colla e gli dai la forma di stella', 'un sasso', []),
        use(5, 'qualcosa', undefined, []),
      ],
      { consumed: (item) => item === 'un barattolo di miele' }
    );
    expect(qty(s)).toStrictEqual({
      'un barattolo di miele': 1,
      'un dado di legno': 1,
      'una ghianda': 2,
    });
    expect(s.items['un barattolo di miele']).toStrictEqual({
      first_seen: at(0),
      used: 1,
      last_used: at(1),
    });
    expect(s.items['un dado di legno']?.used).toBe(1);
    expect(s.shapes['un sasso']).toStrictEqual([
      { shape: 'stella', first_seen: at(4), last_seen: at(4) },
    ]);
  });

  it('a_shape_seen_again_keeps_its_first_and_last_sighting', () => {
    const shaped = 'una spada di legno modellato a forma di stella';
    const s = run([
      inventory([line(shaped)], 5),
      inventory([line(shaped)], 9),
      inventory([line(shaped)], 1),
    ]);
    expect(s.shapes['una spada di legno']).toStrictEqual([
      { shape: 'stella', first_seen: at(1), last_seen: at(9) },
    ]);
  });

  it('a_refused_dai_tells_the_exact_count_of_the_item_it_names', () => {
    const miss = (min: number, query: string): StateEvent =>
      dm({ type: 'miss', reply: 'dai_not_enough', owned: 2 }, min, query);
    const held = inventory(
      [line('una ghianda', 'C', 5), line("una ghianda d'oro", 'R', 0)],
      0,
      '/inventario',
      { truncated: true }
    );
    expect(qty(run([held, miss(1, '/dai lucia_b 3 ghianda')]))).toMatchObject({ 'una ghianda': 2 });
    // Among every item known, when none held fits; several, or none, or no item: nothing.
    expect(
      qty(run([miss(1, '/dai lucia_b spada')], { items: () => ['una spada', 'un sasso'] }))
    ).toStrictEqual({ 'una spada': 2 });
    expect(
      qty(run([miss(1, '/dai lucia_b s')], { items: () => ['una spada', 'un sasso'] }))
    ).toStrictEqual({});
    expect(qty(run([miss(1, '/dai lucia_b nulla')]))).toStrictEqual({});
    expect(qty(run([miss(1, '/dai lucia_b 3')]))).toStrictEqual({});
    expect(qty(run([dm({ type: 'miss', reply: 'dai_not_enough', owned: 2 }, 1)]))).toStrictEqual(
      {}
    );
    const two = inventory([line('una ghianda', 'C', 5), line("una ghianda d'oro", 'R', 1)], 0);
    expect(qty(run([two, miss(1, '/dai lucia_b ghianda')]))).toStrictEqual({
      'una ghianda': 5,
      "una ghianda d'oro": 1,
    });
  });

  it('keeps_a_name_an_objects_prototype_has', () => {
    const s = run([
      inventory([line('__proto__', 'C', 2)], 0, '/inventario', { truncated: true }),
      dm({ type: 'craft', ingredients: [], output: null, flavor: '', recipe: '__proto__' }, 1),
      drop('trovi __proto__', '__proto__', 2, { sure: true, location: '__proto__' }),
    ]);
    expect(Object.keys(s.inventory.items)).toStrictEqual(['__proto__']);
    expect(s.inventory.items['__proto__']?.qty).toBe(3);
    expect(Object.keys(s.items)).toStrictEqual(['__proto__']);
    expect(Object.keys(s.recipes)).toStrictEqual(['__proto__']);
    expect(Object.keys(s.locations)).toStrictEqual(['__proto__']);
    expect(Object.getPrototypeOf(s.items)).toBe(Object.prototype);
  });
});
