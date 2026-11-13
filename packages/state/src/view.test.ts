import { describe, expect, it } from 'vitest';
import { at, dm, drop, inventory, line, OWNER } from '#test/events.ts';
import { apply, initialState } from './reduce.ts';
import { type StateEvent } from './types.ts';
import { playerView } from './view.ts';

function view(events: StateEvent[], places?: string[]) {
  const s = initialState(OWNER);
  for (const e of events) apply(s, e);
  return playerView(s, places);
}

const SHAPED = (shape: string): string => `una spada di legno modellato a forma di ${shape}`;
const ZAMPA = 'un Pakkomon di nome Zampa 🐯';
const BRINA = 'un Pakkomon di nome Brina 🐸';

describe('the view', () => {
  it('as_the_wiki_shows_it', () => {
    const v = view(
      [
        inventory([line('un sasso', 'C', 2), line('una perla', 'R', 0)], 0),
        drop('nel bosco trovi un sasso', 'un sasso', 1, {
          location: 'il bosco nebbioso di Valtorbo 🌲',
        }),
        dm({ type: 'craft', ingredients: [], output: null, flavor: '', recipe: 'Muro' }, 2),
        dm({ type: 'use', text: '', items: [], used_item: 'un sasso' }, 3),
      ],
      ['la valle ventosa 🏞', 'il bosco nebbioso di Valtorbo 🌲']
    );
    expect(v).toStrictEqual({
      player: OWNER,
      as_of: at(3),
      recipes: { Muro: { crafted: 1, last_crafted: at(2) } },
      items: {
        'un sasso': { first_seen: at(0), used: 1, last_used: at(3) },
        'una perla': { first_seen: at(0) },
      },
      locations: {
        'il bosco nebbioso di Valtorbo 🌲': { visited: false, adventures: 1 },
        'la valle ventosa 🏞': { visited: false, adventures: 0 },
      },
      recipe_list: null,
      inventory: { 'un sasso': { qty: 3, exact: true, date: at(0), via: 'inventario' } },
      inventory_check: { compared: 0, agreed: 0 },
      pakkomon: [],
      shapes: {},
    });
    // Without the places known, those it names.
    expect(
      Object.keys(view([drop('x', 'un sasso', 0, { location: 'la valle ventosa 🏞' })]).locations)
    ).toStrictEqual(['la valle ventosa 🏞']);
  });

  it('a_shaped_item_is_the_item_of_its_latest_shapes', () => {
    const v = view([
      inventory([line('una spada di legno', 'C', 1)], 0, '/inventario', { truncated: true }),
      inventory([line(SHAPED('stella')), line(SHAPED('luna'), 'C', 2)], 5, '/inventario', {
        truncated: true,
      }),
      inventory([line(SHAPED('sole'))], 1, '/inventario', { truncated: true }),
    ]);
    expect(v.inventory).toStrictEqual({
      'una spada di legno': { qty: 3, exact: true, date: at(5), via: 'inventario' },
    });
    expect(Object.keys(v.items)).toStrictEqual(['una spada di legno']);
    expect(v.items['una spada di legno']).toStrictEqual({ first_seen: at(0) });
    expect(v.shapes['una spada di legno']?.map((x) => x.shape)).toStrictEqual([
      'luna',
      'stella',
      'sole',
    ]);
    // A shaped item seen before the item itself.
    const first = view([
      inventory([line(SHAPED('stella'))], 0),
      inventory([line('una spada di legno')], 1, '/inventario sasso'),
    ]);
    expect(first.items['una spada di legno']).toStrictEqual({ first_seen: at(0) });
  });

  it('every_pakkomon_is_one_item', () => {
    const v = view([
      inventory([line(ZAMPA, 'X'), line(BRINA, 'X', 0)], 2, '/inventario', { truncated: true }),
      inventory([line(BRINA, 'X', 1)], 1, '/inventario', { truncated: true }),
      dm({ type: 'gift', from: 'lucia_b', qty: 1, item: 'un Pakkomon di nome Fiocco ❄' }, 0),
    ]);
    expect(v.inventory).toStrictEqual({
      'un Pakkomon': { qty: 3, exact: false, date: at(2), via: 'inventario' },
    });
    expect(v.items).toStrictEqual({ 'un Pakkomon': { first_seen: at(0) } });
    expect(v.pakkomon.map((p) => [p.name, p.gone])).toStrictEqual([
      ['Brina 🐸', null],
      ['Fiocco ❄', null],
      ['Zampa 🐯', null],
    ]);
  });
});
