# Changelog of the `inventorybot` module

The module's version follows what it offers an instance (its plugin, the plugin's events, config and
interface), not any repository's releases (InventoryBotTron's CLAUDE.md, "Versions").

## 0.3.0 (2026-11-13)

- **A new plugin, `inventorybot-state`**: the owner's player state, kept by MegaBotTron1999's
  `statePlugin` from the `inventorybot` parser's `inventorybot.turn` and `inventorybot.reply`, with
  InventoryBotTron's reducer (`@inventorybottron/state`, which the module now imports, `^0.1.0`).
  Its sections are the package's (`owner`, `inventory`, `items`, `recipes`, `recipe_list`,
  `inventory_check`, `locations`, `pakkomon`, `shapes`, `drops`); a whole listing is a snapshot of
  the inventory, a guessed drop an uncertain change, kept pending and resolved in the reducer when a
  later event teaches its item. Its interface adds `count` and `held`; its `pin` defaults to
  `inventory.held` and `drops.latest`. Its one input, `events`, is bound to the parser's events
  (README, "The player state"). No change to the parser.

## 0.2.0 (2026-11-13)

- **A new event, `inventorybot.reply`** (`{ chat, query, self?, reply }`): each reply of the bot's
  in the private chat that lists, shows or moves the owner's items (an inventory, a title list, an
  item's card, a recipe and the recipe list, a craft, a `/mostra`, a use, a gift, a give, a `/dai`
  refused with the count owned), a place reached or shown, and their Pakkomon's records and fights,
  as the grammar reads it (`reply`) with the owner's last command there (`query`), for the player
  state. The `/esporta` file is not among them: the account gives its caption only.
- **A gain carries its drop's narrative**, `raw` (optional; none for the lucky adventure), from
  which a reader resolves a guess again once it knows more. Nothing else of `inventorybot.turn`
  changes: a node that reads it ignores the field.

## 0.1.2 (2026-11-13)

- It imports the grammar `^0.4.0`, whose entry exports more; it uses nothing new of it. No change to
  the plugin.

## 0.1.1 (2026-11-12)

- **The action `seed`**, which 0.1.0 already offered, is described: the owner adds to what the
  parser knows the items and drops' sentences of their own export, `{ items, prefixes }` as
  InventoryBotTron's `scripts/seed-knowledge.ts` prints them, merged with what it knows and bounded
  as the rest; it answers how many of each were new. The owner calls it from the Plugins page or the
  control API (InventoryBotTron's README, "Seeding the parser"). No change to the plugin.

## 0.1.0 (2026-11-12)

- **The `inventorybot` parser plugin, moved here** from the `game-bots` module of
  [RegnoTron](https://github.com/djjeck/RegnoTron) (its version 0.1.0), with the same plugin id, the
  same `inventorybot.turn` event (`{ chat, outcome }`, the outcome
  `{ kind: 'gain', bot, item, rarity, tags, sure }` or `{ kind: 'nothing', bot, reason, retryMs }`,
  or `unknown` for a message claimed and unread), the same contract (`state.rest`, `actions.sent`)
  and the same store, so that the node of a graph keeps running on its instance. It imports the
  grammar as `@inventorybottron/grammar` (`^0.3.1`).
- **It ships no knowledge of the game.** The sentence prefixes the plugin started with in
  `game-bots` are gone: it knows only what it reads. An inventory, a recipe, a craft, a `/mostra` or
  the lucky adventure teaches the items it lists; a drop that ends with a known item teaches its
  sentence, and one that starts with a known sentence its item, both `sure`. Any other drop is a
  guess (`sure: false`), cut where it parts from an earlier unknown drop of the same sentence, at an
  article, or after the last indefinite article; nothing is learned from it. The store's `knowledge`
  document keeps the unknown drops too (`unknown`, the latest 200); one without them, as `game-bots`
  wrote it, still reads.
