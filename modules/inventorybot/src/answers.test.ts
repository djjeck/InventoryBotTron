import { type CommandAnswer, parseManifest, readAnswer } from '@megabottron1999/core';
import { describe, expect, it } from 'vitest';
import { DM, MIN, OWNER, runParser, SENDER, T0 } from '#test/run.ts';
import { ANSWERS, BOT_COMMANDS, MISS_ANSWERS } from './answers.ts';
import { inventorybotPlugin } from './plugins/inventorybot.ts';
import { replyEvent } from './replies.ts';

// Invented sentences and the items of scripts/universe.md (CLAUDE.md, "Game content"); the bot's
// fixed replies as it writes them.
const ACCOUNT = `telegram:${OWNER}`;
const flush = () => new Promise((r) => setImmediate(r));

/** The parser in the dev kit, and a command sent through the account's outbox, as a script does. */
async function run() {
  const p = await runParser(undefined, { sender: true });
  const out = p.kit.core.outbox(ACCOUNT).as(SENDER);
  /** Sends `command` to the bot, the bot answers `reply`: the command's answer. */
  const ask = async (command: string, reply: string): Promise<CommandAnswer | undefined> => {
    const q = out.enqueue(DM, command);
    // Past the account's pacing, the send goes.
    for (let i = 0; i < 60 && q.status() !== 'sent'; i++) {
      p.kit.clock.advance(1000);
      await flush();
    }
    p.bot(reply, { chat: DM });
    await flush();
    // A reply that answers nothing leaves it unanswered, past its window.
    p.kit.clock.advance(2 * MIN);
    const r = await q;
    return 'answer' in r ? (r.answer as CommandAnswer) : undefined;
  };
  return { ...p, out, ask };
}

