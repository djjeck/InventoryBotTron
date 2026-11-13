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

## Seeding the parser

The `inventorybot` node starts knowing nothing of the game, and is sure of a drop's item only once
it has seen the item listed (an `/inventario`, a recipe, a craft, a `/mostra`) or the drop's
sentence before a known item. To start from what the owner's own history teaches, seed it from their
Telegram Desktop exports: the private chat with the bot and the groups where it plays, in HTML
(Telegram Desktop → the chat's menu → _Export chat history_ → HTML; media can all be left out, but
_Files_ keeps `/esporta`'s inventory file, which the seed reads too). Keep the exports and the seed
outside this repository:

```sh
node scripts/seed-knowledge.ts ~/exports/ChatExport_2026-11-12 ~/exports/ChatExport_Group > ~/seed.json
```

It reads every message of the bot, in order, as the node reads them live, prints the seed
(`{"items": [...], "prefixes": [...]}`) on stdout and a summary on stderr, and writes nothing. Then
send it to the node's action `seed`, which adds it to what the node knows and answers how many items
and prefixes were new: on the web UI's Plugins page (the node `inventorybot`, its action `seed`, the
file's content as its input), or from the host, through the control API on the container's loopback:

```sh
docker cp ~/seed.json megabottron1999:/tmp/seed.json
docker exec megabottron1999 wget -qO- --header 'content-type: application/json' \
  --post-file /tmp/seed.json http://127.0.0.1:8081/plugins/inventorybot/actions/seed
docker exec megabottron1999 rm /tmp/seed.json
```

## Developing

Node.js 24 (`.nvmrc`). `git submodule update --init` (MegaBotTron1999, in `vendor/`), `npm install`,
then `npm run validate` after every change: formatting, lint, the game-content check
(`check:universe`), the modules' version locks (`check:locks`; `npm run stamp` after a version
bump), types and the tests with coverage. See [CLAUDE.md](CLAUDE.md).

## Licence

MIT, see [LICENSE](LICENSE).
