# InventoryBotTron

The game logic of the Telegram game [@InventoryBot](https://t.me/InventoryBot), as plain TypeScript
packages that depend on nothing, and the
[MegaBotTron1999](https://github.com/djjeck/MegaBotTron1999) modules built on them. The
[InventoryBot wiki](https://github.com/djjeck/inventorybot-wiki) reads a player's exports with the
same packages.

| Path                                           | What it is                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/bot-protocol.md`](docs/bot-protocol.md) | InventoryBot's protocol: the game's concepts, its commands and the grammar of every reply. The grammar's specification.                                                     |
| `packages/grammar`                             | InventoryBot's reply grammar: classify a reply, resolve a drop's item, strip titles. The module `inventorybot-grammar`, which provides `@inventorybottron/grammar`.         |
| `packages/state`                               | InventoryBot's player state: the owner's inventory and history, kept one reply at a time. The module `inventorybot-player-state`, which provides `@inventorybottron/state`. |
| `modules/inventorybot`                         | The module `inventorybot`: the `inventorybot` parser plugin, which reads the owner's adventures live and learns the game as it reads.                                       |

The repository ships no game content: no item, recipe or place of the game, no flavour text and no
real username. What a bot knows of the game it learns by playing, into its own store
([CLAUDE.md](CLAUDE.md), "Game content").

## Installing in MegaBotTron1999

On the Modules page, paste `https://github.com/djjeck/InventoryBotTron`: it lists
`inventorybot-grammar` (at `packages/grammar`), `inventorybot-player-state` (at `packages/state`,
which imports the grammar) and `inventorybot` (at `modules/inventorybot`, which imports both).
Install the three, and restart. A module that imports `@inventorybot-wiki/grammar` must move to
`@inventorybottron/grammar` first ([its changelog](packages/grammar/CHANGELOG.md)).

The `inventorybot` node reads the owner's own Telegram account (`telegram-user`): its edge reads the
private chat with the bot, and the game's group if the owner plays there.

## The player state

The module's second plugin, `inventorybot-state`, keeps the owner's state at the game from what the
`inventorybot` node reads: the inventory (each item's count, whether it is exact, its rarity and
tags), the items seen and used, the recipes made, the places, the Pakkomon, and the latest drops. In
the graph editor, add an `inventorybot-state` node and bind its one input, `events` (required), to
the `inventorybot` node's events output: an `events` edge from `inventorybot.events` to
`inventorybot-state.events`. In the graph file:

```json
{
  "nodes": [
    {
      "id": "inventorybot-state",
      "plugin": "inventorybot-state",
      "config": { "pin": ["inventory.held", "drops.latest"] }
    }
  ],
  "edges": [{ "from": "inventorybot.events", "to": "inventorybot-state.events", "type": "events" }]
}
```

Its config is `pin` alone, the paths of the state its panel draws first, the first two making the
line on its card; without one it pins `inventory.held` (how many items the owner holds) and
`drops.latest` (the latest drops). A fresh node reads the whole event log, so it starts from every
drop and reply the parser has published. The inventory is exact after a whole `/inventario` (or
`/collezioni`) in the private chat, or an `/esporta`, whose file the parser reads live, and each
section's freshness says how far it is from its last whole listing: a drop or a use is a change
known exactly, a drop whose item the parser guessed an uncertain one, counted under its guess until
a later reply teaches the item. Other nodes read it through its interface: `state.get({ path })`,
`state.freshness({ section })`, `state.count({ name })` and `state.held()`.

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
file's content as its input), or from the host, through the control API on the container's loopback,
with the image's own Node.js, `<container>` being the name of the instance's container:

```sh
docker exec -i <container> node -e '
  fetch("http://127.0.0.1:8081/plugins/inventorybot/actions/seed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: require("fs").readFileSync(0, "utf8"),
  }).then(async (r) => {
    console.log(r.status, await r.text());
    if (!r.ok) process.exitCode = 1;
  });
' < ~/seed.json
```

The seed goes through the command's standard input, so nothing is copied into the container. It
prints the answer's status and body whatever they are: on a refusal, the API's own message says why
(a `400` with what the input lacked, a `404` without a running `inventorybot` node), where
`wget -qO-` would print only `server returned error`.

## Developing

Node.js 24 (`.nvmrc`). `git submodule update --init` (MegaBotTron1999, in `vendor/`), `npm install`,
then `npm run validate` after every change: formatting, lint, the game-content check
(`check:universe`), the modules' version locks (`check:locks`; `npm run stamp` after a version
bump), types and the tests with coverage. See [CLAUDE.md](CLAUDE.md).

## Licence

MIT, see [LICENSE](LICENSE).
