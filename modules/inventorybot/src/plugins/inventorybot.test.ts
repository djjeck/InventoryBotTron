import { TELEGRAM_USER } from '@megabottron1999/connectors/plugins/telegram-user.ts';
import {
  Core,
  FakeConnector,
  fakeConnectorPlugin,
  GraphFile,
  parseManifest,
  VirtualClock,
} from '@megabottron1999/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_DOC } from '#src/knowledge.ts';
import { DM, GROUP, MIN, OWNER, runParser, T0 } from '#test/run.ts';
import { INVENTORYBOT_PARSER, inventorybotPlugin, plugins } from './inventorybot.ts';

// Invented sentences (CLAUDE.md, "Game content"), with items of scripts/universe.md.
const S = 'mentre conti le nuvole dal tetto del mulino ti cade in mano ';
const COOLDOWN =
  'Troppo presto, devi riposare ancora per 20 minuti prima di poterti avventurare di nuovo. Nelle /faq puoi trovare gruppi per scambiare oggetti e giocare con altri utenti! :P';

describe('the inventorybot parser', () => {
  it('is the module’s one plugin, with the id, events and contract the graph names', () => {
    expect(plugins).toEqual([inventorybotPlugin]);
    const m = parseManifest(inventorybotPlugin.manifest);
    expect(m.id).toBe(INVENTORYBOT_PARSER);
    expect(Object.keys(m.events ?? {})).toEqual(['inventorybot.turn', 'inventorybot.reply']);
    expect(Object.keys(m.interface.state ?? {})).toEqual(['rest']);
    expect(Object.keys(m.interface.actions ?? {})).toEqual(['sent', 'seed']);
    expect(m.config).toBeUndefined();
  });

  it("reads the owner's drops in either chat, and the cooldown in private, with the rests", async () => {
    const p = await runParser();
    p.bot(`@${OWNER}, ${S}una perla [C]!`, { chat: DM });
    expect(p.read('rest')).toMatchObject({ until: T0 + 15 * MIN, why: 'its rest after a turn' });
    p.bot(`@${OWNER}, ${S}una chiave di ebano 🔑 [R] [usabile]!`);
    // Others' drops and the group's cooldown are none of its business.
    p.bot(`@lucia_b, ${S}un sasso [R]!`);
    p.bot(COOLDOWN);
    p.kit.runUntil(T0 + MIN);
    p.bot(COOLDOWN, { chat: DM });
    expect(p.outcomes()).toEqual([
      {
        kind: 'gain',
        bot: 'InventoryBot',
        item: 'una perla',
        rarity: 'C',
        tags: [],
        sure: false,
        raw: `${S}una perla`,
      },
      {
        kind: 'gain',
        bot: 'InventoryBot',
        item: 'una chiave di ebano 🔑',
        rarity: 'R',
        tags: ['usabile'],
        sure: false,
        raw: `${S}una chiave di ebano 🔑`,
      },
      { kind: 'nothing', bot: 'InventoryBot', reason: 'cooldown', retryMs: 20 * MIN },
    ]);
    expect(p.events.map((e) => e['chat'])).toEqual([DM, GROUP, DM]);
    expect(p.read('rest')).toMatchObject({ until: T0 + 21 * MIN, why: 'it said too soon' });
    expect(p.drift()).toMatchObject({ read: 3, unread: 0 });
  });

  it('claims the first message after a turn in private, and reports it to drift if unread', async () => {
    const p = await runParser();
    p.account.hear({ chat: DM, sender: OWNER, own: true, text: '/avventura', time: T0 });
    p.bot('Qualcosa di nuovo', { chat: DM });
    p.bot('Ancora altro', { chat: DM });
    expect(p.outcomes()).toEqual([
      { kind: 'unknown', bot: 'InventoryBot', text: 'Qualcosa di nuovo' },
    ]);
    expect(p.drift()).toMatchObject({ unread: 1 });
  });

  it('learns from what it reads, and is sure once it knows the item or the sentence', async () => {
    const p = await runParser();
    p.bot(`@lucia_b, possiedi:\n- una ghianda [C] x3\n- un sasso [C] x1`);
    p.bot(`@${OWNER}, ${S}una ghianda [C]!`);
    // The sentence is known now: an item never seen is sure too.
    p.bot(`@${OWNER}, ${S}un trifoglio di latta [N]!`);
    expect(p.outcomes().map((o) => [o['item'], o['sure']])).toEqual([
      ['una ghianda', true],
      ['un trifoglio di latta', true],
    ]);
  });

  it('starts from what its store kept, and takes a seed through its action', async () => {
    const kept = { items: ['un sasso'], prefixes: [] };
    const p = await runParser({ [KNOWLEDGE_DOC]: kept });
    // A known item: sure, and its sentence learned.
    p.bot(`@${OWNER}, ${S}un sasso [C]!`);
    const other = 'un vecchio pescatore ti saluta dal molo e ti lancia ';
    expect(await p.act('seed', { items: ['un sasso', 'una perla'], prefixes: [S, other] })).toEqual(
      { output: { items: 1, prefixes: 1 } }
    );
    expect(await p.act('seed', { items: 'un sasso' })).toMatchObject({ error: expect.any(String) });
    p.bot(`@${OWNER}, ${other}un dado di legno [C]!`);
    expect(p.outcomes().map((o) => [o['item'], o['sure']])).toEqual([
      ['un sasso', true],
      ['un dado di legno', true],
    ]);
  });

  it('publishes the private replies the player state reads, with the command they answer', async () => {
    const p = await runParser();
    p.owner('/inventario C');
    p.bot(`@${OWNER}, possiedi:\n- una ghianda [C] x3`, { chat: DM });
    // A title after the addressee; a refusal with its count, but not one without.
    p.owner('/inventario');
    p.bot(`@${OWNER} il fornaio, possiedi:\n- un sasso [C] x1`, { chat: DM });
    p.owner('/dai lucia_b 3 ghianda');
    p.bot('non ne hai abbastanza, ne possiedi solo 2.', { chat: DM });
    p.bot(`@${OWNER}, non hai niente del genere`, { chat: DM });
    // Not in the group, nor another sender's, nor a command too old.
    p.bot(`@${OWNER}, possiedi:\n- un sasso [C] x1`);
    p.account.hear({
      chat: DM,
      sender: 'lucia_b',
      time: p.kit.clock.now(),
      text: `@${OWNER}, possiedi:`,
    });
    p.owner('ciao');
    p.kit.runUntil(T0 + 3 * MIN);
    p.bot(`@${OWNER}, possiedi:\n- una perla [R] x1`, { chat: DM });
    expect(p.replies.map((e) => [e['query'], (e['reply'] as { type: string }).type])).toEqual([
      ['/inventario C', 'inventory'],
      ['/inventario', 'inventory'],
      ['/dai lucia_b 3 ghianda', 'miss'],
      [null, 'inventory'],
    ]);
    expect(p.replies[0]).toMatchObject({
      chat: DM,
      t: T0,
      reply: {
        type: 'inventory',
        filtered: true,
        items: [{ name: 'una ghianda', rarity: 'C', usable: false, qty: 3 }],
      },
    });
    expect(p.replies[2]?.['reply']).toMatchObject({ owned: 2 });
    expect(p.replies[0]?.['self']).toBe(OWNER);
  });

  it('marks a reply read from a message played back, as the turns are marked', async () => {
    const p = await runParser();
    p.owner('/inventario', { playback: true });
    p.bot(`@${OWNER}, possiedi:\n- un sasso [C] x1`, { chat: DM, playback: true });
    p.bot(`@${OWNER}, ${S}una perla [C]!`, { chat: DM, playback: true });
    p.owner('/inventario');
    p.bot(`@${OWNER}, possiedi:\n- un sasso [C] x2`, { chat: DM });
    expect(p.replies.map((e) => [e['query'], e['playback']])).toEqual([
      ['/inventario', true],
      ['/inventario', undefined],
    ]);
    expect(p.replies[1]).not.toHaveProperty('playback');
    expect(p.events.map((e) => e['playback'])).toEqual([true]);
  });

  it('runs on a saved graph as the instance runs it, on the node it had in game-bots', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventorybot-'));
    try {
      const graph = {
        version: 2,
        nodes: [
          { id: TELEGRAM_USER, plugin: TELEGRAM_USER },
          // A node saved while it named its commands: its config is ignored.
          { id: 'inventorybot', plugin: 'inventorybot', config: { commands: ['/avventura'] } },
        ],
        edges: [
          {
            from: `${TELEGRAM_USER}.chat`,
            to: 'inventorybot.chat',
            type: 'chat-in',
            reads: [DM],
            senders: [DM, 'me'],
          },
        ],
      };
      fs.writeFileSync(path.join(dir, 'graph.json'), JSON.stringify(graph));
      const account = new FakeConnector({ account: `telegram:${OWNER}` });
      const turns: unknown[] = [];
      const core = new Core({
        clock: new VirtualClock(T0),
        graphFile: new GraphFile(dir),
        record: (r) => {
          if (r.type === 'inventorybot.turn') turns.push(r['outcome']);
        },
      });
      core.register(fakeConnectorPlugin(TELEGRAM_USER, account), inventorybotPlugin);
      await core.start();
      expect(core.graphProblems()).toEqual([]);
      expect(core.status().every((s) => s.state === 'running')).toBe(true);
      account.open();
      account.hear({
        chat: DM,
        sender: 'InventoryBot',
        time: T0,
        text: `@${OWNER}, ${S}un sasso [C]!`,
      });
      expect(turns).toMatchObject([{ kind: 'gain', item: 'un sasso', sure: false }]);
      await core.stop();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
