/**
 * The `inventorybot` parser plugin: InventoryBot's answers to the owner's turns, on the base of
 * MegaBotTron1999's `@megabottron1999/turns/turn-parser.ts` (its docs/bot-os-api.md §5), read by
 * `src/read.ts` with the grammar.
 *
 * - A drop or the lucky adventure addressed to the owner, in either chat: a gain, then its 15
 *   minutes' rest. The bot does not reply to the command, so it names the player.
 * - Its cooldown names nobody: read only in the private chat, with its wait.
 * - In private, the first message after a turn that is neither: claimed and unread (drift).
 *
 * Each instance keeps what it learns (items and drops' sentences) in its own store
 * (`src/knowledge.ts`), so the base parser is made per instance, with its knowledge, rather than
 * once in the factory. Its action `seed` adds to it what the owner's own export teaches
 * (`scripts/seed-knowledge.ts` of InventoryBotTron makes it), merged with what it knows.
 */
import { type Plugin } from '@megabottron1999/core';
import { turnParserPlugin, type TurnParserSpec } from '@megabottron1999/turns/turn-parser.ts';
import { z } from 'zod';
import { InventoryKnowledge, seedSchema } from '#src/knowledge.ts';
import { readInventoryBot } from '#src/read.ts';
import { INVENTORYBOT, TURN_COMMANDS } from '#src/turn.ts';

/** The plugin's id, and the namespace of its events (`inventorybot.turn`). */
export const INVENTORYBOT_PARSER = 'inventorybot';

const spec = (read: TurnParserSpec['read']): TurnParserSpec => ({
  id: INVENTORYBOT_PARSER,
  bot: INVENTORYBOT,
  description: "@InventoryBot's answers to the owner's turns: the items, and its rest",
  turnCommands: TURN_COMMANDS,
  read,
});

const base = turnParserPlugin(spec(() => undefined)).manifest;

export const inventorybotPlugin: Plugin = {
  manifest: {
    ...base,
    interface: {
      ...base.interface,
      actions: {
        ...base.interface?.actions,
        seed: {
          help: "Add items and drops' sentences to what it knows: the owner's own, from their export",
          input: seedSchema,
          output: z.object({ items: z.number(), prefixes: z.number() }),
        },
      },
    },
  },
  create: async (ctx) => {
    const known = new InventoryKnowledge(ctx.store);
    const parser = await turnParserPlugin(spec((m) => readInventoryBot(m, known))).create(ctx);
    const actions = parser.interface?.['actions'] as Record<string, unknown> | undefined;
    return {
      ...parser,
      interface: {
        ...parser.interface,
        actions: { ...actions, seed: (input: z.infer<typeof seedSchema>) => known.seed(input) },
      },
    };
  },
};

/** The module's plugin entry (MegaBotTron1999's docs/bot-os-api.md §7.2). */
export const plugins: Plugin[] = [inventorybotPlugin];
