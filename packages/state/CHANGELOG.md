# Changelog of the `inventorybot-player-state` module

The module's version follows its entry's API (`src/index.ts`), not any repository's releases
(InventoryBotTron's CLAUDE.md, "Versions").

## 0.2.0 (2026-11-13)

- **The state no longer resolves guesses; its reader does** (breaking). A drop whose item is a guess
  (`sure: false`) is counted under its guess, and stays so until its reader, which reads every
  message, tells the real item in a new event, `resolved` (`ResolvedEvent`:
  `{ type: 'resolved', guess, item, dropped, rarity, usable }` with the usual context): the state
  moves the count from the guess to the item (as of the drop's date, with its rarity and tags), sees
  the item, and names the drop by its item in `drops.latest`. It moves the count only while the
  guess is still counted, so that a resolution after a listing that counted the drop (a whole
  inventory above all: issue #1) adds nothing twice. The state records the owner's history; it no
  longer learns item names from replies to correct it with.
- **Removed:** `drops.pending` from `State` (its section is `drops: { latest }`), `PendingDrop`,
  `MAX_PENDING` and `taughtItems`; a reply that names a guessed drop's item, or a sure drop of its
  sentence, no longer resolves it inside the reducer, and a whole inventory no longer settles
  anything (it zeroes the guess as any unlisted item). A reader that folded a history and relied on
  them sends `resolved` events instead. `MAX_LATEST` now comes from `reduce.ts`, unchanged in the
  entry.
- **Added to the entry:** `isWholeInventory`, whether an inventory reply lists the whole inventory
  (the `/esporta` file, or a complete listing with no filter), and the type `ResolvedEvent`.
- The `inventorybot` module 0.7.0 needs this version, and this version needs it: update both
  together.

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
