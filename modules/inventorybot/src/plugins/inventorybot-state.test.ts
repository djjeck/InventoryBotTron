import { parseManifest } from '@megabottron1999/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DM, MIN, OWNER, T0 } from '#test/run.ts';
import { bootState } from '#test/state-run.ts';
import { inventorybotStatePlugin, plugins } from './inventorybot-state.ts';

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
    expect(m.inputs).toMatchObject({ events: { type: 'events', namespace: 'inventorybot' } });
    expect(Object.keys(m.events ?? {})).toEqual([
      'inventorybot-state.changed',
      'inventorybot-state.gained',
    ]);
    expect(Object.keys(m.interface.state ?? {})).toEqual(['get', 'freshness', 'count', 'held']);
    expect(m.config?.parse({})).toEqual({ pin: ['inventory.held', 'drops.latest'] });
    const run = await bootState(dir);
    expect(run.core.graphProblems()).toEqual([]);
    expect(run.core.status().every((s) => s.state === 'running')).toBe(true);
    await run.core.stop();
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
    expect(run.read('get', { path: 'drops.pending' })).toMatchObject([
      { raw: `${S2}${STECCO}`, guess: 'un ghiacciolo', rarity: 'N' },
    ]);
    expect(run.read('get', { path: 'owner.player' })).toBe(OWNER);
    expect(run.read('freshness', { section: 'inventory' })).toEqual({
      snapshot: { t: T0, event: 'inventorybot.inventory' },
      deltas: 2,
      uncertain: 1,
      updated: { t: T0 + 2 * MIN, event: 'inventorybot.turn' },
    });
    // The owner's latest event moves with each; a known item is not seen anew.
    expect(run.of('inventorybot-state.changed').map((c) => c['refreshed'])).toEqual([
      ['owner', 'inventory', 'items'],
      ['owner', 'inventory', 'drops'],
      ['owner', 'inventory', 'drops'],
    ]);
    // A whole listing is a snapshot, its deltas from zero again; it teaches the guessed item too.
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
    expect(run.read('get', { path: 'drops.pending' })).toEqual([]);
    await run.core.stop();
  });

  it('resolves a pending drop once a later event teaches its item', async () => {
    const run = await bootState(dir);
    await run.owner('/inventario');
    await run.bot(`@${OWNER}, possiedi:\n- un sasso [C] x1`);
    await run.bot(`@${OWNER}, ${S2}${STECCO} [N]!`);
    expect(held(run)).toEqual({ 'un sasso': 1, 'un ghiacciolo': 1 });
    // A sure drop of the same sentence teaches it: the guess moves to its item, in the reducer.
    run.clock.advance(20 * MIN);
    await run.bot(`@${OWNER}, ${S2}un sasso [C]!`);
    expect(held(run)).toEqual({ 'un sasso': 2, [STECCO]: 1 });
    expect(run.read('get', { path: 'drops.pending' })).toEqual([]);
    // Announced with the event that resolved it, as every live change is.
    expect(run.of('inventorybot-state.changed').at(-1)).toMatchObject({
      sections: ['owner', 'inventory', 'items', 'drops'],
      event: { type: 'inventorybot.turn', t: T0 + 20 * MIN },
    });
    expect(run.read('get', { path: 'drops.latest' })).toMatchObject([
      { item: STECCO, sure: true },
      { item: 'un sasso', sure: true },
    ]);
    expect(run.read('get', { path: `items.${STECCO}` })).toEqual({
      first_seen: '2026-11-06T12:00:00+00:00',
    });
    await run.core.stop();
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
    await again.core.stop();
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
      [[['owner', 'inventory', 'items', 'drops'], undefined]]
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
});
