/**
 * The player state's types: the events it applies (the grammar's events with the context of the
 * reply and what its reader resolved), the state itself, section by section, and its view, the
 * form the InventoryBot wiki shows. Field names are those of the JSON form (snake_case).
 */
import {
  type AdventureDropEvent,
  type CraftEvent,
  type Event,
  type GiveEvent,
  type LuckyDropEvent,
  type StatsEvent,
  type UseEvent,
} from '@inventorybottron/grammar';

/** What the reader of a reply knows of its context. */
export interface EventContext {
  /** When the bot said it: ISO 8601 with its UTC offset (`dates.ts`); null when not known. */
  date?: string | null | undefined;
  /** The @username (without `@`) the reply concerns, if known. */
  player?: string | null | undefined;
  /** Said in the private chat with the bot. */
  dm?: boolean | undefined;
  /** Forwarded into the chat: it did not happen there and then. */
  forwarded?: boolean | undefined;
  /** A group broadcast ("[W]", "[N]"). */
  broadcast?: boolean | undefined;
  /** The command it answers, when known (`/inventario C`). */
  query?: string | null | undefined;
}

/** An adventure's or the lucky adventure's drop, with its item as its reader resolved it. */
export type DropContext = {
  /** The item; a drop without one changes nothing. */
  resolved?: string | undefined;
  /** Where the owner was. */
  location?: string | null | undefined;
  /**
   * False when `resolved` is only a guess (neither the item nor the drop's sentence was known): the
   * drop is kept pending (`drops.pending`) until an event teaches its item.
   */
  sure?: boolean | undefined;
};

/** The events the state applies: a reply's event, its context, and what its reader resolved. */
export type StateEvent =
  | ((AdventureDropEvent | LuckyDropEvent) & EventContext & DropContext)
  | (CraftEvent & EventContext & { /** The recipe made. */ recipe?: string | undefined })
  | (UseEvent & EventContext & { /** The item used. */ used_item?: string | undefined })
  | (GiveEvent &
      EventContext & {
        /**
         * A give to the owner whose private notice ("ti ha dato") is applied too: the same
         * transfer, counted once (`sameTransfer`).
         */
        notified?: boolean | undefined;
      })
  | (Exclude<
      Event,
      AdventureDropEvent | LuckyDropEvent | CraftEvent | UseEvent | GiveEvent | StatsEvent
    > &
      EventContext)
  | (StatsEvent & EventContext);

/**
 * What the reader knows of the game besides the state, for the replies whose meaning depends on
 * it; each is optional, and the state's own knowledge stands in for it (`know.ts`).
 */
export interface Know {
  /** An item's rarity: for a rarity-filtered listing's scope. */
  rarityOf?(name: string): string | null | undefined;
  /** Whether a use of the item consumes it. */
  consumed?(item: string): boolean;
  /** A recipe's ingredients and their quantities: for a recipe list's check. */
  ingredients?(recipe: string): ReadonlyMap<string, number> | undefined;
  /** Every item name known: for the item a `/dai` names. */
  items?(): Iterable<string>;
}

/** How a holding was last set (Italian, as the wiki shows it). */
export type HoldingVia =
  | 'inventario'
  | 'collezioni'
  | 'inv2'
  | 'esporta'
  | 'esamina'
  | 'ricetta'
  | 'mostra'
  | 'dai'
  | 'movimento';

/** One item of the inventory, as the state estimates it. */
export interface Holding {
  qty: number;
  /** False when only a lower bound or a change is known. */
  exact: boolean;
  /** The observation that last set it. */
  date: string | null;
  via: HoldingVia;
  /** Its rarity code (`C` to `X`, `L3`, …), from the latest reply that gave it; null if none did. */
  rarity: string | null;
  /** `usabile`, or none. */
  tags: string[];
}

/** An item the owner has seen, and used. */
export interface SeenItem {
  first_seen: string | null;
  /** Successful uses; only for an item used. */
  used?: number;
  last_used?: string | null;
}

/** A drop whose item is a guess, kept until an event teaches it. */
export interface PendingDrop {
  /** Its narrative, which the item ends (`raw` of the grammar's drop). */
  raw: string;
  /** The item it was counted as. */
  guess: string;
  rarity: string;
  tags: string[];
  date: string | null;
}

/** One of the latest drops. */
export interface Gain {
  item: string;
  rarity: string;
  tags: string[];
  date: string | null;
  /** False while the item is a guess. */
  sure: boolean;
}

