import { type BotMessage } from '@megabottron1999/turns/turn-parser.ts';
import { describe, expect, it } from 'vitest';
import { InventoryKnowledge } from './knowledge.ts';
import { listedItems, readInventoryBot, readReply, readStateReply } from './read.ts';

// Invented sentences (CLAUDE.md, "Game content"), with items of scripts/universe.md.
const S = 'mentre conti le nuvole dal tetto del mulino ti cade in mano ';

function knowledge(items: string[] = []): InventoryKnowledge {
  const docs: Record<string, unknown> = {};
  const k = new InventoryKnowledge({
    read: <T>(name: string) => docs[name] as T | undefined,
    write: (name, value) => void (docs[name] = value),
  });
  k.learnItems(items);
  return k;
}

/** A message of the bot, in the group unless said otherwise, to mario_r's account. */
const msg = (text: string, more: Partial<BotMessage> = {}): BotMessage => ({
  text,
  private: false,
  answers: false,
  replies: false,
  self: 'mario_r',
  ...more,
});

const gain = (item: string, rarity: string, more: object = {}) => ({
  outcome: { kind: 'gain', bot: 'InventoryBot', item, rarity, tags: [], sure: true, ...more },
  restMs: 15 * 60_000,
});

describe('readInventoryBot', () => {
  it("reads the owner's drop, with its rarity and tags, the addressee in any case", () => {
    expect(
      readInventoryBot(
        msg(`@Mario_R, ${S}un tubetto di colla verde [R] [usabile]!`),
        knowledge(['un tubetto di colla verde'])
      )
    ).toMatchObject(gain('un tubetto di colla verde', 'R', { tags: ['usabile'] }));
  });

  it('reads an addressee with a title, an announced drop, and a rarity with a plus', () => {
    const k = knowledge(['una ghianda', 'un sasso']);
    expect(readInventoryBot(msg(`@mario_r il cartografo, ${S}una ghianda [C+]!`), k)).toMatchObject(
      gain('una ghianda', 'C+')
    );
    expect(readInventoryBot(msg(`[W] @mario_r, ${S}un sasso [N]!`), k)).toMatchObject(
      gain('un sasso', 'N')
    );
  });

  it("guesses an unknown drop's item, and says so", () => {
    // With its narrative, from which a reader that learns more resolves it again.
    expect(readInventoryBot(msg(`@mario_r, ${S}una perla [C]!`), knowledge())).toEqual(
      gain('una perla', 'C', { sure: false, raw: `${S}una perla` })
    );
  });

  it("learns from anyone's drops and listings, and gives none of theirs", () => {
    const k = knowledge();
    expect(readInventoryBot(msg('@lucia_b, possiedi:\n- una perla [C] x2'), k)).toBeUndefined();
    expect(readInventoryBot(msg(`@lucia_b, ${S}una perla [C]!`), k)).toBeUndefined();
    expect(readInventoryBot(msg(`@mario_r, ${S}un sasso [C]!`), k)).toMatchObject(
      gain('un sasso', 'C')
    );
  });

  it('learns the items of the /esporta file the message carries, and claims nothing of it', () => {
    const k = knowledge();
    const caption = 'Inventario di @mario_r, al 2026/11/06 12:00:00';
    const document = { name: 'file.txt', mime: 'text/plain', size: 40 };
    const file = { ...document, text: '1x\tuna perla\t[C]\r\n3x\tun sasso\t[C]\r\n' };
    // Without its text, the caption teaches nothing.
    readInventoryBot(
      msg(caption, { private: true, document: { ...document, skipped: 'size' } }),
      k
    );
    expect(readInventoryBot(msg(`@mario_r, ${S}una perla [C]!`), k)).toMatchObject({
      outcome: { sure: false },
    });
    expect(readInventoryBot(msg(caption, { private: true, document: file }), k)).toBeUndefined();
    expect(readInventoryBot(msg(`@mario_r, ${S}un sasso [C]!`), k)).toMatchObject(
      gain('un sasso', 'C')
    );
  });

  it('reads the lucky adventure, learning its prize, and keeps one it cannot read as unread', () => {
    const lucky = "Complimenti @mario_r, questa e' l'avventura FORTUNATA del giorno! Hai vinto: ";
    const k = knowledge();
    expect(readInventoryBot(msg(`${lucky}una chiave di ebano 🔑 [X]`), k)).toMatchObject(
      gain('una chiave di ebano 🔑', 'X')
    );
    expect(k.items.has('una chiave di ebano 🔑')).toBe(true);
    // Its item is delimited: no narrative.
    expect(readInventoryBot(msg(`${lucky}una perla [X]`), k)).not.toHaveProperty('outcome.raw');
    expect(readInventoryBot(msg(`${lucky}qualcosa`), k)).toEqual({ unread: true });
    expect(readInventoryBot(msg(`${lucky.replace('mario_r', 'gino_x')}qualcosa`), k)).toBe(
      undefined
    );
  });

  it('reads the item of a decomposed text in its composed form', () => {
    const k = knowledge(['un caffè ristretto']);
    const text = `@mario_r, ${S}un caffè ristretto [C]!`.normalize('NFD');
    expect(readInventoryBot(msg(text), k)).toMatchObject(gain('un caffè ristretto', 'C'));
  });

  it('reads the cooldown in private only, with its wait or the rest', () => {
    const cooldown =
      'Troppo presto, devi riposare ancora per 3 minuti e 20 secondi prima di poterti avventurare di nuovo. Nelle /faq puoi trovare gruppi per scambiare oggetti e giocare con altri utenti! :P';
    expect(readInventoryBot(msg(cooldown, { private: true }), knowledge())).toEqual({
      outcome: { kind: 'nothing', bot: 'InventoryBot', reason: 'cooldown', retryMs: 200_000 },
      restMs: 200_000,
    });
    expect(readInventoryBot(msg(cooldown), knowledge())).toBeUndefined();
  });

  it('claims an unread answer in private, and leaves anything else', () => {
    expect(readInventoryBot(msg('Boh', { private: true, answers: true }), knowledge())).toEqual({
      unread: true,
    });
    expect(readInventoryBot(msg('Boh', { private: true }), knowledge())).toBeUndefined();
    expect(readInventoryBot(msg('Boh'), knowledge())).toBeUndefined();
  });
});

