/**
 * The player state as the InventoryBot wiki shows it (`PlayerView`): a shaped item counted as the
 * item it was shaped from and every Pakkomon as the one item `un Pakkomon`, holdings above zero
 * only, the places known listed whether visited or not, and everything sorted. Pure logic only.
 */
import { compareCodePoints, PAKKOMON, unshaped } from '@inventorybottron/grammar';
import { instant } from './dates.ts';
import { own } from './records.ts';
import { pakkomonOf } from './rules.ts';
import { type PlayerView, type State, type ViewHolding } from './types.ts';

const byKey = <V>(m: ReadonlyMap<string, V>): [string, V][] =>
  [...m].sort((a, b) => compareCodePoints(a[0], b[0]));

/** The state's view; `places`, every place known, each listed (by default, those it names). */
export function playerView(
  s: State,
  places: Iterable<string> = Object.keys(s.locations)
): PlayerView {
  const firstSeen = new Map(Object.entries(s.items).map(([n, i]) => [n, i.first_seen]));
  const used = new Map<string, number>();
  const lastUsed = new Map<string, string | null>();
  for (const [n, i] of Object.entries(s.items))
    if (i.used !== undefined) {
      used.set(n, i.used);
      lastUsed.set(n, i.last_used ?? null);
    }
  const hold = new Map<string, ViewHolding>(
    Object.entries(s.inventory.items).map(([n, h]) => [
      n,
      { qty: h.qty, exact: h.exact, date: h.date, via: h.via },
    ])
  );

  // Each Pakkomon is the owner's own (`pakkomon`): the items and the inventory count them as the
  // one item every Pakkomon is.
  for (const [name, d] of [...firstSeen]) {
    if (pakkomonOf(name) === null) continue;
    firstSeen.delete(name);
    const cur = firstSeen.get(PAKKOMON);
    if (cur === undefined || (d !== null && instant(d) < instant(cur))) firstSeen.set(PAKKOMON, d);
  }
  let pakkomonHeld: ViewHolding | null = null;
  for (const [name, h] of [...hold]) {
    if (pakkomonOf(name) === null) continue;
    hold.delete(name);
    if (h.qty <= 0) continue;
    pakkomonHeld =
      pakkomonHeld === null
        ? { ...h }
        : {
            qty: pakkomonHeld.qty + h.qty,
            exact: pakkomonHeld.exact && h.exact,
            ...(instant(h.date) > instant(pakkomonHeld.date)
              ? { date: h.date, via: h.via }
              : { date: pakkomonHeld.date, via: pakkomonHeld.via }),
          };
  }
  if (pakkomonHeld !== null) hold.set(PAKKOMON, pakkomonHeld);
  // A shaped item is the item it was shaped from, whatever its shape: a new shape leaves the old
  // name's holding behind, so only those of the latest observation count, summed (one listing may
  // show several shapes).
  for (const [name, d] of [...firstSeen]) {
    const item = unshaped(name);
    if (item === name) continue;
    firstSeen.delete(name);
    const cur = firstSeen.get(item);
    if (cur === undefined || (d !== null && instant(d) < instant(cur))) firstSeen.set(item, d);
  }
  const shapeHoldings = new Map<string, ViewHolding[]>();
  for (const [name, h] of [...hold]) {
    const item = unshaped(name);
    if (item === name) continue;
    hold.delete(name);
    shapeHoldings.set(item, [...(shapeHoldings.get(item) ?? []), h]);
  }
  for (const [item, hs] of shapeHoldings) {
    const base = hold.get(item);
    if (base !== undefined) hs.push(base);
    const latest = Math.max(...hs.map((h) => instant(h.date)));
    const last = hs.filter((h) => instant(h.date) === latest);
    const qty = last.reduce((n, h) => n + h.qty, 0);
    const first = last[0] as ViewHolding;
    hold.set(item, { ...first, qty, exact: last.every((h) => h.exact) });
  }
  return {
    player: s.owner.player,
    as_of: s.owner.as_of,
    recipes: Object.fromEntries(
      byKey(new Map(Object.entries(s.recipes))).map(([n, r]) => [
        n,
        { crafted: r.crafted, last_crafted: r.last_crafted },
      ])
    ),
    items: Object.fromEntries(
      byKey(firstSeen).map(([n, d]) => {
        const u = used.get(n);
        return [
          n,
          u === undefined
            ? { first_seen: d }
            : { first_seen: d, used: u, last_used: lastUsed.get(n) ?? null },
        ];
      })
    ),
    locations: Object.fromEntries(
      [...places].sort(compareCodePoints).map((n) => {
        const l = own(s.locations, n);
        return [n, { visited: l?.visited ?? false, adventures: l?.adventures ?? 0 }];
      })
    ),
    recipe_list: s.recipe_list === null ? null : structuredClone(s.recipe_list),
    inventory: Object.fromEntries(byKey(hold).filter(([, v]) => v.qty > 0)),
    inventory_check: { ...s.inventory_check },
    pakkomon: Object.values(s.pakkomon)
      .map((p) => structuredClone(p))
      .sort(
        (a, b) =>
          Number(a.gone !== null) - Number(b.gone !== null) || compareCodePoints(a.name, b.name)
      ),
    shapes: Object.fromEntries(
      byKey(new Map(Object.entries(s.shapes))).map(([n, m]) => [
        n,
        [...m]
          .map((x) => ({ ...x }))
          .sort(
            (a, b) =>
              instant(b.last_seen) - instant(a.last_seen) || compareCodePoints(a.shape, b.shape)
          ),
      ])
    ),
  };
}
