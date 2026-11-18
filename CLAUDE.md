# InventoryBotTron

The game logic of the Telegram game [@InventoryBot](https://t.me/InventoryBot), as packages with no
dependency on [MegaBotTron1999](https://github.com/djjeck/MegaBotTron1999), and, later, the
MegaBotTron1999 plugins that read the game live. The
[InventoryBot wiki](https://github.com/djjeck/inventorybot-wiki) consumes the packages; a
MegaBotTron1999 instance installs them as modules. See [README.md](README.md) for the overview.

**This repository is public.** Everything committed here, history included, is readable by anyone.

## Layout

- `docs/bot-protocol.md`: InventoryBot's protocol (below, "The protocol").
- `packages/grammar/`: InventoryBot's reply grammar, the module `inventorybot-grammar`, which
  provides `@inventorybottron/grammar` (below). It came from the wiki's `packages/grammar` at its
  commit `1ca8615`, as a copy (its history stays in the wiki's repository).
- `packages/state/`: InventoryBot's player state, the module `inventorybot-player-state`, which
  provides `@inventorybottron/state` (below, "The state package"). It came from the wiki's
  `src/inventorybot/player.ts` and `player-pakkomon.ts`, made a reducer of one event at a time.
- `modules/inventorybot/`: the MegaBotTron1999 module `inventorybot`, with the `inventorybot` parser
  plugin (below, "The inventorybot module").
- `vendor/MegaBotTron1999`: MegaBotTron1999, a git submodule pinned to a tag, or to a commit past it
  when the modules need a change not tagged yet (now `42efad5`, past `v0.1.43`: its D142, the outbox
  keeping no game's cooldown, the state alone deciding a command's readiness), whose `packages/*`
  are workspaces, so that the modules are written, type-checked and tested against the shell they
  run in (its `docs/bot-os-api.md` §7.5). Never edit it here: a change to the shell is made in its
  repository, and the pin is moved here (with `npm install` for the lockfile) in a commit of its
  own.

A package imports nothing outside its own folder but other packages of this repository
(`@inventorybottron/*`): no npm package, no Node API, nothing of MegaBotTron1999, so that the wiki,
which runs in a browser, can use it as it is. A module imports only `node:*`, `@megabottron1999/*`,
`zod`, its own files and the modules it declares (the grammar, the state, by their entries), and no
MegaBotTron1999 actor: nothing here plays. ESLint enforces both, and `scripts/modules.test.ts` the
module format.

## Development process

- Implementation is handled by the AI agent, which commits and pushes once the checks pass; the
  author follows the work and validates it live, rather than approving each commit.
- Each completed sub-task is a self-contained, reviewable change, with tests and documentation
  updated in the same commit.
- **Commit on `main`.** No feature branches unless the author asks for one. One logical change per
  commit; the message says why, not only what.

### Validate after every edit

```bash
source ~/.nvm/nvm.sh && nvm use && npm run validate
```

`validate` applies formatting and lint autofixes, then runs the game-content check, the version
locks' check, the type check and the tests with coverage. It is for local use; CI
(`.github/workflows/ci.yml`) runs `npm run ci`, the same checks without fixing anything. Address
every error before marking a sub-task complete.

## Game content

InventoryBot is meant to be discovered by playing, so this repository holds no game content:

- **Never here:** real item names, real locations, real recipes (their ingredients, their outputs,
  which item unlocks which place, where an item drops), and real flavour text (the random sentences
  of the drops, the craft texts, the unlock texts). Code, docs and tests use an invented universe
  instead ([scripts/universe.md](scripts/universe.md)), in the bot's real formats.
- **Allowed:** the message formats, the grammars and templates that read them, the bot's fixed reply
  texts (the same for every player, whatever they find: errors, the `/faq`, the lottery's
  announcements, the Pakkomon fights' ending phrases), and the command names. These are not game
  content. A real name that a fixed reply text holds (the game's currency in the level-up text) is
  allowed as part of that text, and listed in the universe as `public`.
- **Usernames are always invented.** A real one identifies a person, which is worse than a real
  item. The only real names are those the bot's own fixed texts hold (the bot, the game's admin), as
  `public` entries of the universe.
- **Knowledge comes only from play:** a running bot learns the game live, from the replies it reads,
  or by seeding its own store from the owner's own Telegram export at install time. What it learns
  stays in the bot's own store, never here.
- **The grammar ships no knowledge at all:** no item names, no sentence prefixes, no titles, and no
  cue words (words that would tell an item's name from the sentence before it). Everything it
  resolves against is the caller's (`Knowledge`). A rule of the language is not knowledge:
  `guessDropItem`'s indefinite article stays.
- **Neither does a module:** the `inventorybot` parser starts knowing nothing and resolves drops
  only against its own store; the articles its unknown drops are cut at are the language's.

This is enforced, not left to judgement: `npm run check:universe` (`scripts/check-universe.ts` and
`scripts/universe.ts`, run by `validate`, `ci` and GitHub CI) fails on any entity, found where the
bot's reply formats put one or in the item tuples of the tests' reply builders, and on any
`@username`, that is not in the universe. It has no exception here. A new test case that needs a new
name invents one and adds it to the universe in the same change; the author reviews additions. The
check cannot see flavour text: a drop's, a craft's or an unlock's sentence in a test is invented by
hand, never copied or paraphrased from a real reply.

## The grammar package

`packages/grammar/`, the npm workspace package `@inventorybottron/grammar`: the classifier and its
event types (`classify.ts`, `types.ts`), the Pakkomon replies (`pakkomon.ts`), the reply patterns
and places (`patterns.ts`, `places.ts`), shaped items (`shapes.ts`), titles (`titles.ts`), drops
(`drops.ts`) and the text helpers (`lib/text.ts`). Its `package.json` maps `<name>/<path>` to
`src/<path>` and the name alone to `src/index.ts`, so the wiki may import any of its files; for
everyone else the contract is the entry, `src/index.ts`:

- `classify(text, query, file?)`, and the types of its events (`Event`, `EventType` and each
  event's);
- `normalizeReply(text, known)`: the reply as `classify` reads it, the player titles of
  `known.titles` and the admin's "Sua Maestà" removed;
- `resolveDrop(raw, known)`: the item of an adventure drop, from its `raw` narrative, as
  `{item, sure, prefix}` or null: a known item of `known.items` that ends it (`sure`), else what
  follows the longest sentence prefix of `known.prefixes` that starts it;
- `guessDropItem(raw)`: a guess at the item of a drop `resolveDrop` cannot resolve (what follows the
  last indefinite article, else all of `raw`), from which nothing should be learned;
- `Knowledge` (`items`, `prefixes`, optional `titles`), `DropKnowledge` and `DropResolution`;
- since 0.4.0, what a reader of the game's state needs besides: the inventory commands
  (`INVENTORY_COMMANDS`, `INVENTORY_LIST_COMMANDS`), shaped items (`unshaped`, `shapeOf`,
  `shapeGiven`), Pakkomon as items (`PAKKOMON`, `pakkomonItem`) and the text helpers
  (`codePointLength`, `compareCodePoints`, `sliceCodePoints`, `splitWords`, `stripEndChars`,
  `stripWs`, `WS_CLASS`).

It is also a library module of MegaBotTron1999 (its `docs/bot-os-api.md` §7): `module.json` makes it
the module `inventorybot-grammar`, with no plugins, which provides `@inventorybottron/grammar`.
MegaBotTron1999 installs it from this repository's folder or its GitHub link, finding it at
`packages/grammar` (and nothing under `vendor/`), and installs all its files but its tests
(`*.test.ts`, `test/`). `src/index.test.ts` fails if the entry loads anything but the package's own
sources. Its tests sit beside its files; the reply builders they share are in its `test/`
(`#test/texts.ts`). The wiki also tests the classifier through its whole pipeline.

Comments in the grammar name the reply formats by their sections in
[docs/bot-protocol.md](docs/bot-protocol.md), the grammar's specification, and the wiki's pipeline
by its phases: the wiki reads every export with this grammar.

### Who uses it

- **The InventoryBot wiki** vendors this repository as a git submodule (`vendor/InventoryBotTron`),
  pinned to a commit of `main`, and makes `packages/grammar` one of its workspaces. A change here
  reaches the wiki when its pin moves, in a pull request there.
- **A module that still imports the former name**, `@inventorybot-wiki/grammar` (0.2.0, the wiki's
  install of `inventorybot-grammar`), keeps that install until it moves to
  `@inventorybottron/grammar` ([its changelog](packages/grammar/CHANGELOG.md)).

## The state package

`packages/state/`, the npm workspace package `@inventorybottron/state` and the library module
`inventorybot-player-state` (`module.json`, imports `@inventorybottron/grammar` `^0.4.0`, by its
entry only): the owner's state at InventoryBot, kept one reply at a time, for the wiki, which folds
a whole export with it, and for the `inventorybot` module's state plugin, which keeps it live. Its
entry, `src/index.ts`, is its contract:

- `initialState(player?)`, `apply(state, event, know?)` (in place) and `reduce(state, event, know?)`
  (pure, a copy): the reducer (`reduce.ts`, `holdings.ts`, `pakkomon.ts`, `resolved.ts`, `seen.ts`).
  Its events (`StateEvent`, `types.ts`) are the grammar's, with the reply's context (`date`, ISO
  with its offset; `player`, `dm`, `forwarded`, `broadcast`; `query`, the command it answers) and
  what their reader resolved: a drop's item (`resolved`, with `sure: false` for a guess, and its
  place, `location`), a craft's `recipe`, a use's `used_item`, and a give to the owner `notified` by
  its private notice; and, besides the grammar's, the reader's correction of one of the owner's
  guessed drops (`resolved`, `ResolvedEvent`: `guess`, `item`, `dropped`, `rarity`, `usable`; since
  0.2.0). What depends on the game beyond one reply is the reader's `Know` (an item's rarity, a
  recipe's ingredients, whether a use consumes the item, every item known); the state stands in with
  its own when the reader gives none.
- `State`, its sections: `owner` (`player`, `as_of`), `inventory` (`held`, the items above zero, and
  `items`, each estimated item's `qty`, `exact`, `date`, `via`, `rarity` and `tags`), `items` (first
  seen, used), `recipes` (made), `recipe_list`, `inventory_check` (the `/ricetta` lists against the
  estimate), `locations` (visited, adventures), `pakkomon`, `shapes`, and `drops`: the latest drops,
  a guess among them `sure: false`.
- **The state records; its reader resolves** (since 0.2.0). A drop whose item is a guess is counted
  under its guess. The state learns no item names of its own to correct its past with: its reader,
  which reads every message (the `inventorybot` parser), resolves the guess once it learns the item
  and tells it in a `resolved` event, and the state moves the count from the guess to the item
  (`resolved.ts`), only while the guess is still counted (a listing since, a whole inventory above
  all, has counted the drop already: issue #1). A reader tells a resolution before the reply that
  taught it, so that a listing naming the item counts it after the move. Until 0.2.0 the state kept
  the guesses pending (`drops.pending`, `MAX_PENDING`, `taughtItems`) and resolved them itself.
- `playerView(state, places?)`: the state as the wiki shows it (`PlayerView`), a shaped item and
  every Pakkomon merged, holdings above zero, sorted.
- The rules the wiki's phase 5 shares with it: `isMine`, `queryArg`, `inventoryScope`,
  `isWholeInventory` (since 0.2.0), `RARITY_FILTER`, `isFailedUse` (`USE_FAILED`), `nameKey`,
  `pakkomonOf`, `renamed`, `sameTransfer` (`TRANSFER_WINDOW`), and the dates (`instant`,
  `isoPlusSeconds`, `isoOf`).

Every record is read and written by its own properties (`records.ts`), so that an item may be named
anything, `__proto__` included. The wiki vendors it as it does the grammar (its workspace
`vendor/InventoryBotTron/packages/state`), and its `player.ts` is the fold and the view: the goldens
of its player state are this package's.

## The inventorybot module

`modules/inventorybot/`, the workspace package `@inventorybottron/inventorybot` and the module
`inventorybot` (`module.json`, imports `@inventorybottron/grammar` `^0.4.0` and
`@inventorybottron/state` `^0.2.0`), whose plugin entry `src/plugins/inventorybot.ts` offers the
`inventorybot` parser: InventoryBot's answers to the owner's turns, on MegaBotTron1999's turn parser
(its `docs/bot-os-api.md` §5), published as `inventorybot.turn` (`{ chat, outcome }`, the outcome's
shape in `src/turn.ts`), with the turn parser's contract, `actions.sent` alone since
MegaBotTron1999's D141 (past its 0.1.41: a parser only reads; the readiness a shell `player` binds
to is a state's, and its turn-actor is gone, with the `state.rest` and `state.lastTurn` it read). It
came from RegnoTron's `game-bots` module with the same plugin id, event and store, so a graph's node
keeps running on its instance ([its changelog](modules/inventorybot/CHANGELOG.md)). A gain's outcome
carries its drop's narrative (`raw`, optional, since 0.2.0), the rest of the outcome's shape
unchanged for the nodes that read the turns of several games. Besides the turns, since 0.6.0, it
publishes each reply of the bot's in the private chat of a kind it knows (`src/replies.ts`: a
listing, an item's card, a recipe and the recipe list, a craft, a `/mostra`, a use, a gift or a
give, a place, a refused `/viaggio`, an item's cooldown, a Pakkomon, and the bot's fixed replies,
`miss`) as its own event type, `inventorybot.<kind>` (the grammar's type in camel case:
`inventorybot.itemInfo`), each declared with its own schema so that the editor and a script's types
know its fields: `{ chat, query, self?, playback?, ...the grammar's fields }`, `query` the owner's
last command there (if within the turn parser's answer window), which it answers; `REPLY_KINDS`
lists them, and a type check holds each schema to the grammar's event. One read from a message
played back (missed while the instance was down, past the connector's grace: MegaBotTron1999's D83)
carries `playback: true`, as the turns do, so that a state applies it and announces nothing of it.
Only the private chat's replies are published, so every one is the owner's; the group's replies stay
the turns'. The drops and the adventure's cooldown are the turns' alone, never also a reply's event.
Until 0.6.0 the replies the state read were one event, `inventorybot.reply`, with the grammar's
event inside. The `/esporta` reply is read from the text file its message carries (MegaBotTron1999's
`Inbound.document`, D82, the turn parser's `BotMessage.document`), since 0.4.1: a whole listing for
the state, and its items learned as an inventory's; a file that came without its text (`skipped`)
leaves the caption alone, which tells nothing, and is logged with why. The module's
[README](modules/inventorybot/README.md) is its event surface: every event and its fields, and the
catalogue of the bot's replies that refuse a command (their reason, and whether the grammar
recognises each), and the command answers built on it.

- **Its events answer the owner's commands** (since 0.9.0, `src/answers.ts`; MegaBotTron1999's
  command answers, its #59 and D98, which need its 0.1.21): the manifest's `answers`, the turn
  parser's own first (`inventorybot.turn` answers `/avventura`), then which reply event answers
  which commands, `ok` or `refused` with a reason (MegaBotTron1999's `cooldown`, `missing`,
  `invalid`, or the game's own: `not_found`, `ambiguous`, `untrusted`, `closed`, `restricted`,
  `error`), the bot's fixed replies (`inventorybot.miss`) one by one by their `reply`
  (`MISS_ANSWERS`). The core pairs an event with a waiting send only while it hands the parser the
  message, so every event is published in the message's handler, never after an `await`. The first
  declaration that matches an event is its answer, whatever command waits, so each event (and its
  `when`) is declared once with every command it answers; where a status depends on the reply, the
  parser adds the field it reads (`src/replies.ts`, `answerFields`: `retryAt` of an item's cooldown
  and a stunned Pakkomon, `failed` of a use, `examined` of a recipe's detail), which the state
  leaves out (`CONTEXT_FIELDS`). A cooldown of an item or a Pakkomon gives no `retryAtFrom`: the
  core would hold the whole command back. A command sent by a node is never seen by the parser (the
  account does not hear its own sends), so a reply the grammar reads only with its command (most
  `/usa` replies) goes unanswered then.

- **The parser resolves the owner's guesses** (since 0.7.0, `src/knowledge.ts`, `src/resolved.ts`):
  it keeps the owner's drops whose item it guessed (at most 50, in its `knowledge` document), and
  whenever any message it reads (any player's, in any chat it reads, played back or live) or a seed
  teaches it an item or a sentence that resolves one, publishes `inventorybot.resolved`
  (`{ chat, guess, item, raw, rarity, tags, date, playback? }`, `date` the drop's time in ms, `chat`
  its chat), before the reply that taught it. A whole inventory of the owner's (the `/esporta` file,
  or a complete unfiltered listing: the state's `isWholeInventory`) forgets the guesses before it
  unresolved, since it counted them (issue #1).
- **The `inventorybot-state` plugin** (`src/plugins/inventorybot-state.ts`, its own plugin entry,
  since 0.3.0): the owner's player state, MegaBotTron1999's `statePlugin` (its docs/bot-os-api.md
  §5, bot-os.md D72) over the state package's `reduce`. `src/state.ts` reads the parser's events as
  the state's: a turn's gain as a drop (a guess, `sure: false`, counted under its guess), the
  parser's `inventorybot.resolved` as the state's `resolved` (since 0.7.0), a reply as the owner's
  event, a `/usa`'s item and a craft's recipe found by the words of the command's argument among the
  items held or seen and the recipes listed or made (its `events` input stays bound to the parser's
  namespace, so the per-kind events reach it on the same edge); its zod schema (`stateSchema`, the
  package's `State`); and the freshness: a whole listing a `snapshot` of `inventory`, a guess
  `uncertain`, any other change a `delta`. Its interface adds `count` and `held`; its config's `pin`
  defaults to `inventory.held` and `drops.latest`. Its store's first migration (0.7.0) takes
  `drops.pending` out of a state kept before; its second (0.10.0) adds the section `readiness`. It
  announces each change as `inventorybot-state.changed` (the sections changed, `statePlugin`'s),
  and, since 0.5.0, what happened in its own event, `inventorybot-state.gained` (below).
- **The owner's readiness** (since 0.10.0, MegaBotTron1999's D141): `inventorybot-state` declares
  `readiness` in its spec (`INVENTORYBOT_READINESS`, `src/state.ts`: the parser's id and its
  vocabulary, `INVENTORYBOT_VOCABULARY` of `src/turn.ts`, the turn `/avventura` alone, with no
  mechanics), so the shell keeps the section `readiness` from the parser's `sent`, `turn` and
  `reply`, and the state offers the contract a shell `player` binds its `state` input to:
  `state.ready`, `state.commands`, `state.bot` and `actions.sent`, which it hands to the parser
  through its second required input, `parser` (bound to the `inventorybot` node's interface). The
  turn's hold is the bot's rest, as the parser's turns state it (`retryAt`); the state knows no
  other fact that holds a command, so it folds nothing in. Add mechanics only for what the game has.
- **State plugins offer rich domain events.** A state tells what an event did in the game's own
  terms (an item gained), not only which sections changed, so that the owner writes a small script
  on the fly ("when I find X, …") on its events instead of comparing states. Each is declared in the
  spec (`events`, `<id>.<name>` in the manifest) and made by a pure function of the state before and
  after and the event (`announce`), told live only: never for an event refused, read at start from
  the log, or played back (MegaBotTron1999's D83). A new event of the kind is a minor version.
- **State events announce new facts, never corrections of past facts.** A correction (a guess
  resolved) flows from the parser to the state only: the state applies it (and `changed` tells the
  sections it changed, as for any event), but tells it in no event of its own, neither a `gained`
  nor a `resolved`. A script that needs corrections listens to the parser's `inventorybot.resolved`.
- **Its line in the owner's summary** (since 0.8.0, MegaBotTron1999's D92, `summaryLines`): beside
  the state plugin's `N events applied`, `N items gained, M new` for the summary's window, `N` its
  `gained` events published, `M` those with `qty` 1 (held for the first time), `, M new` left out at
  0; none when it told no gain, so that a quiet window sends no summary. The plugin wraps the state
  plugin's `create`, counting its `gained` events as its bus publishes them (a `Tally`, in memory
  only) and joining its line to the state plugin's in one contribution, so that the node has one
  section.
- **`inventorybot-state.gained`** (`src/gains.ts`, `gains(before, after, event)`):
  `{ item: string, sure: boolean, qty: number, exact: boolean }`, one per item the owner gained by
  an event, `qty` and `exact` the item's holding after it (`after.inventory.items[item]`; 0 and
  false if the state holds none), `item` the guess when `sure` is false. **A gain:** an adventure
  drop, sure or guessed, and a lucky drop; a gift; another player's give to the owner, only when its
  private notice did not already count it (`notified`; the parser reads the private chat only, so it
  comes as the notice, a gift); a craft's output; each item a `/usa` adds (a positive count among
  its items). **Not a gain:** a listing, an `/esamina`, a `/mostra`, a `/ricetta`, a `/dai` refused
  with the count owned (observations, even when they raise an estimate), the lottery, a Pakkomon
  fight, nor a guess the parser resolves later (`inventorybot.resolved`): it moves the count to its
  item, and is told no second time.
- `src/read.ts` reads a message with the grammar: whose reply it is, a gain or a cooldown, and what
  it teaches; `src/knowledge.ts` is what the instance knows, kept in its store's `knowledge`
  document (at most 5000 items, 1000 prefixes, the latest 200 unknown drops and 50 of the owner's
  guesses); `src/drop-cut.ts` guesses where an unknown drop's item begins from an earlier one of its
  sentence.
- **It knows only what it reads** ("Game content", below): the items an inventory, a recipe, a craft
  (its ingredients and output), a `/mostra`, a `/usa`, a gift or a give, or the lucky adventure
  lists; a drop's sentence once it ends with a known item, and a drop's item once its sentence is
  known, both `sure`. Any other drop is a guess, `sure: false`, from which nothing is learned: cut
  at an article where it parts from an earlier unknown drop, else after its last indefinite article
  (the grammar's `guessDropItem`).
- **Seeding:** its action `seed` merges `{ items, prefixes }` into what it knows. The owner makes
  one from their own exports with `scripts/seed-knowledge.ts` (the root's, not the module's: it
  reads files), which reads every message of the bot in a Telegram Desktop HTML export
  (`scripts/export-pages.ts`, the format of the wiki's `docs/telegram-export.md`) in order through
  the module's `learnFrom`, as the node would have read them live, and prints the seed on stdout. It
  writes nothing; the exports and the seed never enter this repository, and its tests use invented
  pages (README, "Seeding the parser").
- Its tests run it in MegaBotTron1999's dev kit (`test/run.ts`), on the invented universe.

## The protocol

[docs/bot-protocol.md](docs/bot-protocol.md) explains InventoryBot to someone who has never played
it: its concepts, its commands, and the grammar and meaning of every reply, with the older formats
of group history. It is the grammar's specification, and this repository is its home: a change in
the bot's replies, or in what is known of them, is made here, in the same commit as the grammar's
change. It came from the wiki's `docs/bot-protocol.md` at the wiki's commit `c3f6a1a` (its history
stays in the wiki's repository).

- **Its examples are tests.** Each reply example is a `bot-reply` block whose attributes say what
  the reply means (the doc's section 8). The wiki reads the doc from its submodule and checks every
  block against this grammar through its whole pipeline
  ([`classify.docs-examples.test.ts`](https://github.com/djjeck/InventoryBot-wiki/blob/main/src/inventorybot/classify.docs-examples.test.ts)),
  and its golden outputs replay the blocks as a synthetic chat: a changed or new block changes the
  wiki's golden files when its pin moves, and that pull request explains them.
- **It holds no game content,** like everything here: `check:universe` scans it as it scans every
  tracked Markdown file, and its examples use the invented universe.
- The wiki's own input docs stay there, linked from the doc:
  [`telegram-export.md`](https://github.com/djjeck/InventoryBot-wiki/blob/main/docs/telegram-export.md),
  the export format, and
  [`channels.md`](https://github.com/djjeck/InventoryBot-wiki/blob/main/docs/channels.md), the
  encyclopedia channels' cards.

## Versions

Every module of this repository (each directory with a `module.json` that MegaBotTron1999 would
find: not under `vendor/`, `node_modules` or a test directory) has a version lock,
`module.lock.json` beside its `module.json`, which records the version and a hash of the files it
ships (`scripts/locks.ts`: each path, sorted, with the SHA-256 of its contents; the files
MegaBotTron1999 installs, which are all but the tests; the lock left out of its own hash; only the
files git tracks or would track counted).

- **Any change to a file a module ships gives it a new version**, in its `module.json` and its
  `package.json` alike, since MegaBotTron1999 offers an update for any new commit and the version is
  all the owner sees of it. Against the entry's contract: a patch for a change that keeps every
  export's meaning (a fix, a reply form newly read, internal files), a minor version for an addition
  (a new export, event type or field), a major version for anything that breaks a caller (an export
  removed or renamed, a meaning or a type changed, the `provides` name changed). Below 1.0.0 a
  breaking change raises the minor version, since `^0.x` ranges do not cross it. Each module records
  its versions and why in its `CHANGELOG.md`.
- `npm run check:locks`, run by `validate`, `ci` and GitHub CI, fails when a module's hash changed
  and its version did not, when its `module.json` and `package.json` versions differ, or when its
  lock was not stamped after a bump. After bumping, `npm run stamp` (or `npm run stamp -- <dir>`)
  writes the locks, and refuses a module whose version is still the one its lock records. A change
  to tests only changes nothing. A new module gets its lock from its first `npm run stamp`.

## Rules

- **Docs change in the same commit as the behaviour.** A change to a package's API updates this
  file, its `CHANGELOG.md` and the README in that commit.
- **No private data, ever.** No real player's name or handle, no Telegram or other network id, no
  message quoted from a real chat, no hostname, IP address or domain of anyone's network, and no
  secret of any kind (in code, tests, fixtures, docs, comments or commit messages). Before every
  commit, scan the change for tokens, keys, long numbers that could be ids, and names, and run
  gitleaks: `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.28.0 git /repo --no-banner -v`.
- **Test data is synthetic,** in the invented universe; tests never read real exports.
- **Read-only.** Nothing here sends a message to the bot or automates play.
- **Coverage stays at or above 90%** on statements, branches, functions and lines, for the whole and
  for each package's and each module's `src/` on its own (`vitest.config.ts` sets a threshold for
  each).
- **Dependencies:** the root has dev dependencies only, as few as possible, each justified in the
  commit that adds it, pinned to exact versions at least two weeks old, with `package-lock.json`
  committed; the same for the GitHub Actions the workflow uses. A package or a module has none: a
  module's `@megabottron1999/*` and `zod` are the workspaces' in development and the host's in an
  instance.

## Conventions

- **Language:** English, except the bot's texts, quoted in Italian as it writes them.
- **Node.js 24**, pinned in `.nvmrc`; `engines` in `package.json` matches it.
- **No build step.** Node runs the `.ts` sources directly by stripping types, and `tsc` only
  type-checks (`noEmit`). So imports use `.ts` extensions, and only erasable TypeScript syntax is
  allowed (no enums, namespaces or constructor parameter properties).
- **Strict TypeScript,** including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- **Imports:** ESLint owns their style (sorted in one group, inline `type` specifiers, unused ones
  removed; `npm run lint:fix`). Within a package, same-directory imports are relative (`./foo.ts`),
  others go through its `#src/*` and `#test/*` aliases; another package is imported by its name;
  never with `../`. Production code never imports test helpers.
- **Formatting:** Prettier, for every file it supports, Markdown included, with prose wrapped at 100
  columns.
- **Tests** sit next to the code they test (`foo.ts`, `foo.test.ts`) and run with Vitest; a
  package's shared helpers live in its `test/`. MegaBotTron1999 installs neither.
