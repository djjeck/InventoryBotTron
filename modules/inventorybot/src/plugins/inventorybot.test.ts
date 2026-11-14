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
import { type z } from 'zod';
import { KNOWLEDGE_DOC } from '#src/knowledge.ts';
import { REPLY_KINDS, replyEvent } from '#src/replies.ts';
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
    expect(Object.keys(m.events ?? {})).toEqual([
      'inventorybot.turn',
      ...REPLY_KINDS.map(replyEvent),
      'inventorybot.resolved',
    ]);
    // Each kind with its own schema, described for the editor.
    expect(m.events?.['inventorybot.craft']?.description).toBe(
      'A recipe made: the ingredients spent and the item made'
    );
    expect(Object.keys(m.interface.state ?? {})).toEqual(['rest', 'lastTurn']);
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

  it('publishes each private reply as its kind, with the command it answers', async () => {
    const p = await runParser();
    p.owner('/inventario C');
    p.bot(`@${OWNER}, possiedi:\n- una ghianda [C] x3`, { chat: DM });
    // A title after the addressee; a refusal with its count, but not one without.
    p.owner('/inventario');
    p.bot(`@${OWNER} il fornaio, possiedi:\n- un sasso [C] x1`, { chat: DM });
    p.owner('/dai lucia_b 3 ghianda');
    p.bot('non ne hai abbastanza, ne possiedi solo 2.', { chat: DM });
    p.owner('/mostra corda');
    p.bot(`@${OWNER}, non hai niente del genere`, { chat: DM });
    p.owner('/usa perla');
    p.bot('una perla deve raffreddarsi ancora per 2 minuti prima di poterla usare', { chat: DM });
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
    expect(p.replies.map((e) => [e['query'], e.type])).toEqual([
      ['/inventario C', 'inventorybot.inventory'],
      ['/inventario', 'inventorybot.inventory'],
      ['/dai lucia_b 3 ghianda', 'inventorybot.miss'],
      ['/mostra corda', 'inventorybot.miss'],
      ['/usa perla', 'inventorybot.itemCooldown'],
      [null, 'inventorybot.inventory'],
    ]);
    // The context, then the grammar's fields, flat.
    expect(p.replies[0]).toEqual({
      type: 'inventorybot.inventory',
      t: T0,
      instance: 'inventorybot',
      chat: DM,
      query: '/inventario C',
      self: OWNER,
      filtered: true,
      truncated: false,
      items: [{ name: 'una ghianda', rarity: 'C', usable: false, qty: 3 }],
    });
    expect(p.replies[2]).toMatchObject({ reply: 'dai_not_enough', owned: 2 });
    expect(p.replies[4]).toMatchObject({ item: 'una perla', action: 'use', remaining: 120 });
    // Every one as its kind's schema says, no field more nor fewer.
    const schemas = parseManifest(inventorybotPlugin.manifest).events ?? {};
    for (const e of p.replies) {
      const { type, t: _, instance: __, ...payload } = e;
      expect((schemas[type] as z.ZodObject).strict().safeParse(payload).success, type).toBe(true);
    }
  });

  it('reads the /esporta file its message carries, and logs one that came without its text', async () => {
    const p = await runParser();
    const caption = `Inventario di @${OWNER}, al 2026/11/06 12:00:00`;
    const document = { name: 'file.txt', mime: 'text/plain', size: 30 };
    p.owner('/esporta');
    p.bot(caption, { chat: DM, document: { ...document, skipped: 'size' } });
    p.bot(caption, { chat: DM, document: { ...document, text: '2x\tuna perla\t[C]\r\n' } });
    p.bot(caption, { chat: DM });
    expect(p.replies.map(({ type, chat, query, ...fields }) => [type, query, fields])).toEqual([
      [
        'inventorybot.inventory',
        '/esporta',
        expect.objectContaining({
          filtered: false,
          truncated: false,
          exported: true,
          items: [{ name: 'una perla', rarity: 'C', usable: false, qty: 2 }],
        }),
      ],
    ]);
    expect(p.lines.filter((l) => l.includes('without its text'))).toEqual([
      expect.stringContaining('file.txt, text/plain, 30 bytes) came without its text (size)'),
    ]);
    // What the file listed is known: a drop that ends with it is sure.
    p.bot(`@${OWNER}, ${S}una perla [C]!`, { chat: DM });
    expect(p.outcomes()).toMatchObject([{ item: 'una perla', sure: true }]);
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

  it("resolves the owner's guesses by what it learns since, from any message it reads", async () => {
    const p = await runParser();
    const S2 = 'sotto il ponte del canale trovi ';
    const STECCO = 'lo stecco di legno di un ghiacciolo';
    p.bot(`@${OWNER}, ${S2}${STECCO} [N] [usabile]!`, { chat: DM });
    // Another player's guess is not the owner's: never resolved for them.
    p.bot(`@lucia_b, ${S}una corda di canapa [C]!`);
    p.kit.runUntil(T0 + MIN);
    // Another player's listing in the group, played back, names the item.
    p.bot(`@lucia_b, possiedi:\n- ${STECCO} [N] x1\n- una corda di canapa [C] x1`, {
      playback: true,
    });
    const resolved = p.replies.filter((e) => e.type === 'inventorybot.resolved');
    expect(resolved).toEqual([
      {
        type: 'inventorybot.resolved',
        t: T0 + MIN,
        instance: 'inventorybot',
        chat: DM,
        guess: 'un ghiacciolo',
        item: STECCO,
        raw: `${S2}${STECCO}`,
        rarity: 'N',
        tags: ['usabile'],
        date: T0,
        playback: true,
      },
    ]);
    // Settled once: nothing more to tell, and the sentence learned from it.
    p.bot(`@${OWNER}, ${S2}un sasso [C]!`, { chat: DM });
    expect(p.replies.filter((e) => e.type === 'inventorybot.resolved')).toHaveLength(1);
    expect(p.outcomes().at(-1)).toMatchObject({ item: 'un sasso', sure: true });
  });

  it('resolves a guess by a seed, and forgets those a whole inventory counted', async () => {
    const p = await runParser();
    const raw = 'un vecchio pescatore ti saluta dal molo e ti lancia una perla';
    p.bot(`@${OWNER}, ${raw} [C]!`, { chat: DM });
    p.kit.runUntil(T0 + MIN);
    expect(await p.act('seed', { items: ['una perla'], prefixes: [] })).toEqual({
      output: { items: 1, prefixes: 0 },
    });
    expect(p.replies.filter((e) => e.type === 'inventorybot.resolved')).toMatchObject([
      { t: T0 + MIN, guess: 'una perla', item: 'una perla', date: T0 },
    ]);
    // Two guesses; a filtered listing forgets neither, a whole one both, unresolved.
    const told = () => p.replies.filter((e) => e.type === 'inventorybot.resolved').length;
    const x = 'mentre conti le nuvole dal tetto del forno ti cade in mano ';
    const y = 'sotto il ponte del canale trovi ';
    p.bot(`@${OWNER}, ${x}lo stecco di legno di un ghiacciolo [R]!`, { chat: DM });
    p.bot(`@${OWNER}, ${y}una spada di legno, piccola ma robusta [R]!`, { chat: DM });
    p.owner('/inventario C');
    p.bot(`@${OWNER}, possiedi:\n- una perla [C] x1`, { chat: DM });
    p.bot(`@lucia_b, ${x}una perla [C]!`);
    expect(told()).toBe(2);
    p.owner('/inventario');
    p.bot(`@${OWNER}, possiedi:\n- una perla [C] x1`, { chat: DM });
    p.bot(`@lucia_b, ${y}una perla [C]!`);
    expect(told()).toBe(2);
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
