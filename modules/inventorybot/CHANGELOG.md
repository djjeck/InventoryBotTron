# Changelog of the `inventorybot` module

The module's version follows what it offers an instance (its plugin, the plugin's events, config and
interface), not any repository's releases (InventoryBotTron's CLAUDE.md, "Versions").

## 0.7.0 (2026-11-13)

- **The parser resolves the owner's guesses, not the state** (breaking for the state's shape). The
  parser keeps the owner's drops whose item it guessed (at most 50, in its `knowledge` document)
  and, whenever any message it reads (any player's, in any chat it reads, played back or live) or a
  seed teaches it an item or a sentence that resolves one, publishes a new event,
  **`inventorybot.resolved`** (`{ chat, guess, item, raw, rarity, tags, date, playback? }`, `date`
  the drop's time in ms), before the reply that taught it. A whole inventory of the owner's (the
  `/esporta` file, or a complete unfiltered listing) forgets the guesses before it unresolved, since
  it counted them: the parser's form of the state's fix of issue #1. It now learns item names from a
  craft's output, a `/usa`'s items, a gift and a give too, as the state did.
- **The `inventorybot-state` node** applies `inventorybot.resolved` by moving the drop's count from
  the guess to the item, with the state package's new `resolved` event, and tells nothing of it in
  its own events: no `gained` and no event of its own (the state's events announce new facts, never
  corrections of past facts; `changed` still tells the sections changed). It keeps no
  `drops.pending` any more: its store's first migration takes it out of a kept state, so a
  `state.get({ path: 'drops.pending' })` finds nothing. Guesses that were pending in the state at
  the update are not carried to the parser: they stay counted under their guess until the next whole
  listing, so an `/esporta` after the update sets the inventory right.
- It imports the player state `^0.2.0`: **update `inventorybot-player-state` to 0.2.0 together with
  this version.** No edge needs rebinding: the new event is in the parser's namespace, which the
  state's `events` edge already binds. A script on `inventorybot-state.gained` is unchanged.

## 0.6.0 (2026-11-13)

- **One event type per kind of reply, instead of `inventorybot.reply`** (breaking). Each private
  reply of a kind the parser knows is published as `inventorybot.<kind>`, the grammar's event type
  in camel case (`inventorybot.inventory`, `.title`, `.itemInfo`, `.recipeDetail`, `.recipeList`,
  `.craft`, `.show`, `.use`, `.gift`, `.give`, `.travel`, `.location`, `.travelBlocked`,
  `.travelRequirement`, `.itemCooldown`, `.miss`, `.pakkomonRecord`, `.pakkomonReady`,
  `.pakkomonChallenge`, `.pakkomonStunned`, `.pakkomonFight`), with its own schema, so that the
  graph editor and a script's types know its fields: `{ chat, query, self?, playback?, ...fields }`,
  the grammar's fields flat beside the context instead of nested in `reply`. Besides the replies the
  state reads, it now publishes a refused `/viaggio` (`travelBlocked`, `travelRequirement`), an
  item's cooldown (`itemCooldown`) and every fixed reply of the bot (`miss`: help, refusals,
  not-found), not only a `/dai` refused with the count owned. Only the private chat's replies, all
  the owner's; the drops and the adventure's cooldown stay `inventorybot.turn`'s alone. The module's
  new README lists every event, and the bot's replies that refuse a command, with whether the
  grammar recognises each (for MegaBotTron1999's coming command answers, its issue #59).
- **The `inventorybot-state` node** applies the new events instead of `inventorybot.reply`. Its
  `events` input is bound to the parser's namespace, so **no edge needs rebinding**; a node that
  starts fresh after the update reads only the turns of the older log, not its `inventorybot.reply`
  events.
- **What a script must change:** a handler of `inventorybot.reply` listens to the kind's event
  instead and reads its fields at the top (`e.items`, not `e.reply.items`). A script on
  `inventorybot-state.gained` or `.changed` is unchanged.

## 0.5.0 (2026-11-13)

- **A new event, `inventorybot-state.gained`** (`{ item, sure, qty, exact }`): the state plugin
  tells each item the owner gains, one event per item, through MegaBotTron1999 0.1.7's
  `StateSpec.events` and `announce` (its D83), so that a script reacts to an item gained without
  comparing states. `qty` and `exact` are the item's holding after the gain; for a guessed drop
  `sure` is false and `item` the guess. A gain: an adventure drop, sure or guessed, a lucky drop, a
  gift, another player's give not already counted by its notice, a craft's output, each item a
  `/usa` adds. Not a gain: a listing, `/esamina`, `/mostra`, `/ricetta`, a `/dai` refused with the
  count owned, the lottery, a Pakkomon fight; a guess resolved later is not told again. Told live
  only: never for what the node catches up on at start, nor for a played-back message's event.
  `inventorybot-state.changed` is unchanged.

## 0.4.2 (2026-11-13)

- It imports the player state `^0.1.1`, in which a whole inventory (now the `/esporta` file too)
  settles the drops still pending, so that a guess resolved after it is not counted twice
  (InventoryBotTron's issue #1). Update `inventorybot-player-state` with it. No change to the
  plugins.

## 0.4.1 (2026-11-13)

- **The `/esporta` file is read live.** MegaBotTron1999 0.1.7's Telegram connectors download a
  message's text file (`Inbound.document`, its D82), so the parser reads the export beside its
  caption: published as `inventorybot.reply`, an `inventory` event with `exported: true`, every item
  the owner holds, which the player state takes as a whole listing; and its items learned, as an
  inventory's. A file that came without its text (too large, not text, not UTF-8, a failed download)
  leaves the caption alone, which tells nothing, as before, and is logged with why. No change to the
  events' shapes.

## 0.4.0 (2026-11-13)

- **`inventorybot.reply` marks history**: a reply read from a message played back (missed while the
  instance was down and delivered past the connector's grace, MegaBotTron1999's D83) carries
  `playback: true`, a new optional field, as the turn parser already marks `inventorybot.turn`. A
  state applies it, since it is the truth however late, and tells nothing of it in its own events; a
  script should check it before acting. A live reply has no `playback`. Built against
  MegaBotTron1999 0.1.7.

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
  state. The `/esporta` file is not among them: the account gives its caption only (read since
  0.4.1).
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
