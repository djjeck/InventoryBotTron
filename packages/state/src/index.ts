/**
 * The module's entry, its public API: InventoryBot's player state, the owner's inventory and
 * history kept one reply at a time, for a reader of a whole export (the InventoryBot wiki, which
 * folds its events with `apply` and shows `playerView`) and for a live one (the `inventorybot`
 * module's state plugin, which keeps each state with `reduce`). Installed in MegaBotTron1999 as the
 * library module of `module.json`, it is imported by the name the module provides
 * (`@inventorybottron/state`).
 *
 * This file is the contract: what it exports keeps its meaning across the module's minor and patch
 * versions, and changes only with a new major version (`version` in `module.json`). Everything else
 * in the package is internal and may change at any time.
 *
 * The state reads the grammar's events (`@inventorybottron/grammar`) with the context of each reply
 * (its date, whose it is, the command it answers) and what its reader resolved (a drop's item, a
 * craft's recipe, a use's item): `StateEvent`. What depends on the game beyond one reply (an item's
 * rarity, a recipe's ingredients, whether a use consumes the item) is the reader's to give
 * (`Know`); without it the state stands in with what it knows itself. It ships no knowledge of the
 * game. Pure logic only: no Node APIs, no npm packages.
 */
export { instant, isoOf, isoPlusSeconds } from './dates.ts';
export { MAX_LATEST, MAX_PENDING, taughtItems } from './pending.ts';
export { apply, initialState, reduce } from './reduce.ts';
export {
  type Addressing,
  inventoryScope,
  isFailedUse,
  isMine,
  type Listing,
  nameKey,
  pakkomonOf,
  queryArg,
  RARITY_FILTER,
  type RarityOf,
  renamed,
  sameTransfer,
  type Transfer,
  TRANSFER_WINDOW,
  USE_FAILED,
} from './rules.ts';
export type {
  DropContext,
  EventContext,
  Gain,
  Holding,
  HoldingVia,
  Know,
  PendingDrop,
  PlayerPakkomon,
  PlayerShape,
  PlayerView,
  RecipeList,
  SeenItem,
  State,
  StateEvent,
  ViewHolding,
} from './types.ts';
export { playerView } from './view.ts';
