# Changelog of the `inventorybot-player-state` module

The module's version follows its entry's API (`src/index.ts`), not any repository's releases
(InventoryBotTron's CLAUDE.md, "Versions").

## 0.1.1 (2026-11-13)

- **A whole inventory settles the drops still pending** (issue #1): the `/esporta` file, or a
  complete `/inventario` (or `/collezioni`, or a lone `/inv2` page) with no filter, counts every
  drop before it, as whatever item it was, so a guess it left pending (its item no longer held,
  neither it nor the guess listed) is dropped from `drops.pending`. Until now a later gift or drop
  of that item resolved it, and added the drop's 1 on top of the listing's count. Its gain in
  `drops.latest` keeps its guess. No change to the API.

## 0.1.0 (2026-11-13)

- **The player state, extracted from the InventoryBot wiki** (its `src/inventorybot/player.ts` and
  `player-pakkomon.ts`), which read a whole export at once, as a reducer that applies the events one
  at a time: `apply` (in place) and `reduce` (pure, a copy), from `initialState`, on the grammar's
  events with their context and what their reader resolved (`StateEvent`), and what the reader knows
  of the game besides (`Know`). Its sections: `owner`, `inventory` (each item's count, exactness,
  rarity and tags, and how many are held), `items` (seen and used), `recipes` (made), `recipe_list`,
  `inventory_check`, `locations`, `pakkomon`, `shapes` and `drops` (the latest, and those whose item
  is a guess, pending until an event teaches it). `playerView` is the state as the wiki shows it.
  With them, the rules the wiki's phase 5 shares with it: `isMine`, `queryArg`, `inventoryScope`,
  `isFailedUse`, `nameKey`, `pakkomonOf`, `renamed` and `sameTransfer`.
