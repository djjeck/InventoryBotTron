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

`{ chat, outcome, retryAt?, playback? }`: what the bot answered to one of the owner's adventures, in
the private chat or a group the edge reads; `retryAt` (ms, with MegaBotTron1999 0.1.21 or later) the
end of the rest it starts, when the next adventure may go. Its `outcome` is the shape every game
bot's parser shares:

- `{ kind: 'gain', bot, item, rarity, tags, sure, raw? }`: a drop addressed to the owner, or the
  lucky adventure's prize; `sure` false when the item is a guess (its sentence and item both
  unknown), `raw` the drop's narrative;
- `{ kind: 'nothing', bot, reason: 'cooldown', retryMs }`: the adventure's cooldown, in private;
- `{ kind: 'unknown', bot, text }`: a message that answers a turn and that the parser cannot read.

The drops and the adventure's cooldown are the turns' alone: no other event of the parser repeats
them.

### Corrections: `inventorybot.resolved`

`{ chat, guess, item, raw, rarity, tags, date, playback? }`: one of the owner's drops whose item the
parser guessed (a turn's `gain` with `sure: false`), resolved by what it learned since: an item that
ends the drop's narrative, or a sentence that starts it, from any message it reads (any player's, in
any chat it reads, live or played back) or from a seed. `guess` is the item the turn said, `item`
the real one, `chat` and `date` (ms) the drop's; `playback` when the message that taught it was
history. It is published before the reply that taught it, so that a listing that names the item
counts it after the correction. A whole inventory of the owner's (the `/esporta` file, or a complete
listing with no filter) forgets the guesses before it, which it counted: none of them is resolved
after it.

### The private replies: one event per kind

Every other reply of the bot in the private chat, where every reply is the owner's, is published as
its own event type, `inventorybot.<kind>`, `<kind>` the grammar's event type in camel case. Each
carries the reply's context, then the grammar's fields, flat:

- `chat`: the private chat;
- `query`: the owner's last command there, which the reply answers, or null when none is recent;
- `self`: the owner's username, once the account knows it;
- `playback: true`: read from a message played back (missed while the instance was down), history
  and not news.

Since 0.9.0, a few kinds carry what the command answers (below) read besides the grammar's fields:
`inventorybot.itemCooldown` and `inventorybot.pakkomonStunned` their `retryAt` (ms: when the item
may be used or given again, the wait stated plus its smallest unit, since the bot truncates it; when
the Pakkomon recovers), `inventorybot.use` its `failed` (the use failed for a requirement it lacks:
the state's `isFailedUse`), `inventorybot.recipeDetail` its `examined` (it answers an `/esamina` of
the recipe, `per fare la ricetta …`, rather than refusing a `/ricetta`, `per fare …`).

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

The `inventorybot-state` node applies the turns, the private replies and the corrections, and
publishes, in its own namespace, `inventorybot-state`:

