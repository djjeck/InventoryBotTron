/**
 * The player state's reducer: the owner's state, from their replies, one event at a time.
 *
 * Holdings (`holdings.ts`) are set by the newest observation:
 *
 *   /inventario complete, unfiltered   exact for everything; unlisted items -> 0
 *   /inventario complete, filtered     exact for listed items; unlisted items in the filter's
 *                                      scope -> 0 (`inventoryScope`: a rarity like "C", or words
 *                                      of the name)
 *   /esporta with its file             exact for everything; unlisted items -> 0
 *   /collezioni, /inv2 complete        as /inventario complete, unfiltered (an /inv2 page is
 *                                      complete only as the one page, "pg 1/1")
 *   /inventario truncated, "M" filter,
 *   /collezioni truncated, /inv2 page,
 *   or with an unknown command         exact for listed items only
 *   /esamina "Ne hai N"                exact
 *   "ti manca X xK" (needs N)          exact: N-K
 *   "hai gia' X xK", /ricetta [*]      at least K (the bot caps it at the quantity the recipe
 *                                      needs, so it is only a lower bound)
 *   /mostra "possedere Kx"             at least K
 *   /dai "ne possiedi solo N"          exact, for the item the /dai command names
 *   drops, gifts, crafts, /usa, /dai   applied as deltas to the last value; a /usa of an item the
 *                                      reader knows to be consumed takes one away
 *
 * Only the owner's events change it (`isMine`), but for a give to the owner, which another
 * player's reply announces, and a fight of one of their Pakkomon (`pakkomon.ts`). A drop whose item
 * is a guess (`sure: false`) is counted under its guess and kept pending: when a later event
 * teaches its item (a listing that names an item that ends it, or a sure drop of its sentence),
 * the count moves to the item (`pending.ts`).
 *
 * `apply` changes the state in place, for a reader that folds a whole history; `reduce` is the same
 * on a copy, pure, for one that keeps each state (MegaBotTron1999's state plugins). Pure logic only.
 */
import { type ItemLine, shapeGiven } from '@inventorybottron/grammar';
import { type Facts, factsOf, Holdings } from './holdings.ts';
import { applyPakkomon } from './pakkomon.ts';
import { learnFrom, MAX_LATEST, MAX_PENDING } from './pending.ts';
import { ensure, own } from './records.ts';
import { inventoryScope, isFailedUse, isMine } from './rules.ts';
import { seen, shaped } from './seen.ts';
import { type HoldingVia, type Know, type State, type StateEvent } from './types.ts';

/** The state of an owner who has done nothing yet; `player`, their username, if known. */
export function initialState(player: string | null = null): State {
  return {
    owner: { player, as_of: null },
    inventory: { held: 0, items: {} },
    items: {},
    recipes: {},
    recipe_list: null,
    inventory_check: { compared: 0, agreed: 0 },
    locations: {},
    pakkomon: {},
    shapes: {},
    drops: { pending: [], latest: [] },
  };
}

/** The next state, from a state and an event: pure, a copy (`apply` changes it in place). */
export function reduce(state: State, e: StateEvent, know: Know = {}): State {
  const next = structuredClone(state);
  apply(next, e, know);
  return next;
}

/** Words of the item in "/dai USER [QTY] ITEM" (lower case), or null. */
function daiWords(query: string | null | undefined): string[] | null {
  const w = (query ?? '').split(/\s+/u).filter((x) => x !== '');
  if ((w[0] ?? '').toLowerCase() !== '/dai' || w.length < 3) return null;
  const rest = /^\p{Nd}+$/u.test(w[2] as string) ? w.slice(3) : w.slice(2);
  return rest.length > 0 ? rest.map((x) => x.toLowerCase()) : null;
}

/**
 * The item a /dai command names, the way the bot looks it up (every word in the name, ignoring
 * case): the only match among the items the owner is estimated to hold, else the only match among
 * every item known; null when there is none or several.
 */
