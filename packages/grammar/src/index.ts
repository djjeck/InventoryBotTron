/**
 * The module's entry, its public API: InventoryBot's reply grammar, for a program that reads the
 * bot's replies one at a time (a live bot) rather than a whole export. Installed in
 * MegaBotTron1999 as the library module of `module.json`, it is imported by the name the module
 * provides (`@inventorybottron/grammar`).
 *
 * This file is the contract: what it exports keeps its meaning across the module's minor and patch
 * versions, and changes only with a new major version (`version` in `module.json`). Everything
 * else in the package, the files the module ships included, is internal and may change at any
 * time.
 *
 * The module knows the grammar, never the game: the item names, the sentence prefixes and the
 * titles it resolves against are the caller's (`Knowledge`), and the module ships no game
 * knowledge at all, not even cue words (InventoryBotTron's CLAUDE.md, "Game content"). Pure logic
 * only: no Node APIs, no npm packages.
 *
 * Comments name the reply formats by their sections in InventoryBotTron's `docs/bot-protocol.md`,
 * the grammar's specification, and the wiki's pipeline by its phases and files (`build.ts`): the
 * wiki (djjeck/inventorybot-wiki) reads every export with this grammar.
 */
import { classify, INVENTORY_COMMANDS, INVENTORY_LIST_COMMANDS } from './classify.ts';
import { type DropKnowledge, type DropResolution, guessDropItem, resolveDrop } from './drops.ts';
import {
  codePointLength,
  compareCodePoints,
  sliceCodePoints,
  splitWords,
  stripEndChars,
  stripWs,
  WS_CLASS,
} from './lib/text.ts';
import { PAKKOMON, pakkomonItem } from './pakkomon.ts';
import { shapeGiven, shapeOf, unshaped } from './shapes.ts';
import { replyNormalizer } from './titles.ts';

export type {
  AdventureDropEvent,
  CooldownEvent,
  CraftEvent,
  Event,
  EventType,
  GiftEvent,
  GiveEvent,
  InventoryEvent,
  ItemCardEvent,
  ItemCooldownEvent,
  ItemInfoEvent,
  ItemLine,
  LocationEvent,
  LoreCardEvent,
  LuckyDropEvent,
  MissEvent,
  OldFormatEvent,
  PakkomonBossEvent,
  PakkomonChallengeEvent,
  PakkomonFightEvent,
  PakkomonReadiness,
  PakkomonReadyEvent,
  PakkomonRecordEvent,
  PakkomonRole,
  PakkomonSide,
  PakkomonStunnedEvent,
  PakkomonUse,
  PlaceCardEvent,
  RecipeCardEvent,
  RecipeDetailEvent,
  RecipeListEntry,
  RecipeListEvent,
  ShowEvent,
  StatsEvent,
  TitleEvent,
  TravelBlockedEvent,
  TravelEvent,
  TravelRequirementEvent,
  UnknownEvent,
  UseEvent,
} from './types.ts';
export { classify, type DropKnowledge, type DropResolution, guessDropItem, resolveDrop };

/**
 * The commands that list the inventory (docs/bot-protocol.md 6.8): `/inventario` and its aliases,
 * which take a filter, and `/collezioni`, `/inv2` and `/esporta`, which take none.
 */
export { INVENTORY_COMMANDS, INVENTORY_LIST_COMMANDS };

/**
 * Shaped items (docs/bot-protocol.md 2.6): the item a shaped item is (`unshaped`), its shape
 * (`shapeOf`), and the shape a use's reply gave it (`shapeGiven`).
 */
export { shapeGiven, shapeOf, unshaped };

/**
 * Pakkomon as items (docs/bot-protocol.md 2.9): the item a Pakkomon is (`pakkomonItem(name)`,
 * `un Pakkomon di nome NAME`), and the one item every Pakkomon is for a reader of the game
 * (`PAKKOMON`, `un Pakkomon`).
 */
export { PAKKOMON, pakkomonItem };

/**
 * The text helpers the grammar reads with, which know nothing of the game: whitespace and words
 * as the bot's texts have them, and strings by code points.
 */
export {
  codePointLength,
  compareCodePoints,
  sliceCodePoints,
  splitWords,
  stripEndChars,
  stripWs,
  WS_CLASS,
};

/** What the caller knows of the game, which the module never ships. */
export interface Knowledge extends DropKnowledge {
  /** The player titles the bot prints after a username ("il fornaio"), in any order. */
  readonly titles?: readonly string[];
}

/**
 * A bot reply as `classify` reads it: the player titles of `known` removed after each username
 * ("@u il fornaio, possiedi:" is "@u, possiedi:"), and the admin's "Sua Maestà" prefix.
 */
export function normalizeReply(text: string, known: Pick<Knowledge, 'titles'>): string {
  // Longest first, so that a title is never cut by a shorter one it starts with.
  const titles = [...(known.titles ?? [])].sort((a, b) => codePointLength(b) - codePointLength(a));
  return replyNormalizer(titles)(text);
}
