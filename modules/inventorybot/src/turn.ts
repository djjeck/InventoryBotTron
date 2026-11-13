/**
 * What the `inventorybot` parser publishes of a turn, `inventorybot.turn`'s `outcome`: the shape
 * every game bot's parser of the owner's graph shares (`kind`, `bot`, and what the kind says), so
 * that the nodes reading the turns of several games (a ledger, a reactor) read this one's too.
 */

/** The bot's username, without `@`. */
export const INVENTORYBOT = 'InventoryBot';

/** Its turn command (docs/bot-protocol.md §2.1), a fact of the game (MegaBotTron1999's D70). */
export const TURN_COMMANDS: readonly string[] = ['/avventura'];

/** The rest after an adventure: one every 15 minutes (docs/bot-protocol.md §2.1). */
export const TURN_REST_MS = 15 * 60_000;

/** A turn's outcome, as the parser publishes it. */
export type InventoryOutcome =
  | {
      kind: 'gain';
      bot: typeof INVENTORYBOT;
      item: string;
      /** The rarity code, `C` to `X` (docs/bot-protocol.md §2.2). */
      rarity: string;
      /** `usabile`, or none. */
      tags: string[];
      /** False when the item's name is a guess, its sentence and item both unknown. */
      sure: boolean;
    }
  | {
      kind: 'nothing';
      bot: typeof INVENTORYBOT;
      reason: 'cooldown';
      /** The cooldown's wait, as the bot states it, in ms. */
      retryMs: number;
    };