describe('listedItems', () => {
  const items = (text: string) => listedItems(readReply(text).ev);

  it('gives the items of inventories, recipes, crafts, shows and the lucky prize', () => {
    expect(items('@mario_r, possiedi:\n- una perla [C] x2\n- un sasso [C] x1')).toEqual([
      'una perla',
      'un sasso',
    ]);
    expect(
      items(
        "@mario_r, per fare Pennello rustico ti manca:\n- un ciuffo di morbide setole di tasso [R] x1\nMentre hai gia':\n- lo stecco di legno di un ghiacciolo [C] x1"
      )
    ).toEqual(['un ciuffo di morbide setole di tasso', 'lo stecco di legno di un ghiacciolo']);
    expect(
      items(
        '@mario_r, prendi in mano:\n- un chicco di caffè [R] x2\n- una tazzina vuota [R] x1\ne li metti insieme con cura!\nOttieni: un caffè ristretto!'
      )
    ).toEqual(['un chicco di caffè', 'una tazzina vuota']);
    expect(
      items(
        '@mario_r il cartografo, mostri orgogliosamente di possedere 14x un candido fazzoletto [C]'
      )
    ).toEqual(['un candido fazzoletto']);
  });

  it('gives none of an item card, whose name may follow a title, nor of a drop', () => {
    expect(
      items(
        "@mario_r una candela mezza consumata [C] al momento non ti serve in nessuna ricetta.\nNe hai 3.\nE' un oggetto trovabile in avventura."
      )
    ).toEqual([]);
    expect(items(`@mario_r, ${S}una perla [C]!`)).toEqual([]);
  });
});

describe('readStateReply', () => {
  it('reads the replies the player state reads, with their command', () => {
    expect(
      readStateReply('@mario_r, possiedi:\n- una perla [C] x2', '/inventario C')
    ).toMatchObject({
      type: 'inventory',
      filtered: true,
    });
    expect(
      readStateReply('@mario_r il cartografo, possiedi:\n- una perla [C] x2', null)
    ).toMatchObject({
      type: 'inventory',
    });
    expect(
      readStateReply('non ne hai abbastanza, ne possiedi solo 2.', '/dai lucia_b 3 perla')
    ).toMatchObject({
      type: 'miss',
      owned: 2,
    });
  });

  it('reads the /esporta file as a whole listing, and its caption alone as nothing', () => {
    const caption = 'Inventario di @mario_r, al 2026/11/06 12:00:00';
    const file = '2x\tuna perla\t[C]\r\n1x\tun dado di legno\t[R] [usabile]\r\n';
    expect(readStateReply(caption, '/esporta', file)).toEqual({
      type: 'inventory',
      filtered: false,
      truncated: false,
      exported: true,
      items: [
        { name: 'una perla', rarity: 'C', usable: false, qty: 2 },
        { name: 'un dado di legno', rarity: 'R', usable: true, qty: 1 },
      ],
    });
    // Decomposed letters are read composed, as the caption is.
    const decomposed = 'un caffè ristretto'.normalize('NFD');
    expect(readStateReply(caption, '/esporta', `1x\t${decomposed}\t[C]\r\n`)).toMatchObject({
      items: [{ name: 'un caffè ristretto' }],
    });
    expect(readStateReply(caption, '/esporta')).toBeUndefined();
    expect(readStateReply(caption, '/esporta', null)).toBeUndefined();
  });

  it('not the turns, refusals without a count, nor what it cannot read', () => {
    expect(readStateReply(`@mario_r, ${S}una perla [C]!`, '/avventura')).toBeUndefined();
    expect(readStateReply('@mario_r, non hai niente del genere', '/mostra x')).toBeUndefined();
    expect(readStateReply('Boh', null)).toBeUndefined();
  });
});