/** A shape of one of the owner's shaped items: the text, and when it was seen. */
export interface PlayerShape {
  shape: string;
  first_seen: string | null;
  last_seen: string | null;
}

/** One of the owner's Pakkomon, now or once: what the replies show of it. Dates are ISO. */
export interface PlayerPakkomon {
  /** Its name and emoji, as last written. */
  name: string;
  /** How it came to the owner: hatched from a sphere, or received from a player; null when not shown. */
  came: { via: 'hatched' | 'received'; from: string | null; date: string | null } | null;
  /** The day it was hatched and by whom, as its record says. */
  born: string | null;
  maker: string | null;
  first_seen: string | null;
  last_seen: string | null;
  /**
   * No longer the owner's: given to a player, extracted, or left out of a list of all their
   * Pakkomon (the scanner's, a complete inventory); null while the owner has it.
   */
  gone: { via: 'given' | 'extracted' | 'unlisted'; to: string | null; date: string | null } | null;
  /** Its latest record. */
  record: { wins: number; losses: number; date: string | null } | null;
  /** Its equipment, from the latest equipping or record; null when it has none or none is known. */
  equipment: string | null;
  /** The power-ups its latest record shows, one icon each. */
  power_ups: string[];
  /** The items the owner gave it as power-ups. */
  power_up_items: string[];
  /** The fights seen: won, lost, and the wins after which it learned something. */
  fights: { won: number; lost: number; learned: number };
  /**
   * Its widest win: the stun its ending phrase states, in minutes, which its strength and
   * equipment's bonus together reach at least.
   */
  best_win: { min: number; max: number | null } | null;
  /** Until when it is stunned, from the latest stun shown; null when ready, or not known. */
  stunned_until: string | null;
  /** The probe's latest reading of it. */
  probe: string | null;
}

/** The latest `/ricetta` list; `truncated`: it was cut, so a recipe missing from it may still be visible. */
export interface RecipeList {
  date: string | null;
  truncated: boolean;
  /** Recipe name to `pronta` or `manca N`. */
  recipes: Record<string, string>;
}

/**
 * The owner's state at InventoryBot, kept one event at a time. Its keys are its sections; every
 * name is as the replies wrote it (a shaped item, each Pakkomon, under its own name: the view
 * merges them).
 */
export interface State {
  /** Whose state it is, and the date of their latest event. */
  owner: { player: string | null; as_of: string | null };
  /** The inventory: each item ever estimated (none left: `qty` 0), and how many are held. */
  inventory: { held: number; items: Record<string, Holding> };
  /** The items seen, and those used. */
  items: Record<string, SeenItem>;
  /** The recipes made: how often, and last when. */
  recipes: Record<string, { crafted: number; last_crafted: string | null }>;
  recipe_list: RecipeList | null;
  /** The recipes of the `/ricetta` lists compared with the estimate, and those it got right. */
  inventory_check: { compared: number; agreed: number };
  /** The places visited, and the adventures done in each. */
  locations: Record<string, { visited: boolean; adventures: number }>;
  /** The owner's Pakkomon, by their name's key (`nameKey`). */
  pakkomon: Record<string, PlayerPakkomon>;
  /** The shapes the owner's shaped items had, per item, in the order first seen. */
  shapes: Record<string, PlayerShape[]>;
  /** The drops whose item is a guess, and the latest drops, newest last. */
  drops: { pending: PendingDrop[]; latest: Gain[] };
}

/** An estimated holding, as the view shows it. */
export type ViewHolding = Pick<Holding, 'qty' | 'exact' | 'date' | 'via'>;

/** The player state as the InventoryBot wiki shows it (`view.ts`). */
export interface PlayerView {
  player: string | null;
  /** Date of the owner's latest event. */
  as_of: string | null;
  recipes: Record<string, { crafted: number; last_crafted: string | null }>;
  /** Per item: when first seen; `used` and `last_used` only for an item the owner used successfully. */
  items: Record<string, SeenItem>;
  locations: Record<string, { visited: boolean; adventures: number }>;
  recipe_list: RecipeList | null;
  /** Estimated holdings above zero, a shaped item's and every Pakkomon's merged. */
  inventory: Record<string, ViewHolding>;
  inventory_check: { compared: number; agreed: number };
  /** The owner's Pakkomon, current ones first, then by name. */
  pakkomon: PlayerPakkomon[];
  /** The shapes the owner's shaped items had, per item, the latest first. */
  shapes: Record<string, PlayerShape[]>;
}
