/**
 * The `inventorybot` parser on the owner's faked Telegram account, in MegaBotTron1999's dev kit:
 * what it publishes, drifts and offers. As MegaBotTron1999's own `test/parser-run.ts`, with an
 * owner of the invented universe (scripts/universe.md), `mario_r`.
 */
import { TELEGRAM_USER } from '@megabottron1999/connectors/plugins/telegram-user.ts';
import {
  type BusEvent,
  definePlugin,
  DevKit,
  FakeConnector,
  fakeConnectorPlugin,
  type Heard,
} from '@megabottron1999/core';
import { inventorybotPlugin } from '#src/plugins/inventorybot.ts';

export const T0 = Date.parse('2026-11-06T12:00:00Z');
export const MIN = 60_000;
export const OWNER = 'mario_r';
/** The owner's Telegram id, as the account knows it (MegaBotTron1999's D167). */
export const OWNER_ID = '5000042';
export const DM = '@InventoryBot';
export const GROUP = '-1001000000001';

/** A node that sends commands to the bot's private chat, as a script does: `outbox('chat')`. */
export const SENDER = 'sender';
const senderPlugin = definePlugin({
  manifest: {
    id: SENDER,
    kinds: ['actor'],
    description: 'sends the owner’s commands',
    outputs: { chat: { type: 'chat-out', network: 'telegram' } },
  },
  create: () => ({}),
});

/**
 * The parser, its edge reading the group too; `documents`, what its store starts with. With
 * `sender`, a node (`SENDER`) whose live edge sends to the private chat with the bot.
 */
export async function runParser(documents?: Record<string, unknown>, o: { sender?: boolean } = {}) {
  const plugin = inventorybotPlugin;
  const id = plugin.manifest.id;
  const account = new FakeConnector({ account: `telegram:${OWNER}`, selfId: OWNER_ID });
  const events: BusEvent[] = [];
  const replies: BusEvent[] = [];
  const lines: string[] = [];
  const kit = new DevKit({
    start: T0,
    plugins: [
      fakeConnectorPlugin(TELEGRAM_USER, account),
      plugin,
      ...(o.sender === true ? [senderPlugin] : []),
    ],
    ...(documents === undefined ? {} : { documents: { [id]: documents } }),
    graph: (defaults) => ({
      ...defaults,
      edges: [
        ...defaults.edges
          .filter((e) => e.from !== `${SENDER}.chat`)
          .map((e) =>
            e.to !== `${id}.chat` ? e : { ...e, reads: [...(e.reads as string[]), GROUP] }
          ),
        ...(o.sender === true
          ? [
              {
                from: `${SENDER}.chat`,
                to: `${TELEGRAM_USER}.chat`,
                type: 'chat-out' as const,
                sends: [DM],
              },
            ]
          : []),
      ],
    }),
    print: (line) => void lines.push(line),
    record: (r) => {
      if (r.type.endsWith('.turn')) events.push(r as BusEvent);
      else if (r.type.startsWith(`${id}.`)) replies.push(r as BusEvent);
    },
  });
  await kit.start();
  account.open();
  let n = 1000;
  /** A message of the bot, in the group unless it says otherwise. */
  const bot = (text: string, m: Partial<Heard> = {}): void =>
    account.hear({
      chat: GROUP,
      senderUsername: 'InventoryBot',
      time: kit.clock.now(),
      id: String(n++),
      text,
      ...m,
    });
  const read = (name: string): unknown => {
    const r = kit.core.controls.read(id, name);
    return 'value' in r ? r.value : r;
  };
  const act = (name: string, input: unknown) => kit.core.controls.act(id, name, input);
  const outcomes = () => events.map((e) => e['outcome'] as Record<string, unknown>);
  const drift = () => kit.core.drift().find((d) => d.parser === id);
  /** A command of the owner's, in private unless it says otherwise. */
  const owner = (text: string, m: Partial<Heard> = {}): void =>
    account.hear({ chat: DM, senderUsername: OWNER, own: true, time: kit.clock.now(), text, ...m });
  return { kit, account, bot, owner, read, act, events, replies, lines, outcomes, drift };
}
