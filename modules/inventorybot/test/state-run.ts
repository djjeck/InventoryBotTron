/**
 * The `inventorybot` parser and the `inventorybot-state` node on the owner's faked Telegram account,
 * on an instance's data volume and event log as the image's entry point makes them, so that a test
 * stops it and starts it again: what the state applies, keeps, announces and refuses. The owner is
 * `mario_r`, of the invented universe (scripts/universe.md).
 */
import { TELEGRAM_USER } from '@megabottron1999/connectors/plugins/telegram-user.ts';
import {
  type BusEvent,
  Core,
  CoreEventLog,
  FakeConnector,
  fakeConnectorPlugin,
  type Heard,
  VirtualClock,
} from '@megabottron1999/core';
import path from 'node:path';
import { inventorybotPlugin } from '#src/plugins/inventorybot.ts';
import { inventorybotStatePlugin } from '#src/plugins/inventorybot-state.ts';
import { INVENTORYBOT_STATE } from '#src/state.ts';
import { DM, GROUP, OWNER, T0 } from '#test/run.ts';

/** An instance in `dir`, from `at`; `config`, the state node's. */
export async function bootState(dir: string, o: { at?: number; config?: object } = {}) {
  const clock = new VirtualClock(o.at ?? T0);
  const log = new CoreEventLog(path.join(dir, 'events'));
  const account = new FakeConnector({ account: `telegram:${OWNER}` });
  const records: BusEvent[] = [];
  const core = new Core({
    clock,
    dataDir: path.join(dir, 'data'),
    events: log,
    print: () => undefined,
    record: (r) => {
      records.push(r as BusEvent);
      return log.write(r);
    },
    ...(o.config === undefined ? {} : { config: { [INVENTORYBOT_STATE]: o.config } }),
  });
  core.register(
    fakeConnectorPlugin(TELEGRAM_USER, account),
    inventorybotPlugin,
    inventorybotStatePlugin
  );
  await core.start();
  account.open();
  let n = 1000;
  /** Lets the state keep what it applied (once the bus's delivery is over). */
  const settle = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };
  /** A message of the bot, in private unless it says otherwise, `min` minutes on. */
  const bot = async (text: string, m: Partial<Heard> = {}): Promise<void> => {
    account.hear({
      chat: DM,
      sender: 'InventoryBot',
      time: clock.now(),
      id: String(n++),
      text,
      ...m,
    });
    await settle();
  };
  /** A command of the owner's, in private. */
  const owner = async (text: string): Promise<void> => {
    account.hear({ chat: DM, sender: OWNER, own: true, time: clock.now(), id: String(n++), text });
    await settle();
  };
  const read = (name: string, input?: Record<string, unknown>): unknown => {
    const r = core.controls.read(INVENTORYBOT_STATE, name, input);
    if ('error' in r) throw new Error(r.error);
    return r.value;
  };
  const of = (type: string): BusEvent[] => records.filter((r) => r.type === type);
  return { core, clock, log, account, bot, owner, read, of, settle, GROUP };
}
