# InventoryBotTron

The game logic of the Telegram game [@InventoryBot](https://t.me/InventoryBot), as packages with no
dependency on [MegaBotTron1999](https://github.com/djjeck/MegaBotTron1999), and, later, the
MegaBotTron1999 plugins that read the game live. The
[InventoryBot wiki](https://github.com/djjeck/inventorybot-wiki) consumes the packages; a
MegaBotTron1999 instance installs them as modules. See [README.md](README.md) for the overview.

**This repository is public.** Everything committed here, history included, is readable by anyone.

## Layout

- `packages/grammar/`: InventoryBot's reply grammar, the module `inventorybot-grammar`, which
  provides `@inventorybottron/grammar` (below). It came from the wiki's `packages/grammar` at its
  commit `1ca8615`, as a copy (its history stays in the wiki's repository).
- `packages/state/`: the player state, next. Not there yet.
- `modules/inventorybot/`: the MegaBotTron1999 plugins, next. Not there yet. MegaBotTron1999 is
  vendored (`vendor/MegaBotTron1999`, a git submodule pinned to a tag, its `docs/bot-os-api.md`
  §7.5) only once something imports it; nothing does yet.

A package imports nothing outside its own folder but other packages of this repository
(`@inventorybottron/*`): no npm package, no Node API, nothing of MegaBotTron1999, so that the wiki,
which runs in a browser, can use it as it is. ESLint enforces it.

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
- `Knowledge` (`items`, `prefixes`, optional `titles`), `DropKnowledge` and `DropResolution`.

It is also a library module of MegaBotTron1999 (its `docs/bot-os-api.md` §7): `module.json` makes it
the module `inventorybot-grammar`, with no plugins, which provides `@inventorybottron/grammar`.
MegaBotTron1999 installs it from this repository's folder or its GitHub link, finding it at
`packages/grammar` (and nothing under `vendor/`), and installs all its files but its tests
(`*.test.ts`, `test/`). `src/index.test.ts` fails if the entry loads anything but the package's own
sources. Its tests sit beside its files; the reply builders they share are in its `test/`
(`#test/texts.ts`). The wiki also tests the classifier through its whole pipeline.

Comments in the grammar name the reply formats by their sections in the wiki's
`docs/bot-protocol.md`, the grammar's specification, and the wiki's pipeline by its phases: the wiki
reads every export with this grammar.

### Who uses it

- **The InventoryBot wiki** vendors this repository as a git submodule (`vendor/InventoryBotTron`),
  pinned to a commit of `main`, and makes `packages/grammar` one of its workspaces. A change here
  reaches the wiki when its pin moves, in a pull request there.
- **A module that still imports the former name**, `@inventorybot-wiki/grammar` (0.2.0, the wiki's
  install of `inventorybot-grammar`), keeps that install until it moves to
  `@inventorybottron/grammar` ([its changelog](packages/grammar/CHANGELOG.md)).

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
  for each package's `src/` on its own (`vitest.config.ts` sets a threshold per package).
- **Dependencies:** the root has dev dependencies only, as few as possible, each justified in the
  commit that adds it, pinned to exact versions at least two weeks old, with `package-lock.json`
  committed; the same for the GitHub Actions the workflow uses. A package has none.

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