function daiItem(
  query: string | null | undefined,
  hold: Holdings,
  known: () => Iterable<string>
): string | null {
  const words = daiWords(query);
  if (words === null) return null;
  const fits = (n: string): boolean => words.every((x) => n.toLowerCase().includes(x));
  for (const pool of [
    () => hold.names().filter((n) => (hold.get(n)?.qty ?? 0) > 0),
    () => [...known()],
  ]) {
    const c = pool().filter(fits);
    if (c.length === 1) return c[0] as string;
    if (c.length > 1) return null;
  }
  return null;
}

/** The knowledge the reader gave, the state's own standing in for what it did not. */
function knowing(s: State, know: Know): Required<Know> {
  return {
    rarityOf: know.rarityOf ?? ((n) => own(s.inventory.items, n)?.rarity),
    consumed: know.consumed ?? (() => false),
    ingredients: know.ingredients ?? (() => undefined),
    items: know.items ?? (() => Object.keys(s.items)),
  };
}

/** Applies one event to the state, in place. */
export function apply(s: State, e: StateEvent, know: Know = {}): void {
  const k = knowing(s, know);
  const hold = new Holdings(s.inventory);
  applyHoldings(s, e, k, hold);
  applyPakkomon(s, e);
  learnFrom(s, e, hold);
  if (isMine(e, s.owner.player)) s.owner.as_of = e.date ?? null;
}

/** The via of an inventory listing: the command that listed it, `/inventario` when not known. */
function listingVia(e: Extract<StateEvent, { type: 'inventory' }>): HoldingVia {
  const q = (e.query ?? '').toLowerCase();
  const is = (c: string): boolean => q === c || q.startsWith(`${c} `);
  return e.exported
    ? 'esporta'
    : is('/collezioni')
      ? 'collezioni'
      : is('/inv2')
        ? 'inv2'
        : 'inventario';
}

