/**
 * The inventory estimate's operations, on the state's `inventory` section, in place. The bot never
 * shows the whole inventory reliably (a long `/inventario` is cut off), so each holding is set by
 * the newest observation: exactly, as a lower bound, or as a change of the last value. Each records
 * whether it is exact, and the date and kind of the observation that set it; `held` counts those
 * above zero. Pure logic only.
 */
import { own, put } from './records.ts';
import { type Holding, type HoldingVia, type State } from './types.ts';

/** What a reply says of an item besides its number: its rarity and tags. */
export interface Facts {
  rarity: string | null;
  tags: string[];
}

/** An item line's facts. */
export const factsOf = (line: { rarity: string | null; usable: boolean }): Facts => ({
  rarity: line.rarity,
  tags: line.usable ? ['usabile'] : [],
});

export class Holdings {
  /** The names a holding was set exactly for by the event being applied. */
  readonly exactNow = new Set<string>();

  readonly inv: State['inventory'];

  constructor(inv: State['inventory']) {
    this.inv = inv;
  }

  get(name: string): Holding | undefined {
    return own(this.inv.items, name);
  }

  /** The names, in order of first observation. */
  names(): string[] {
    return Object.keys(this.inv.items);
  }

  #put(name: string, h: Holding): void {
    const before = this.get(name);
    this.inv.held += Number(h.qty > 0) - Number((before?.qty ?? 0) > 0);
    put(this.inv.items, name, h);
  }

  #facts(name: string, facts: Facts | undefined): Facts {
    const cur = this.get(name);
    return facts ?? { rarity: cur?.rarity ?? null, tags: cur?.tags ?? [] };
  }

  exact(name: string, qty: number, date: string | null, via: HoldingVia, facts?: Facts): void {
    this.#put(name, { qty, exact: true, date, via, ...this.#facts(name, facts) });
    this.exactNow.add(name);
  }

  atLeast(name: string, qty: number, date: string | null, via: HoldingVia, facts?: Facts): void {
    const cur = this.get(name);
    if (cur && cur.qty >= qty) return; // still consistent with what was known
    this.#put(name, { qty, exact: false, date, via, ...this.#facts(name, facts) });
  }

  delta(name: string, d: number, date: string | null, facts?: Facts): void {
    const cur = this.get(name);
    if (cur === undefined) {
      // Never observed: only this change is known.
      this.#put(name, {
        qty: Math.max(d, 0),
        exact: false,
        date,
        via: 'movimento',
        ...this.#facts(name, facts),
      });
      return;
    }
    const q = cur.qty + d;
    // Below zero: it was under-counted at some point.
    this.#put(name, {
      ...cur,
      qty: Math.max(q, 0),
      exact: q < 0 ? false : cur.exact,
      ...(facts ?? {}),
    });
  }

  /** Every holding not in `keep` that `pred` covers is exactly zero. */
  zeroExcept(
    keep: ReadonlyMap<string, number>,
    pred: (name: string) => boolean,
    date: string | null,
    via: HoldingVia
  ): void {
    for (const name of this.names())
      if (!keep.has(name) && pred(name)) this.exact(name, 0, date, via);
  }
}
