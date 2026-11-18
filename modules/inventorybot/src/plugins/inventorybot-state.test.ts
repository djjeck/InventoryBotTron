import { parseManifest } from '@megabottron1999/core';
import { STATE_DOC } from '@megabottron1999/turns/state-plugin.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DM, MIN, OWNER, T0 } from '#test/run.ts';
import { bootState } from '#test/state-run.ts';
import { inventorybotStatePlugin, MIGRATIONS, plugins } from './inventorybot-state.ts';

// Invented sentences (CLAUDE.md, "Game content"), with items of scripts/universe.md.
const S = 'mentre conti le nuvole dal tetto del mulino ti cade in mano ';
const S2 = 'sotto il ponte del canale trovi ';
const STECCO = 'lo stecco di legno di un ghiacciolo';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventorybot-state-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const held = (run: { read: (n: string) => unknown }) => run.read('held') as Record<string, number>;

describe('the inventorybot-state node', () => {
  it('is a state on the parser’s events, its pins the owner’s first look', async () => {
    expect(plugins).toEqual([inventorybotStatePlugin]);
    const m = parseManifest(inventorybotStatePlugin.manifest);
    expect(m.id).toBe('inventorybot-state');
    expect(m.kinds).toEqual(['stats']);
    expect(m.inputs).toMatchObject({
      events: { type: 'events', namespace: 'inventorybot' },
      // The parser a shell player's sends are handed to (MegaBotTron1999's D141).
      parser: { type: 'interface', members: ['actions.sent'], bind: { node: 'inventorybot' } },
    });
    expect(Object.keys(m.events ?? {})).toEqual([
      'inventorybot-state.changed',
      'inventorybot-state.gained',
    ]);
    expect(Object.keys(m.interface.state ?? {})).toEqual([
      'get',
      'freshness',
      'count',
      'held',
      // The owner's readiness, for a shell player (D141).
      'ready',
      'commands',
      'bot',
    ]);
    expect(Object.keys(m.interface.actions ?? {})).toEqual(['sent']);
    // The turn alone, with no mechanics: its hold is the bot's rest.
    expect(m.botUsername).toBe('InventoryBot');
    expect(m.botCommands).toEqual([{ command: '/avventura', turn: true }]);
    expect(m.config?.parse({})).toEqual({ pin: ['inventory.held', 'drops.latest'] });
    const run = await bootState(dir);
    expect(run.core.graphProblems()).toEqual([]);
    expect(run.core.status().every((s) => s.state === 'running')).toBe(true);
    await run.core.stop();
  });

  it('counts an item named like an object’s own property as none held, not as its value', async () => {
    const run = await bootState(dir);
    await run.owner('/inventario');
    await run.bot(`@${OWNER}, possiedi:\n- un sasso [C] x2`);
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
      expect(run.read('count', { name })).toBe(0);
    expect(run.read('count', { name: 'un sasso' })).toBe(2);
  });

  it('applies listings and drops, a whole listing a snapshot and a guess uncertain', async () => {
    const run = await bootState(dir);
    await run.owner('/inventario');
    await run.bot(`@${OWNER}, possiedi:\n- un sasso [C] x2\n- una perla [R] [usabile] x1`);
    run.clock.advance(MIN);
    // A known item: sure. Its sentence is known from now on.
    await run.bot(`@${OWNER}, ${S}un sasso [C]!`);
    run.clock.advance(MIN);
    // Neither the item nor the sentence: a guess, cut at its last article.
    await run.bot(`@${OWNER}, ${S2}${STECCO} [N]!`);
    expect(held(run)).toEqual({ 'un sasso': 3, 'una perla': 1, 'un ghiacciolo': 1 });
    expect(run.read('count', { name: 'un sasso' })).toBe(3);
    expect(run.read('get', { path: 'inventory.items.una perla' })).toMatchObject({
      qty: 1,
      exact: true,
      via: 'inventario',
      rarity: 'R',
      tags: ['usabile'],
    });
    // The guess is the parser's to resolve: the state keeps no pending drops.
    expect(run.read('get', { path: 'drops' })).toEqual({
      latest: [
        expect.objectContaining({ item: 'un sasso', sure: true }),
        expect.objectContaining({ item: 'un ghiacciolo', sure: false }),
      ],
    });
    expect(run.read('get', { path: 'owner.player' })).toBe(OWNER);
    expect(run.read('freshness', { section: 'inventory' })).toEqual({
      snapshot: { t: T0, event: 'inventorybot.inventory' },
      deltas: 2,
      uncertain: 1,
      updated: { t: T0 + 2 * MIN, event: 'inventorybot.turn' },
    });
    // The owner's latest event moves with each; a known item is not seen anew.
    // The drops' rest moves the readiness too.
    expect(run.of('inventorybot-state.changed').map((c) => c['refreshed'])).toEqual([
      ['owner', 'inventory', 'items'],
      ['owner', 'inventory', 'drops', 'readiness'],
      ['owner', 'inventory', 'drops', 'readiness'],
    ]);
    // A whole listing is a snapshot, its deltas from zero again; it teaches the parser the guessed
    // item too, which tells it first.
    run.clock.advance(MIN);
    await run.owner('/i');
    await run.bot(
      `@${OWNER}, possiedi:\n- un sasso [C] x3\n- una perla [R] [usabile] x1\n- ${STECCO} [N] x1`
    );
    expect(run.read('freshness', { section: 'inventory' })).toMatchObject({
      snapshot: { t: T0 + 3 * MIN },
      deltas: 0,
      uncertain: 0,
    });
    expect(held(run)).toEqual({ 'un sasso': 3, 'una perla': 1, [STECCO]: 1 });
    expect(run.of('inventorybot.resolved').map((r) => [r['guess'], r['item'], r.t])).toEqual([
      ['un ghiacciolo', STECCO, T0 + 3 * MIN],
    ]);
    await run.core.stop();
  });

  it('moves a guess the parser resolves to its item, and tells no gain of it', async () => {
    const run = await bootState(dir);
    await run.owner('/inventario');
    await run.bot(`@${OWNER}, possiedi:\n- un sasso [C] x1`);
    await run.bot(`@${OWNER}, ${S2}${STECCO} [N] [usabile]!`);
    expect(held(run)).toEqual({ 'un sasso': 1, 'un ghiacciolo': 1 });
    // A sure drop of the sentence teaches it: the parser resolves the guess, after the drop's turn.
    run.clock.advance(20 * MIN);
    await run.bot(`@${OWNER}, ${S2}un sasso [C]!`);
    expect(held(run)).toEqual({ 'un sasso': 2, [STECCO]: 1 });
    expect(run.of('inventorybot.resolved')).toMatchObject([
      {
        t: T0 + 20 * MIN,
        chat: DM,
        guess: 'un ghiacciolo',
        item: STECCO,
        raw: `${S2}${STECCO}`,
        rarity: 'N',
        tags: ['usabile'],
        date: T0,
      },
    ]);
    // Applied as a change of the state; told as nothing else: no gain, no event of its own.
    expect(run.of('inventorybot-state.changed').at(-1)).toMatchObject({
      sections: ['inventory', 'items', 'drops'],
      event: { type: 'inventorybot.resolved', t: T0 + 20 * MIN },
    });
    expect(run.of('inventorybot-state.gained').map((g) => [g['item'], g['sure']])).toEqual([
      ['un ghiacciolo', false],
      ['un sasso', true],
    ]);
    expect(run.read('get', { path: 'drops.latest' })).toMatchObject([
      { item: STECCO, sure: true },
      { item: 'un sasso', sure: true },
    ]);
    expect(run.read('get', { path: `items.${STECCO}` })).toEqual({
      first_seen: '2026-11-06T12:00:00+00:00',
    });
    expect(run.read('get', { path: `inventory.items.${STECCO}` })).toMatchObject({
      rarity: 'N',
      tags: ['usabile'],
    });
    await run.core.stop();
  });

  it('never resolves a guess after a whole inventory, which counted it (issue #1)', async () => {
    const run = await bootState(dir);
    await run.bot(`@${OWNER}, ${S2}${STECCO} [N]!`);
    // By the export the item is gone: it lists neither it nor the guess.
    run.clock.advance(MIN);
    await run.owner('/esporta');
    await run.bot(`Inventario di @${OWNER}, al 2026/11/06 12:01:00`, {
      document: { name: 'file.txt', mime: 'text/plain', size: 20, text: '2x\tun sasso\t[C]\r\n' },
    });
    expect(held(run)).toEqual({ 'un sasso': 2 });
    // A gift of the item, then a sure drop of the sentence: the drop is not counted again.
    run.clock.advance(MIN);
    await run.bot(`[N] @lucia_b ti ha dato 1x ${STECCO}`);
    await run.bot(`@${OWNER}, ${S2}un sasso [C]!`);
    expect(held(run)).toEqual({ 'un sasso': 3, [STECCO]: 1 });
    expect(run.of('inventorybot.resolved')).toEqual([]);
    await run.core.stop();
  });

  it('takes the pending drops out of a state kept before 0.7.0', async () => {
    const first = await bootState(dir);
    await first.bot(`@${OWNER}, ${S}un sasso [C]!`);
    await first.core.stop();
    const file = path.join(dir, 'data', 'instances', 'inventorybot-state', 'state.json');
    const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
    kept.state.drops.pending = [{ raw: 'x', guess: 'x', rarity: 'C', tags: [], date: null }];
    fs.writeFileSync(file, JSON.stringify(kept));
    fs.rmSync(path.join(dir, 'data', 'instances', 'inventorybot-state', '_meta.json'), {
      force: true,
    });
    const second = await bootState(dir, { at: T0 + MIN });
    expect(second.read('get', { path: 'drops' })).toEqual({
      latest: [expect.objectContaining({ item: 'un sasso' })],
    });
    await second.core.stop();
  });

  it('tells each item gained live, and nothing of history', async () => {
    const run = await bootState(dir);
    await run.owner('/inventario');
    await run.bot(`@${OWNER}, possiedi:\n- un sasso [C] x2`);
    // A drop of a known item, a guess, and a gift.
    await run.bot(`@${OWNER}, ${S}un sasso [C]!`);
    run.clock.advance(MIN);
    await run.bot(`@${OWNER}, ${S2}${STECCO} [N]!`);
    await run.bot('[N] @lucia_b ti ha dato 2x una perla');
    // Not a gain: a /mostra, though it raises the estimate.
    await run.owner('/mostra perla');
    await run.bot(`@${OWNER}, mostri orgogliosamente di possedere 3x una perla [R]`);
    // Played back: applied, told to nobody.
    await run.bot('[N] @lucia_b ti ha dato 1x una conchiglia', { playback: true });
    const gained = run.of('inventorybot-state.gained');
    expect(gained.map((g) => [g['item'], g['sure'], g['qty'], g['exact']])).toEqual([
      ['un sasso', true, 3, true],
      ['un ghiacciolo', false, 1, false],
      ['una perla', true, 2, false],
    ]);
    expect(gained.map((g) => g.t)).toEqual([T0, T0 + MIN, T0 + MIN]);
    expect(held(run)).toMatchObject({ 'una perla': 3, 'una conchiglia': 1 });
    await run.core.stop();
    // The catch-up at start applies what it missed and tells nothing of it.
    run.log.write({
      type: 'inventorybot.turn',
      t: T0 + 2 * MIN,
      instance: 'inventorybot',
      chat: DM,
      outcome: {
        kind: 'gain',
        bot: 'InventoryBot',
        item: 'un sasso',
        rarity: 'C',
        tags: [],
        sure: true,
      },
    });
    const again = await bootState(dir, { at: T0 + 10 * MIN });
    expect(held(again)).toMatchObject({ 'un sasso': 4 });
    expect(again.of('inventorybot-state.gained')).toEqual([]);
    // Nor counts it in the owner's summary.
    expect(again.core.summary({ since: T0, until: T0 + 11 * MIN })).toEqual([]);
    await again.core.stop();
  });

  it('adds what it told gained to the owner’s summary, and nothing when it told nothing', async () => {
    const run = await bootState(dir);
    const lines = (since: number, until: number) =>
      run.core.summary({ since, until }).find((x) => x.node === 'inventorybot-state')?.lines;
    await run.owner('/inventario');
    await run.bot(`@${OWNER}, possiedi:\n- un sasso [C] x2`);
    // Applied, but nothing gained: the state plugin's line alone.
    expect(lines(T0, T0 + 1)).toEqual(['1 event applied']);
    run.clock.advance(MIN);
    // A known item (3 now), a guess (new) and a gift (new); a played back gift, told to nobody.
    await run.bot(`@${OWNER}, ${S}un sasso [C]!`);
    await run.bot(`@${OWNER}, ${S2}${STECCO} [N]!`);
    await run.bot('[N] @lucia_b ti ha dato 1x una perla');
    await run.bot('[N] @lucia_b ti ha dato 1x una conchiglia', { playback: true });
    expect(lines(T0 + MIN, T0 + 2 * MIN)).toEqual(['4 events applied', '3 items gained, 2 new']);
    run.clock.advance(MIN);
    // None new: their count left out.
    await run.bot(`@${OWNER}, ${S}un sasso [C]!`);
    expect(lines(T0 + 2 * MIN, T0 + 3 * MIN)).toEqual(['1 event applied', '1 item gained']);
    expect(lines(T0, T0 + 3 * MIN)).toEqual(['6 events applied', '4 items gained, 2 new']);
    // A window where nothing happened: no section, so no summary.
    expect(run.core.summary({ since: T0 + 3 * MIN, until: T0 + 4 * MIN })).toEqual([]);
    await run.core.stop();
  });

  it('resumes from its cursor after a restart, each event applied once', async () => {
    const first = await bootState(dir);
    await first.owner('/inventario');
    await first.bot(`@${OWNER}, possiedi:\n- un sasso [C] x1`);
    await first.core.stop();
    // While it is down, the parser's records go on (published by another start, or late).
    const gain = (t: number, item: string) => ({
      type: 'inventorybot.turn',
      t,
      instance: 'inventorybot',
      chat: DM,
      outcome: { kind: 'gain', bot: 'InventoryBot', item, rarity: 'C', tags: [], sure: true },
    });
    first.log.write(gain(T0 + MIN, 'una perla'));
    first.log.write(gain(T0 + 2 * MIN, 'un sasso'));

    const second = await bootState(dir, { at: T0 + 10 * MIN });
    expect(held(second)).toEqual({ 'un sasso': 2, 'una perla': 1 });
    // The catch-up announced once, its sections summed.
    expect(second.of('inventorybot-state.changed').map((c) => [c['sections'], c['event']])).toEqual(
      [[['owner', 'inventory', 'items', 'drops', 'readiness'], undefined]]
    );
    // Live again at once.
    await second.bot(`@${OWNER}, ${S}un sasso [C]!`);
    expect(held(second)).toEqual({ 'un sasso': 3, 'una perla': 1 });
    await second.core.stop();

    const third = await bootState(dir, { at: T0 + 20 * MIN });
    expect(held(third)).toEqual({ 'un sasso': 3, 'una perla': 1 });
    expect(third.of('inventorybot-state.changed')).toEqual([]);
    await third.core.stop();
  });

  it('refuses an event its reducer cannot apply, records it, and passes it', async () => {
    const first = await bootState(dir);
    await first.core.stop();
    // An inventory without its items.
    first.log.write({
      type: 'inventorybot.inventory',
      t: T0 + MIN,
      instance: 'inventorybot',
      chat: DM,
      query: null,
    });
    first.log.write({
      type: 'inventorybot.turn',
      t: T0 + 2 * MIN,
      instance: 'inventorybot',
      chat: DM,
      outcome: {
        kind: 'gain',
        bot: 'InventoryBot',
        item: 'una perla',
        rarity: 'C',
        tags: [],
        sure: true,
      },
    });
    const second = await bootState(dir, { at: T0 + 5 * MIN });
    expect(second.of('inventorybot-state.refused')).toMatchObject([
      { event: 'inventorybot.inventory', at: T0 + MIN, reason: expect.any(String) },
    ]);
    expect(held(second)).toEqual({ 'una perla': 1 });
    await second.core.stop();
    // Passed: never applied again.
    const third = await bootState(dir, { at: T0 + 10 * MIN });
    expect(third.of('inventorybot-state.refused')).toEqual([]);
    await third.core.stop();
  });

  it("holds /avventura through the bot's rest, as the parser's turns state it", async () => {
    const run = await bootState(dir);
    const ready = () =>
      (run.read('ready') as Record<string, { ready: boolean; until?: number; why?: string }>)[
        '/avventura'
      ];
    expect(run.read('bot')).toBe('InventoryBot');
    expect(run.read('commands')).toEqual([{ command: '/avventura', turn: true }]);
    // Nothing known: ready.
    expect(ready()).toEqual({ ready: true });
    // The owner's turn, by hand, and its drop: held for the bot's 15 minutes' rest.
    await run.owner('/avventura');
    await run.bot(`@${OWNER}, ${S}un sasso [C]!`);
    expect(ready()).toMatchObject({
      ready: false,
      until: T0 + 15 * MIN,
      why: 'its rest after a turn',
    });
    expect(run.read('get', { path: 'readiness.commands./avventura.sent' })).toEqual({
      t: T0,
      byHand: true,
    });
    run.clock.advance(5 * MIN);
    expect(ready()).toMatchObject({ ready: false, until: T0 + 15 * MIN });
    // Too soon: held for the wait it states, from its own time, when it ends later.
    await run.owner('/avventura');
    await run.bot(
      'Troppo presto, devi riposare ancora per 11 minuti prima di poterti avventurare di nuovo.'
    );
    expect(ready()).toMatchObject({ ready: false, until: T0 + 16 * MIN, why: 'it said too soon' });
    // Its rest over: ready again, since its end.
    run.clock.advance(11 * MIN);
    expect(ready()).toMatchObject({ ready: true, since: T0 + 16 * MIN });
    // A player's send, handed on through the state, reaches the parser, which pairs its answer.
    expect(
      await run.core.controls.act('inventorybot-state', 'sent', { chat: DM, t: run.clock.now() })
    ).toEqual({ output: undefined });
    await run.settle();
    expect(run.of('inventorybot.sent').at(-1)).toMatchObject({
      command: '/avventura',
      byHand: false,
    });
    await run.core.stop();
  });

  it('adds the readiness to a state kept before it, nothing known yet', () => {
    const docs = new Map<string, unknown>([
      [STATE_DOC, { state: { owner: { player: null } }, cursor: {} }],
    ]);
    const store = {
      read: <T>(name: string) => docs.get(name) as T | undefined,
      write: (name: string, value: unknown) => void docs.set(name, value),
    };
    const add = MIGRATIONS[1] as (s: typeof store) => void;
    add(store);
    expect(docs.get(STATE_DOC)).toEqual({
      state: { owner: { player: null }, readiness: { commands: {}, holds: {} } },
      cursor: {},
    });
    // Once added, and with no state kept, nothing changes.
    const kept = docs.get(STATE_DOC);
    add(store);
    expect(docs.get(STATE_DOC)).toBe(kept);
    docs.clear();
    add(store);
    expect(docs.size).toBe(0);
  });
});
