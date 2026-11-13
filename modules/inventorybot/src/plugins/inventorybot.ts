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
 * - In private, every other reply of a kind it knows (`src/replies.ts`: a listing, an item's card,
 *   a recipe, a craft, a `/mostra`, a use, a gift or a give, a place, a Pakkomon, an item's
 *   cooldown, one of the bot's fixed replies): published as its own event type,
 *   `inventorybot.<kind>`, the grammar's event read with the owner's last command there, which it
 *   answers, each with its own schema (since 0.6.0; until then all were one `inventorybot.reply`).
 *   The `/esporta` reply is read from the file its message carries, as a whole listing (since
 *   0.4.1); its caption alone tells nothing, and a file that came without its text is logged with
 *   why. A reply read from a message played back is marked `playback: true` (since 0.4.0), as the
 *   turn parser marks its turns: a state applies it and announces nothing of it. A turn's `gain`
 *   carries its drop's narrative (`raw`), with which a reader resolves a guess again.

 * Each instance keeps what it learns (items and drops' sentences) in its own store
 * (`src/knowledge.ts`), so the base parser is made per instance, with its knowledge, rather than
 * once in the factory. Its action `seed` adds to it what the owner's own export teaches
 * (`scripts/seed-knowledge.ts` of InventoryBotTron makes it), merged with what it knows.
 */
import { type Plugin } from '@megabottron1999/core';
import {
  ANSWER_WINDOW_MS,
  turnParserPlugin,
  type TurnParserSpec,
} from '@megabottron1999/turns/turn-parser.ts';
import { z } from 'zod';
import { InventoryKnowledge, seedSchema } from '#src/knowledge.ts';
import { readInventoryBot, readStateReply } from '#src/read.ts';
import { REPLY_SCHEMAS, replyEvent, replyPayload } from '#src/replies.ts';
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
    events: { ...base.events, ...REPLY_SCHEMAS },
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
    // The owner's last command in each private chat, which the bot's next reply there answers.
    const last = new Map<string, { text: string; t: number }>();
    const chat = ctx.connector('chat');
    chat.onMessage((m) => {
      if (!m.chat.startsWith('@')) return;
      if (m.own === true) {
        if (m.text.trim().startsWith('/')) last.set(m.chat, { text: m.text.trim(), t: m.time });
        return;
      }
      if (m.sender.toLowerCase() !== INVENTORYBOT.toLowerCase()) return;
      const command = last.get(m.chat);
      const query =
        command !== undefined && m.time - command.t <= ANSWER_WINDOW_MS ? command.text : null;
      // The file it carries (the /esporta file), or why the connector left its text out.
      const doc = m.document;
      if (doc?.skipped !== undefined)
        ctx.log.warn(
          `a file of the bot's (${doc.name || 'unnamed'}, ${doc.mime || 'no type'}, ${doc.size} bytes) came without its text (${doc.skipped}): its caption alone is read`
        );
      const reply = readStateReply(m.text, query, doc?.text);
      if (reply === undefined) return;
      ctx.bus.publish(
        replyEvent(reply.type),
        replyPayload(reply, {
          chat: m.chat,
          query,
          self: chat.self(),
          playback: m.playback === true,
        }),
        m.time
      );
    });
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