- `inventorybot-state.changed`, `{ sections, refreshed, event? }`: its state changed;
- `inventorybot-state.gained`, `{ item, sure, qty, exact }`: one per item the owner gained (a drop,
  sure or guessed, a lucky drop, a gift, a craft's output, what a `/usa` gave), live only;
- `inventorybot-state.refused`: an event its reducer could not apply.

**The state's events announce new facts, never corrections of past facts.** The parser makes sense
of what happens; the state only records the owner's history. A correction (`inventorybot.resolved`)
flows from the parser to the state: the state moves the drop's count from the guess to the item, and
`changed` tells the sections it changed, but it tells no `gained` again and no event of its own for
it. A script that needs corrections listens to the parser's `inventorybot.resolved`.

## The owner's summary

Since 0.8.0, the `inventorybot-state` node adds a line to the owner's periodic summary
(MegaBotTron1999's `owner-notice`, its D92), under its node's id, after the state plugin's own
`N events applied`: what it told gained since the last summary, `N items gained, M new`, `N` its
`gained` events (live gains only: none from the catch-up at start or a message played back), `M`
those of an item held for the first time (`qty` 1), `, M new` left out when none is. When it told no
gain, it adds no line, so a quiet window sends no summary. The counts live in memory: a restart
forgets them.

## Command answers

Since 0.9.0 (MegaBotTron1999 0.1.21 or later: its command answers, its issue #59 and D98), the
parser's events answer the owner's commands: a node that sends one to the bot's private chat through
the owner's account (a script's `const a = await enqueue(…)`) learns what the bot said to it,
`{ status: 'ok' | 'refused' | 'unanswered', reason?, retryAt?, event? }`, `event` the parser's event
that answered (`a.event.reply`, `a.event.retryAt`, …). The core pairs an event with the oldest send
of a command it answers still waiting in that chat (two minutes at most, then `unanswered`); an
event read from a message played back answers nothing. The first line that matches an event is its
answer:

| Command                                                               | Event (when)                                                                            | Answer                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| `/avventura`                                                          | `inventorybot.turn` (`nothing`, `cooldown`)                                             | refused, `cooldown`, `retryAt`     |
| `/avventura`                                                          | `inventorybot.turn` (a gain)                                                            | ok, `rest`, `retryAt`              |
| `/inventario`, `/inventory`, `/i`, `/collezioni`, `/inv2`, `/esporta` | `inventorybot.inventory`                                                                | ok                                 |
| `/titolo`                                                             | `inventorybot.title`                                                                    | ok                                 |
| `/esamina`                                                            | `inventorybot.itemInfo`                                                                 | ok                                 |
| `/esamina`                                                            | `inventorybot.recipeDetail` (`examined`)                                                | ok                                 |
| `/ricetta`                                                            | `inventorybot.recipeDetail` (otherwise: ingredients missing)                            | refused, `missing`                 |
| `/ricetta`                                                            | `inventorybot.recipeList`, `inventorybot.craft`                                         | ok                                 |
| `/mostra`                                                             | `inventorybot.show`                                                                     | ok                                 |
| `/dai`                                                                | `inventorybot.give`                                                                     | ok                                 |
| `/usa`                                                                | `inventorybot.use` (`failed`)                                                           | refused, `missing`                 |
| `/usa`                                                                | `inventorybot.use` (otherwise)                                                          | ok                                 |
| `/viaggio`                                                            | `inventorybot.travel`, `inventorybot.location`                                          | ok                                 |
| `/viaggio`                                                            | `inventorybot.travelBlocked`                                                            | refused, `missing`                 |
| `/usa`, `/dai`                                                        | `inventorybot.itemCooldown`                                                             | refused, `cooldown` (no `retryAt`) |
| `/usa`                                                                | `inventorybot.pakkomonStunned`                                                          | refused, `cooldown` (no `retryAt`) |
| `/usa`                                                                | `inventorybot.pakkomonRecord`, `.pakkomonReady`, `.pakkomonChallenge`, `.pakkomonFight` | ok                                 |
| as the table of refusals below says                                   | `inventorybot.miss`, by its `reply`                                                     | refused, with its reason, or ok    |

The reasons are MegaBotTron1999's where one fits, else the game's own: `cooldown`; `missing` (the
owner lacks what the command needs: the item, enough of it, the ingredients, the key, the item a
place requires; `item_not_owned`, `use_not_owned`, `use_target_not_owned`, `use_wrong_key`,
`examine_not_found`, `recipe_not_found`, `no_recipes`, `dai_not_enough`, `pakkomon_gone`);
`not_found` (no such player, place or target: `dai_unknown_user`, `stats_unknown_user`,
`place_not_found`, `use_target_unknown`); `ambiguous` (`examine_ambiguous`, `recipe_ambiguous`,
`item_ambiguous`, `place_ambiguous`); `invalid` (`dai_syntax`, `dai_bad_quantity`, `examine_what`,
`use_what`, `use_not_usable`, `inventory_bad_filter`, `argument_length`); `untrusted`
(`dai_untrusted`, `dai_doubtful`); `closed` (`lottery_none`); `restricted` (`register_first`,
`restricted`, `captcha`, `username_locked`, `game_moved`); `error` (`error`). The fixed replies that
answer any command (`argument_length`, `restricted`'s, `error`) answer each of the bot's. Fixed
replies that are the command's answer are `ok`: `faq` (`/faq`, `/start`, `/help`), `welcome`
(`/start`, `/registrami`), `commands` (`/faqcomandi`), `groups` (`/gruppi`), `leaderboards`
(`/stats`), `hidden_recipes`, `hide_recipe`, `unhide_recipe` (`/nascondi`), `favourite`
(`/preferito`), `quest_none` (`/quest`), `pakkomon_stop` (`/usa`).

- **An item's cooldown, a stunned Pakkomon:** refused with `cooldown`, the time in the event
  (`a.event.retryAt`), but not as the answer's `retryAt`: that would hold every `/usa` (or `/dai`)
  back in the chat until then, hours for some items, while the wait is the item's or the Pakkomon's.
  A node refused again and again for them is backed off by MegaBotTron1999's retry-loop guard (three
  in a row) instead.
- **What answers nothing:** a gift (another player's), the side notice of an item a place on the way
  back requires (`travelRequirement`), the lottery's announcements, a reply the grammar does not
  recognise (the command is `unanswered`), and the `/esporta` caption whose file did not come.
- **A command the parser does not see:** the account never sees the messages it sends itself, so the
  parser knows only the commands the owner types (`query`). A reply whose reading needs the command
  (most `/usa` replies, a narrated `/viaggio` arrival) is not recognised after a command sent by a
  node, and that command is `unanswered`: its refusals by fixed replies, its cooldowns and its
  Pakkomon replies are answered, a `/usa`'s other replies are not.

## Refusals

These are the bot's replies that refuse a command, by what they say, and how the parser reads each.
"Recognised" means the grammar reads the reply as the event named; none of them changes the owner's
items, but a `/dai` refused with the count owned, which the state takes as that item's exact count.

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
