# InventoryBotTron

The game logic of the Telegram game [@InventoryBot](https://t.me/InventoryBot), as plain TypeScript
packages that depend on nothing, and the
[MegaBotTron1999](https://github.com/djjeck/MegaBotTron1999) modules built on them. The
[InventoryBot wiki](https://github.com/djjeck/inventorybot-wiki) reads a player's exports with the
same packages.

| Path                                           | What it is                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/bot-protocol.md`](docs/bot-protocol.md) | InventoryBot's protocol: the game's concepts, its commands and the grammar of every reply. The grammar's specification.                                             |
| `packages/grammar`                             | InventoryBot's reply grammar: classify a reply, resolve a drop's item, strip titles. The module `inventorybot-grammar`, which provides `@inventorybottron/grammar`. |
| `modules/inventorybot`                         | The module `inventorybot`: the `inventorybot` parser plugin, which reads the owner's adventures live and learns the game as it reads.                               |

The repository ships no game content: no item, recipe or place of the game, no flavour text and no
real username. What a bot knows of the game it learns by playing, into its own store
([CLAUDE.md](CLAUDE.md), "Game content").

## Installing in MegaBotTron1999

On the Modules page, paste `https://github.com/djjeck/InventoryBotTron`: it lists
`inventorybot-grammar` (at `packages/grammar`) and `inventorybot` (at `modules/inventorybot`, which
imports the grammar). Install both, and restart. A module that imports `@inventorybot-wiki/grammar`
must move to `@inventorybottron/grammar` first ([its changelog](packages/grammar/CHANGELOG.md)).

The `inventorybot` node reads the owner's own Telegram account (`telegram-user`): its edge reads the
private chat with the bot, and the game's group if the owner plays there.

## Developing

Node.js 24 (`.nvmrc`). `git submodule update --init` (MegaBotTron1999, in `vendor/`), `npm install`,
then `npm run validate` after every change: formatting, lint, the game-content check
(`check:universe`), the modules' version locks (`check:locks`; `npm run stamp` after a version
bump), types and the tests with coverage. See [CLAUDE.md](CLAUDE.md).

## Licence

MIT, see [LICENSE](LICENSE).
