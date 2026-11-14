/**
 * The `inventorybot` parser's command answers (MegaBotTron1999's command answers, its #59 and
 * D98, since 0.9.0): which of its events answer which of the owner's commands to the bot, with a
 * status (`ok` or `refused`) and a reason, so that a node that sends a command (a script's
 * `await enqueue(…)`) learns what the bot said to it. Declared in its manifest's `answers`, after
 * the turn parser's own (its `inventorybot.turn` answers `/avventura`: `refused`/`cooldown` for a
 * "too soon", `ok`/`rest` for a drop, each with its `retryAt`).
 *
 * - **The core pairs them,** not the parser: an event it publishes while it reads a live message of
 *   the private chat, which a declaration below matches, answers the oldest send of one of the
 *   declaration's commands still waiting there. The first declaration that matches an event is its
 *   answer, whatever command waits, so an event (and its `when`) is declared once with every
 *   command it answers. Only the private chat's replies are published, so only the commands sent
 *   there are answered (the group's turns aside, which the turn parser answers).
 * - **The reasons** are MegaBotTron1999's where one fits (`cooldown`, `missing`, `invalid`), else
 *   the game's own: `not_found` (the argument names no player, place or recipe the bot knows),
 *   `ambiguous` (it names several), `untrusted` (the receiver of a `/dai` is refused), `restricted`
 *   (the account cannot play now), `closed` (no lottery open), `error` (the bot failed). The bot's
 *   reply itself is the answer's `event`, its `reply` the grammar's name of a fixed reply (the
 *   module's README, "Refusals").
 * - **An item's cooldown and a stunned Pakkomon** are refused with `cooldown` and their `retryAt` in
 *   the event (`retryAt`, the payload's), but declare no `retryAtFrom`: the wait is the item's or
 *   the Pakkomon's, not the command's, and the core would hold every `/usa` (or `/dai`) back until
 *   then, hours for some items.
 *
 * Pure data only.
 */
import { INVENTORY_COMMANDS, INVENTORY_LIST_COMMANDS } from '@inventorybottron/grammar';
import { type AnswerDeclarationInput } from '@megabottron1999/core';
import { replyEvent, type ReplyKind } from './replies.ts';
import { TURN_COMMANDS } from './turn.ts';

/**
 * Every command of the bot's (docs/bot-protocol.md §3), by first word, which a reply the bot gives
 * to any command answers (a captcha, an error).
 */
export const BOT_COMMANDS: readonly string[] = [
  ...TURN_COMMANDS,
  ...INVENTORY_COMMANDS,
  ...INVENTORY_LIST_COMMANDS,
  '/ricetta',
  '/mostra',
  '/dai',
  '/esamina',
  '/usa',
  '/viaggio',
  '/stats',
  '/suggerisci',
  '/nascondi',
  '/notificheon',
  '/notificheoff',
  '/start',
  '/registrami',
  '/faq',
  '/faqcomandi',
  '/help',
  '/gruppi',
  '/titolo',
  '/preferito',
  '/quest',
  '/biglietto',
];

const LISTINGS = [...INVENTORY_COMMANDS, ...INVENTORY_LIST_COMMANDS];

/**
 * The bot's fixed replies (`inventorybot.miss`, by the grammar's name in `reply`) that answer a
 * command: the commands each answers, and `ok`, or `refused` with its reason. The others (the
 * lottery's announcements, a ban, the admin's healing, the `/esporta` caption without its file)
 * answer no command of the owner's, and a group's restriction is never read in private.
 */
export const MISS_ANSWERS: Readonly<
  Record<string, readonly [commands: readonly string[], status: 'ok' | 'refused', reason?: string]>
