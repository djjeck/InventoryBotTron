/**
 * `inventorybot.resolved` (since 0.7.0): one of the owner's drops whose item the parser guessed,
 * resolved by what it learned since (`knowledge.ts`, `settle`), from any message it reads, any
 * player's, in any chat it reads, played back or live. A correction of a fact already published (the
 * drop's turn), told by the parser only: the player state applies it by moving the drop's count from
 * the guess to the item, and tells nothing of it in its own events, which announce new facts only.
 * Pure logic only.
 */
import { z } from 'zod';
import { type Resolution } from './knowledge.ts';

/** Its event type. */
export const RESOLVED_EVENT = 'inventorybot.resolved';

/** Its payload. */
export const resolvedSchema = z
  .object({
    chat: z.string().describe('The chat the drop was read in'),
    guess: z.string().describe('The item the drop was published as: a guess'),
    item: z.string().describe('Its real item'),
    raw: z.string().describe("The drop's narrative, which the item ends"),
    rarity: z.string().describe("The drop's rarity code"),
    tags: z.array(z.string()).describe('usabile, or none'),
    date: z.number().describe("When the drop was read (ms): its turn's time"),
    playback: z
      .literal(true)
      .optional()
      .describe('Learned from a message played back (missed while down)'),
  })
  .describe(
    "One of the owner's guessed drops resolved: what the parser learned since names its item"
  );

/** A resolution as its event's payload; `playback` when the message that taught it was history. */
export function resolvedPayload(r: Resolution, playback: boolean): Record<string, unknown> {
  return {
    chat: r.chat,
    guess: r.guess,
    item: r.item,
    raw: r.raw,
    rarity: r.rarity,
    tags: r.tags,
    date: r.t,
    ...(playback ? { playback: true } : {}),
  };
}