describe("the parser's command answers", () => {
  it('are declared in its manifest, after the turn parser’s, each on an event of its own', () => {
    const m = parseManifest(inventorybotPlugin.manifest);
    expect(m.answers.slice(0, 2).map((a) => [a.event, a.status])).toEqual([
      ['inventorybot.turn', 'refused'],
      ['inventorybot.turn', 'ok'],
    ]);
    expect(m.answers.slice(2)).toHaveLength(ANSWERS.length);
    for (const a of m.answers) expect(Object.keys(m.events ?? {})).toContain(a.event);
    // A fixed reply that answers any command answers each of the bot's.
    expect(MISS_ANSWERS['error']?.[0]).toBe(BOT_COMMANDS);
    expect(BOT_COMMANDS).toEqual(expect.arrayContaining(['/avventura', '/esporta', '/usa']));
  });

  it('read a reply by its first matching declaration', () => {
    const m = parseManifest(inventorybotPlugin.manifest);
    const read = (kind: Parameters<typeof replyEvent>[0], payload: Record<string, unknown>) =>
      readAnswer(m.answers, replyEvent(kind), payload, T0);
    expect(read('use', { failed: true })?.answer).toMatchObject({
      status: 'refused',
      reason: 'missing',
    });
    expect(read('use', { failed: false })?.answer).toMatchObject({ status: 'ok' });
    expect(read('recipe_detail', { examined: true })).toMatchObject({
      commands: ['/esamina'],
      answer: { status: 'ok' },
    });
    expect(read('recipe_detail', { examined: false })).toMatchObject({
      commands: ['/ricetta'],
      answer: { status: 'refused', reason: 'missing' },
    });
    // A cooldown's time is the item's, not the command's: told, but holding no command.
    const cool = read('item_cooldown', { retryAt: T0 + MIN });
    expect(cool?.answer).toMatchObject({ status: 'refused', reason: 'cooldown' });
    expect(cool?.answer).not.toHaveProperty('retryAt');
    // A fixed reply that answers no command of the owner's, or a gift, is no answer.
    expect(read('miss', { reply: 'lottery_open' })).toBeUndefined();
    expect(read('gift', {})).toBeUndefined();
    expect(read('travel_requirement', {})).toBeUndefined();
  });

  it("settle a command sent through the outbox with the bot's reply", async () => {
    const p = await run();
    expect(
      await p.ask(
        '/esamina perla',
        `@${OWNER} una perla [C] al momento non ti serve in nessuna ricetta.\nNe hai 2.`
      )
    ).toMatchObject({ status: 'ok', event: { type: 'inventorybot.itemInfo', item: 'una perla' } });
    expect(
      await p.ask('/esamina corda', `@${OWNER}, non hai oggetti o ricette con quel nome`)
    ).toMatchObject({
      status: 'refused',
      reason: 'missing',
      event: { reply: 'examine_not_found' },
    });
    expect(
      await p.ask('/dai lucia_b 3 sasso', 'non ne hai abbastanza, ne possiedi solo 2.')
    ).toMatchObject({
      status: 'refused',
      reason: 'missing',
      event: { owned: 2 },
    });
    expect(
      await p.ask('/dai lucia_b sasso', `@${OWNER}, dai 1x un sasso a @lucia_b`)
    ).toMatchObject({
      status: 'ok',
      event: { type: 'inventorybot.give' },
    });
    expect(await p.ask('/mostra', 'troppi oggetti trovati con quel nome()')).toMatchObject({
      status: 'refused',
      reason: 'ambiguous',
    });
    expect(
      await p.ask('/viaggio', `@${OWNER}, non vedi nessun luogo con quel nome, qui`)
    ).toMatchObject({ status: 'refused', reason: 'not_found' });
    expect(await p.ask('/inventario', `@${OWNER}, possiedi:\n- una perla [C] x2`)).toMatchObject({
      status: 'ok',
      event: { type: 'inventorybot.inventory' },
    });
    // Any command: the captcha restricts the account.
    expect(
      await p.ask('/avventura', 'Per favore risolvi il captcha per continuare.')
    ).toMatchObject({ status: 'refused', reason: 'restricted' });
    await p.kit.stop();
  });

  it("tell a recipe's detail to an /esamina from one refusing a /ricetta", async () => {
    const p = await run();
    const lines =
      "- un ciuffo di morbide setole di tasso [R] x1\nMentre hai gia':\n- lo stecco di legno di un ghiacciolo [C] x1";
    expect(
      await p.ask('/ricetta pennello', `@${OWNER}, per fare Pennello rustico ti manca:\n${lines}`)
    ).toMatchObject({ status: 'refused', reason: 'missing', event: { examined: false } });
    expect(
      await p.ask(
        '/esamina pennello',
        `@${OWNER}, per fare la ricetta Pennello rustico ti manca:\n${lines}`
      )
    ).toMatchObject({ status: 'ok', event: { examined: true } });
    await p.kit.stop();
  });

  it("refuse a /usa on an item's cooldown with its end, and hold no command back", async () => {
    const p = await run();
    /** How long after the reply its retryAt is, in minutes. */
    const wait = (a: CommandAnswer | undefined) =>
      ((a?.event?.['retryAt'] as number) - (a?.event?.t ?? 0)) / MIN;
    const cool = await p.ask(
      '/usa perla',
      `@${OWNER}, una perla deve raffreddarsi ancora per 4 ore e 6 minuti prima di poterla usare di nuovo.`
    );
    expect(cool).toMatchObject({ status: 'refused', reason: 'cooldown' });
    // The wait stated, plus its smallest unit (a minute), since the bot truncates it.
    expect(wait(cool)).toBe(4 * 60 + 7);
    expect(cool).not.toHaveProperty('retryAt');
    expect(p.out.held(DM, '/usa')).toBeUndefined();
    const stunned = await p.ask(
      '/usa sasso',
      `@${OWNER}, il pakkomon del tuo avversario e' ancora rintronato per 2 minuti.`
    );
    expect(stunned).toMatchObject({
      status: 'refused',
      reason: 'cooldown',
      event: { pakkomon: null },
    });
    expect(wait(stunned)).toBe(2);
    await p.kit.stop();
  });

  it('answer a /usa that failed for what it lacks as refused', async () => {
    const p = await run();
    const wrongKey = `@${OWNER}, non hai la chiave giusta per aprire questo baule..`;
    // Sent through the outbox, the parser does not know the command: a fixed reply.
    expect(await p.ask('/usa chiave', wrongKey)).toMatchObject({
      status: 'refused',
      reason: 'missing',
      event: { type: 'inventorybot.miss', reply: 'use_wrong_key' },
    });
    // By hand, it knows the command, and reads the reply as a use that failed.
    p.owner('/usa chiave');
    p.bot(wrongKey, { chat: DM });
    expect(p.replies.at(-1)).toMatchObject({ type: 'inventorybot.use', failed: true });
    p.owner('/usa chiave');
    const failed = 'infili la chiave nella serratura ma non le hai ancora tutte..';
    p.bot(`@${OWNER}, ${failed}`, { chat: DM });
    expect(p.replies.at(-1)).toMatchObject({ type: 'inventorybot.use', failed: true });
    p.owner('/usa chiave');
    p.bot(`@${OWNER}, infili la chiave nella serratura e senti un clic.`, { chat: DM });
    expect(p.replies.at(-1)).toMatchObject({ type: 'inventorybot.use', failed: false });
    await p.kit.stop();
  });

  it('pair no reply played back, and none with a send of another command', async () => {
    const p = await run();
    const q = p.out.enqueue(DM, '/esamina perla');
    await flush();
    // A listing answers no /esamina; history is no answer.
    p.bot(`@${OWNER}, possiedi:\n- una perla [C] x2`, { chat: DM });
    p.bot(`@${OWNER}, non hai oggetti o ricette con quel nome`, { chat: DM, playback: true });
    expect(q.status()).toBe('sent');
    p.kit.clock.advance(2 * MIN);
    await flush();
    await expect(q).resolves.toMatchObject({ answer: { status: 'unanswered' } });
    await p.kit.stop();
  });
});
