# The `inventorybot` module

The MegaBotTron1999 module `inventorybot`: the `inventorybot` parser, which reads @InventoryBot's
replies live through the owner's Telegram account, and the `inventorybot-state` plugin, which keeps
the owner's player state from what the parser publishes. Installing it, binding its nodes and
seeding the parser are in the repository's [README](../../README.md); this file is its event
surface, for whoever binds a script or another node to it.

## The parser's events

Every event of the parser is in its namespace, `inventorybot`: bind a node's events input to the
`inventorybot` node's events output to hear them. Each is declared with its own schema, so the graph
editor and a script's types know its fields.

### The turns: `inventorybot.turn`

`{ chat, outcome, playback? }`: what the bot answered to one of the owner's adventures, in the
private chat or a group the edge reads. Its `outcome` is the shape every game bot's parser shares:

- `{ kind: 'gain', bot, item, rarity, tags, sure, raw? }`: a drop addressed to the owner, or the
  lucky adventure's prize; `sure` false when the item is a guess (its sentence and item both
  unknown), `raw` the drop's narrative;
- `{ kind: 'nothing', bot, reason: 'cooldown', retryMs }`: the adventure's cooldown, in private;
- `{ kind: 'unknown', bot, text }`: a message that answers a turn and that the parser cannot read.

The drops and the adventure's cooldown are the turns' alone: no other event of the parser repeats
them.

### The private replies: one event per kind

Every other reply of the bot in the private chat, where every reply is the owner's, is published as
its own event type, `inventorybot.<kind>`, `<kind>` the grammar's event type in camel case. Each
carries the reply's context, then the grammar's fields, flat:

- `chat`: the private chat;
- `query`: the owner's last command there, which the reply answers, or null when none is recent;
- `self`: the owner's username, once the account knows it;
- `playback: true`: read from a message played back (missed while the instance was down), history
  and not news.

| Event                            | The reply                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `inventorybot.inventory`         | a listing: `/inventario`, `/collezioni`, an `/inv2` page, the `/esporta` file |
| `inventorybot.title`             | the title-giving items held                                                   |
| `inventorybot.itemInfo`          | an `/esamina` card: an item, and how many are held                            |
| `inventorybot.recipeDetail`      | a recipe: the ingredients missing and those held                              |
| `inventorybot.recipeList`        | the recipe list                                                               |
| `inventorybot.craft`             | a recipe made: the ingredients spent, the item made                           |
| `inventorybot.show`              | a `/mostra`                                                                   |
| `inventorybot.use`               | a `/usa`: what the use did, the items it gave or took                         |
| `inventorybot.gift`              | another player gave the owner items                                           |
| `inventorybot.give`              | the owner gave another player items                                           |
| `inventorybot.travel`            | the owner travelled: the place reached, its exits                             |
| `inventorybot.location`          | where the owner is, and its exits                                             |
| `inventorybot.travelBlocked`     | a `/viaggio` refused                                                          |
| `inventorybot.travelRequirement` | the item a place on the way back requires                                     |
| `inventorybot.itemCooldown`      | a `/usa` or `/dai` refused: the item is cooling down                          |
| `inventorybot.miss`              | one of the bot's fixed replies (help, a refusal, a not-found), by its name    |
| `inventorybot.pakkomonRecord`    | a Pakkomon's record                                                           |
| `inventorybot.pakkomonReady`     | a Pakkomon waits for any challenger                                           |
| `inventorybot.pakkomonChallenge` | a Pakkomon challenges another player                                          |
| `inventorybot.pakkomonStunned`   | a fight refused: a Pakkomon is still stunned                                  |
| `inventorybot.pakkomonFight`     | a fight: the winner, the loser and what followed                              |

