import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { botMessages, decodeEntities, exportPages } from './export-pages.ts';
import { main, seedFrom } from './seed-knowledge.ts';

// Invented pages, in the markup of the InventoryBot wiki's docs/telegram-export.md, with invented
// sentences and the items and usernames of scripts/universe.md (CLAUDE.md, "Game content").
const S = 'mentre conti le nuvole dal tetto del mulino ti cade in mano ';

/** A Windows export's message: a full one, or joined to the previous one. */
const win = (id: number, from: string | null, body: string): string => `
     <div class="message default clearfix${from === null ? ' joined' : ''}" id="message${id}">
      ${from === null ? '' : '<div class="pull_left userpic_wrap"><div class="userpic userpic5"><div class="initials">IB</div></div></div>'}
      <div class="body">
       <div class="pull_right date details" title="27.11.2025 19:00:0${id % 10} UTC-05:00">19:00</div>
       ${from === null ? '' : `<div class="from_name">\n${from}\n       </div>`}
       ${body}
      </div>
     </div>`;

const text = (t: string): string => `<div class="text">\n${t}\n       </div>`;

const page = (title: string, entries: string[]): string => `<!DOCTYPE html>
<html>
 <head><meta charset="utf-8"/><title>Exported Data</title></head>
 <body onload="CheckLocation();">
  <div class="page_wrap">
   <div class="page_header"><div class="content"><div class="text bold">\n${title}\n</div></div></div>
   <div class="page_body chat_page">
    <div class="history">
     <div class="message service" id="message-1"><div class="body details">27 November 2025</div></div>
${entries.join('\n')}
    </div>
   </div>
  </div>
 </body>
</html>`;

describe('botMessages', () => {
  it("reads the bot's texts, joined ones, entities and line breaks, and no one else's", () => {
    const html = page('InventoryBot', [
      win(1, 'Mario R', text('/inventario')),
      win(
        2,
        'InventoryBot ',
        text(
          '<a href="https://t.me/mario_r">@mario_r</a>, possiedi:<br>- una perla [C] x2<br>- l&apos;ombra &amp; &#x1F511; [X] x1'
        )
      ),
      win(
        3,
        null,
        text(`<a href="https://t.me/mario_r">@mario_r</a>, ${S}<strong>un sasso</strong> [C]!`)
      ),
      win(4, 'Lucia B via @x', text('un sasso [C]')),
      // A media message with no text, then the bot's caption with its file.
      win(
        5,
        'InventoryBot',
        '<div class="media_wrap clearfix"><div class="media clearfix pull_left media_photo"><div class="body"><div class="title bold">Sticker</div></div></div></div>'
      ),
      win(
        6,
        null,
        '<div class="media_wrap clearfix"><a class="media clearfix pull_left block_link media_file" href="files/file (1).txt"><div class="body"><div class="title bold">file.txt</div></div></a></div>' +
          text('Inventario di @mario_r, al 2025/11/27 19:00:06')
      ),
    ]);
    expect(botMessages(html)).toEqual([
      { text: "@mario_r, possiedi:\n- una perla [C] x2\n- l'ombra & 🔑 [X] x1" },
      { text: `@mario_r, ${S}un sasso [C]!` },
      { text: 'Inventario di @mario_r, al 2025/11/27 19:00:06', file: 'files/file (1).txt' },
    ]);
  });

  it("reads a forward of the bot's, whoever sent it, its date left out of its author", () => {
    const forward = (from: string) =>
      `<div class="forwarded body"><div class="from_name">\n${from} <span class="date details"> 27.11.2025 18:00:00</span>\n</div>${text('@mario_r, possiedi:<br>- un sasso [C] x1')}</div>`;
    const html = page('Gruppo', [
      win(1, 'Lucia B', forward('InventoryBot')),
      win(2, 'InventoryBot', forward('Lucia B')),
    ]);
    expect(botMessages(html)).toEqual([{ text: '@mario_r, possiedi:\n- un sasso [C] x1' }]);
  });

  it('reads the macOS export, with no indentation and its own header', () => {
    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>InventoryBot</title></head><body><div class="page_wrap"><div class="page_header chat_header"><div class="content bubble"><div class="body"><div class="name bold">InventoryBot</div></div></div></div><div class="page_body chat_page"><div class="history">\n' +
      '<div class="message service"><div class="body details">27 November 2025</div></div>\n' +
      `<div class="message default clearfix" id="message7"><div class="pull_left userpic_wrap"><img class="userpic" src="photos/author_1.jpg"/></div><div class="body"><div class="pull_right date details" title="27 November 2025, 19:00:02">19:00</div><div class="from_name">InventoryBot</div><div class="text"><a href="https://t.me/mario_r">@mario_r</a>, ${S}una perla [C]!</div></div></div>\n` +
      '</div></div></div></body></html>';
    expect(botMessages(html)).toEqual([{ text: `@mario_r, ${S}una perla [C]!` }]);
  });

  it('decodes the named and numeric entities, leaving others', () => {
    expect(decodeEntities('&quot;&lt;&gt;&nbsp;&#39;&#X41;&bogus;')).toBe('"<> \'A&bogus;');
  });
});