/** The owner's holdings, items, recipes, places and recipe list, from one event. */
function applyHoldings(s: State, e: StateEvent, know: Required<Know>, hold: Holdings): void {
  const player = s.owner.player;
  const d = e.date ?? null;
  if (e.type === 'give' && e.to === player && e.player !== player) {
    if (!e.notified) {
      seen(s, e.item, d);
      hold.delta(e.item, e.qty, d);
    }
    return;
  }
  if (!isMine(e, player)) return;
  const line = (x: ItemLine): Facts => factsOf(x);
  if (e.type === 'inventory') {
    const listed = new Map(e.items.map((x) => [x.name, x.qty]));
    const lines = new Map(e.items.map((x) => [x.name, x]));
    const scope = inventoryScope(e, know.rarityOf);
    const via = listingVia(e);
    if (scope) hold.zeroExcept(listed, scope, d, via);
    for (const [n, q] of listed) {
      hold.exact(n, q, d, via, line(lines.get(n) as ItemLine));
      seen(s, n, d);
    }
  } else if (e.type === 'item_info') {
    seen(s, e.item, d);
    if (e.count !== null)
      hold.exact(e.item, e.count, d, 'esamina', {
        rarity: e.rarity,
        tags: e.usable ? ['usabile'] : [],
      });
  } else if (e.type === 'recipe_detail') {
    const need = new Map<string, number>();
    for (const x of [...e.missing, ...e.have]) {
      need.set(x.name, (need.get(x.name) ?? 0) + x.qty);
      seen(s, x.name, d);
    }
    const missing = new Set(e.missing.map((x) => x.name));
    for (const x of e.missing)
      hold.exact(x.name, (need.get(x.name) as number) - x.qty, d, 'ricetta', line(x));
    for (const x of e.have)
      if (!missing.has(x.name)) hold.atLeast(x.name, x.qty, d, 'ricetta', line(x));
  } else if (e.type === 'recipe_list') {
    const recipes = new Map(
      e.recipes.map((r) => [r.name, r.ready ? 'pronta' : `manca ${r.missing}`])
    );
    s.recipe_list = { date: d, truncated: e.truncated, recipes: Object.fromEntries(recipes) };
    // The bot's count of missing units against the estimate's, before the list adds to it.
    for (const r of e.recipes) {
      const ingr = know.ingredients(r.name);
      if (!ingr || ingr.size === 0) continue;
      let missingUnits = 0;
      for (const [n, q] of ingr) missingUnits += Math.max(0, q - (hold.get(n)?.qty ?? 0));
      s.inventory_check.compared++;
      if (missingUnits === (r.ready ? 0 : r.missing)) s.inventory_check.agreed++;
    }
    for (const r of e.recipes) {
      const ingr = know.ingredients(r.name);
      if (r.ready && ingr && ingr.size > 0)
        for (const [n, q] of ingr) hold.atLeast(n, q, d, 'ricetta');
    }
  } else if (e.type === 'craft') {
    for (const x of e.ingredients) {
      seen(s, x.name, d);
      hold.atLeast(x.name, x.qty, d, 'ricetta', line(x));
      hold.delta(x.name, -x.qty, d);
    }
    if (e.output) {
      seen(s, e.output, d);
      hold.delta(e.output, 1, d);
    }
    if (e.recipe) {
      const r = ensure(s.recipes, e.recipe, () => ({ crafted: 0, last_crafted: null }));
      r.crafted++;
      r.last_crafted = d;
    }
  } else if (e.type === 'drop' && e.resolved) {
    const facts = { rarity: e.rarity, tags: e.usable ? ['usabile'] : [] };
    const sure = e.sure !== false || e.kind !== 'adventure';
    // A guess is counted, but not seen: it may not be an item at all.
    if (sure) seen(s, e.resolved, d);
    hold.delta(e.resolved, 1, d, facts);
    if (e.location) {
      const l = ensure(s.locations, e.location, () => ({ visited: false, adventures: 0 }));
      l.adventures++;
    }
    s.drops.latest.push({ item: e.resolved, ...facts, date: d, sure });
    s.drops.latest.splice(0, s.drops.latest.length - MAX_LATEST);
    if (!sure && e.kind === 'adventure') {
      s.drops.pending.push({ raw: e.raw, guess: e.resolved, ...facts, date: d });
      s.drops.pending.splice(0, s.drops.pending.length - MAX_PENDING);
    }
  } else if (e.type === 'gift') {
    seen(s, e.item, d);
    hold.delta(e.item, e.qty, d);
  } else if (e.type === 'give') {
    // the owner gave something away
    seen(s, e.item, d);
    hold.delta(e.item, -e.qty, d);
  } else if (e.type === 'show') {
    seen(s, e.item, d);
    hold.atLeast(e.item, e.qty, d, 'mostra', {
      rarity: e.rarity,
      tags: e.usable ? ['usabile'] : [],
    });
  } else if (e.type === 'use') {
    for (const x of e.items) {
      seen(s, x.name, d);
      hold.delta(x.name, x.qty, d);
    }
    const item = e.used_item;
    if (item && !isFailedUse(e.text)) {
      seen(s, item, d);
      shaped(s, item, shapeGiven(e.text), d);
      const u = own(s.items, item) as { used?: number; last_used?: string | null };
      u.used = (u.used ?? 0) + 1;
      u.last_used = d;
      // A successful use of an item known to be consumed takes one away; for items whose
      // consumption is not known the count is left alone.
      if (know.consumed(item)) hold.delta(item, -1, d);
    }
  } else if (e.type === 'miss' && e.owned !== undefined) {
    // "non ne hai abbastanza, ne possiedi solo N": exact, for the item the /dai named.
    const item = daiItem(e.query, hold, know.items);
    if (item !== null) {
      seen(s, item, d);
      hold.exact(item, e.owned, d, 'dai');
    }
  } else if (e.type === 'travel' || e.type === 'location') {
    if (e.location !== null) visit(s, e.location);
  } else if (e.type === 'stats') {
    const luogo = (e as Record<string, unknown>)['luogo'];
    if (typeof luogo === 'string' && luogo) visit(s, luogo);
  }
}

/** A place visited. */
function visit(s: State, place: string): void {
  ensure(s.locations, place, () => ({ visited: false, adventures: 0 })).visited = true;
}