Only the owner's replies are published: a group's replies are another player's as often as the
owner's, and the owner's there are the turns. What the grammar reads of no reply to the owner (a
channel's card, a boss announced, a `/stats`, an older format) is not published either.

## The state's events

The `inventorybot-state` node applies the turns and the private replies, and publishes, in its own
namespace, `inventorybot-state`:

- `inventorybot-state.changed`, `{ sections, refreshed, event? }`: its state changed;
- `inventorybot-state.gained`, `{ item, sure, qty, exact }`: one per item the owner gained (a drop,
  sure or guessed, a lucky drop, a gift, a craft's output, what a `/usa` gave), live only;
- `inventorybot-state.refused`: an event its reducer could not apply.

## Refusals

MegaBotTron1999 will offer a command's answer as a primitive of its own (its issue #59: ok, refused
with a reason, or a cooldown until a time). Until then, these are the bot's replies that refuse a
command, by what they say, and how the parser reads each. "Recognised" means the grammar reads the
reply as the event named; none of them changes the owner's items, but a `/dai` refused with the
count owned, which the state takes as that item's exact count.

| Command                | Refused because                                                     | Read as                                                                       |
| ---------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/avventura`           | too soon after the last adventure (with the wait)                   | `inventorybot.turn`, `nothing`, `cooldown`, `retryMs`                         |
| `/avventura`, listings | the group does not allow them                                       | `miss`, `group_restricted`                                                    |
| `/dai`                 | no arguments                                                        | `miss`, `dai_syntax`                                                          |
| `/dai`                 | no such player                                                      | `miss`, `dai_unknown_user`                                                    |
| `/dai`                 | more than the owner holds (with the count held)                     | `miss`, `dai_not_enough`, `owned`                                             |
| `/dai`                 | a quantity that is not a positive whole number                      | `miss`, `dai_bad_quantity`                                                    |
| `/dai`                 | the receiver is not allowed (two wordings)                          | `miss`, `dai_untrusted`, `dai_doubtful`                                       |
| `/dai`, `/usa`         | the item is still cooling down (with the wait)                      | `itemCooldown`, `action`, `remaining`                                         |
| `/dai`, `/mostra`      | several items match the argument                                    | `miss`, `item_ambiguous`                                                      |
| `/dai`, `/mostra`      | no item held matches                                                | `miss`, `item_not_owned`                                                      |
| `/usa`                 | several items match, or none usable, or no argument                 | `miss`, `item_ambiguous`, `use_not_owned`, `use_what`                         |
| `/usa`                 | the item is not usable                                              | `miss`, `use_not_usable`                                                      |
| `/usa`                 | the argument after `#` is neither a player nor an item held         | `miss`, `use_target_unknown`, `use_target_not_owned`                          |
| `/usa`                 | the wrong key for a chest                                           | `miss`, `use_wrong_key`                                                       |
| `/usa`                 | a requirement the use lacks (items, their number or rarity, …)      | `use`, its `text` a failed use (the state's `isFailedUse`)                    |
| `/usa` on a Pakkomon   | the Pakkomon (or the opponent's) is stunned (with the wait)         | `pakkomonStunned`, `remaining`                                                |
| `/usa` on a Pakkomon   | the challenger no longer has its Pakkomon                           | `miss`, `pakkomon_gone`                                                       |
| `/usa` on a Pakkomon   | not a Pakkomon, no Pakkomon named, a power-up given twice           | not recognised (a power-up twice: `use`, a failed use)                        |
| `/usa` (a capsule)     | no such destination                                                 | not recognised                                                                |
| `/esamina`             | no argument                                                         | `miss`, `examine_what`                                                        |
| `/esamina`             | several items match                                                 | `miss`, `examine_ambiguous`                                                   |
| `/esamina`, `/ricetta` | several recipes match                                               | `miss`, `recipe_ambiguous`                                                    |
| `/esamina`             | no item or recipe matches                                           | `miss`, `examine_not_found`                                                   |
| `/ricetta`             | no recipe matches, or none visible                                  | `miss`, `recipe_not_found`, `no_recipes`                                      |
| `/ricetta <recipe>`    | ingredients missing (each with how many)                            | `recipeDetail`, its `missing`                                                 |
| `/viaggio`             | no place matches, or several                                        | `miss`, `place_not_found`, `place_ambiguous`                                  |
| `/viaggio <place>`     | an item the place requires is missing (not named)                   | `travelBlocked`                                                               |
| `/stats`               | no such player                                                      | `miss`, `stats_unknown_user`                                                  |
| `/inventario`          | a filter it does not take                                           | `miss`, `inventory_bad_filter`                                                |
| `/biglietto`           | no lottery open                                                     | `miss`, `lottery_none`                                                        |
| any                    | an argument too long or too short                                   | `miss`, `argument_length`                                                     |
| any                    | not registered, restricted, a captcha, a changed username, an error | `miss`, `register_first`, `restricted`, `captcha`, `username_locked`, `error` |
| any                    | the bot's own failures and other not-found wordings                 | not recognised                                                                |

A reply the grammar does not recognise is not published as a reply; one that answers an adventure is
a turn whose outcome is `unknown`, and is reported to the parser's drift.