describe('seedFrom', () => {
  it('learns as the node does live, and counts the drops read sure', () => {
    const r = seedFrom([
      { text: `@lucia_b, ${S}una ghianda [C]!` },
      { text: '@mario_r, possiedi:\n- una ghianda [C] x3' },
      { text: `@mario_r, ${S}una ghianda [C]!` },
      { text: `[W] @gino_x, ${S}un sasso [R]!` },
      { text: 'Inventario di @mario_r, al 2025/11/27 19:00:06', fileText: '' },
    ]);
    expect(r).toEqual({
      seed: { items: ['una ghianda', 'un sasso'], prefixes: [S, S.replace(/ $/u, '\n')] },
      messages: 5,
      drops: 3,
      sure: 2,
    });
  });
});

describe('the CLI', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  /** An export on disk: its folder, with the pages and files given. */
  function exportDir(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-'));
    dirs.push(dir);
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
    return dir;
  }

  it('lists the pages of the exports under a folder, in order', () => {
    const dir = exportDir({
      'b/messages.html': '',
      'a/messages10.html': '',
      'a/messages2.html': '',
      'a/messages.html': '',
      'a/messages01.html': '',
      'a/css/style.css': '',
    });
    expect(exportPages(dir).map((p) => path.relative(dir, p))).toEqual([
      'a/messages.html',
      'a/messages2.html',
      'a/messages10.html',
      'b/messages.html',
    ]);
  });

  it('prints the seed of the exports, reading the files their messages link to', () => {
    const dir = exportDir({
      'ChatExport_2025-11-28/messages.html': page('InventoryBot', [
        win(
          1,
          'InventoryBot',
          '<div class="media_wrap clearfix"><a class="media clearfix pull_left block_link media_file" href="files/file.txt"><div class="body"><div class="title bold">file.txt</div></div></a></div>' +
            text('Inventario di @mario_r, al 2025/11/27 19:00:06')
        ),
        win(2, null, text(`@mario_r, ${S}una perla [C]!`)),
      ]),
      'ChatExport_2025-11-28/messages2.html': page('InventoryBot', [
        win(3, 'InventoryBot', text(`@mario_r, ${S}un sasso [C]!`)),
      ]),
    });
    fs.mkdirSync(path.join(dir, 'ChatExport_2025-11-28/files'));
    fs.writeFileSync(
      path.join(dir, 'ChatExport_2025-11-28/files/file.txt'),
      // The /esporta file's lines (docs/bot-protocol.md §6.8), with Windows line ends.
      '2x\tuna perla\t[C]\r\n1x\tun sasso\t[C]\r\n'
    );
    const out: string[] = [];
    const err: string[] = [];
    expect(
      main(
        [dir],
        (s) => out.push(s),
        (s) => err.push(s)
      )
    ).toBe(0);
    expect(JSON.parse(out.join(''))).toEqual({
      items: ['una perla', 'un sasso'],
      prefixes: [S, S.replace(/ $/u, '\n')],
    });
    expect(err).toEqual([
      '3 messages of the bot, 2 drops (2 sure as read in order): 2 items, 2 prefixes.',
    ]);
  });

  it('refuses no folder, an option or a path that is not one', () => {
    const err: string[] = [];
    const dir = exportDir({ 'x.txt': '' });
    for (const args of [[], ['--out'], [path.join(dir, 'x.txt')], [path.join(dir, 'none')]])
      expect(
        main(
          args,
          () => {},
          (s) => err.push(s)
        )
      ).toBe(2);
    expect(err[0]).toMatch(/^usage: /u);
  });
});