> = {
  // Refused: what the command names, the owner lacks.
  item_not_owned: [['/mostra', '/dai', '/preferito'], 'refused', 'missing'],
  use_not_owned: [['/usa'], 'refused', 'missing'],
  use_target_not_owned: [['/usa'], 'refused', 'missing'],
  use_wrong_key: [['/usa'], 'refused', 'missing'],
  examine_not_found: [['/esamina'], 'refused', 'missing'],
  recipe_not_found: [['/ricetta'], 'refused', 'missing'],
  no_recipes: [['/ricetta'], 'refused', 'missing'],
  dai_not_enough: [['/dai'], 'refused', 'missing'],
  pakkomon_gone: [['/usa'], 'refused', 'missing'],
  // Refused: the argument names nothing the bot knows.
  dai_unknown_user: [['/dai'], 'refused', 'not_found'],
  stats_unknown_user: [['/stats'], 'refused', 'not_found'],
  place_not_found: [['/viaggio'], 'refused', 'not_found'],
  use_target_unknown: [['/usa'], 'refused', 'not_found'],
  // Refused: the argument names several.
  examine_ambiguous: [['/esamina'], 'refused', 'ambiguous'],
  recipe_ambiguous: [['/ricetta', '/esamina'], 'refused', 'ambiguous'],
  item_ambiguous: [['/mostra', '/dai', '/usa'], 'refused', 'ambiguous'],
  place_ambiguous: [['/viaggio'], 'refused', 'ambiguous'],
  // Refused: the command is not well formed.
  dai_syntax: [['/dai'], 'refused', 'invalid'],
  dai_bad_quantity: [['/dai'], 'refused', 'invalid'],
  examine_what: [['/esamina'], 'refused', 'invalid'],
  use_what: [['/usa'], 'refused', 'invalid'],
  use_not_usable: [['/usa'], 'refused', 'invalid'],
  inventory_bad_filter: [INVENTORY_COMMANDS, 'refused', 'invalid'],
  argument_length: [BOT_COMMANDS, 'refused', 'invalid'],
  // Refused for the game's own reasons.
  dai_untrusted: [['/dai'], 'refused', 'untrusted'],
  dai_doubtful: [['/dai'], 'refused', 'untrusted'],
  lottery_none: [['/biglietto'], 'refused', 'closed'],
  register_first: [BOT_COMMANDS, 'refused', 'restricted'],
  restricted: [BOT_COMMANDS, 'refused', 'restricted'],
  captcha: [BOT_COMMANDS, 'refused', 'restricted'],
  username_locked: [BOT_COMMANDS, 'refused', 'restricted'],
  game_moved: [BOT_COMMANDS, 'refused', 'restricted'],
  error: [BOT_COMMANDS, 'refused', 'error'],
  // Done: the fixed reply is the command's answer.
  faq: [['/faq', '/start', '/help'], 'ok'],
  welcome: [['/start', '/registrami'], 'ok'],
  commands: [['/faqcomandi'], 'ok'],
  groups: [['/gruppi'], 'ok'],
  leaderboards: [['/stats'], 'ok'],
  hidden_recipes: [['/nascondi'], 'ok'],
  hide_recipe: [['/nascondi'], 'ok'],
  unhide_recipe: [['/nascondi'], 'ok'],
  favourite: [['/preferito'], 'ok'],
  quest_none: [['/quest'], 'ok'],
  pakkomon_stop: [['/usa'], 'ok'],
};

const ok = (kind: ReplyKind, commands: readonly string[]): AnswerDeclarationInput => ({
  event: replyEvent(kind),
  commands: [...commands],
  status: 'ok',
});

/** The parser's answers, beside the turn parser's: the first that matches an event is its answer. */
export const ANSWERS: readonly AnswerDeclarationInput[] = [
  // Listings and cards.
  ok('inventory', LISTINGS),
  ok('title', ['/titolo']),
  ok('item_info', ['/esamina']),
  // A recipe's detail: always an /esamina's answer, else a /ricetta refused for what it misses.
  { ...ok('recipe_detail', ['/esamina']), when: { examined: true } },
  {
    event: replyEvent('recipe_detail'),
    commands: ['/ricetta'],
    status: 'refused',
    reason: 'missing',
  },
  ok('recipe_list', ['/ricetta']),
  ok('craft', ['/ricetta']),
  ok('show', ['/mostra']),
  ok('give', ['/dai']),
  // A use, unless its text says it failed for what it lacks (the state's `isFailedUse`).
  {
    event: replyEvent('use'),
    commands: ['/usa'],
    when: { failed: true },
    status: 'refused',
    reason: 'missing',
  },
  ok('use', ['/usa']),
  // Travel.
  ok('travel', ['/viaggio']),
  ok('location', ['/viaggio']),
  {
    event: replyEvent('travel_blocked'),
    commands: ['/viaggio'],
    status: 'refused',
    reason: 'missing',
  },
  // Cooldowns: the item's or the Pakkomon's, not the command's (no `retryAtFrom`, above).
  {
    event: replyEvent('item_cooldown'),
    commands: ['/usa', '/dai'],
    status: 'refused',
    reason: 'cooldown',
  },
  {
    event: replyEvent('pakkomon_stunned'),
    commands: ['/usa'],
    status: 'refused',
    reason: 'cooldown',
  },
  // Pakkomon: a record, a challenge, a wait for any challenger, a fight.
  ok('pakkomon_record', ['/usa']),
  ok('pakkomon_ready', ['/usa']),
  ok('pakkomon_challenge', ['/usa']),
  ok('pakkomon_fight', ['/usa']),
  // The bot's fixed replies, by name.
  ...Object.entries(MISS_ANSWERS).map(
    ([reply, [commands, status, reason]]): AnswerDeclarationInput => ({
      event: replyEvent('miss'),
      commands: [...commands],
      when: { reply },
      status,
      ...(reason === undefined ? {} : { reason }),
    })
  ),
];
