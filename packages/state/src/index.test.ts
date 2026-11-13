import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apply, initialState, playerView, reduce, type StateEvent } from './index.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('the entry', () => {
  it('folds_and_reduces_alike', () => {
    const events: StateEvent[] = [
      {
        type: 'inventory',
        filtered: false,
        truncated: false,
        items: [{ name: 'un sasso', rarity: 'C', usable: false, qty: 2 }],
        dm: true,
        date: '2026-11-06T12:00:00+00:00',
        query: '/inventario',
      },
    ];
    const folded = initialState('mario_r');
    for (const e of events) apply(folded, e);
    const reduced = events.reduce((s, e) => reduce(s, e), initialState('mario_r'));
    expect(reduced).toStrictEqual(folded);
    expect(playerView(reduced).inventory).toStrictEqual({
      'un sasso': { qty: 2, exact: true, date: '2026-11-06T12:00:00+00:00', via: 'inventario' },
    });
  });
});

describe('the module', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'module.json'), 'utf-8')) as {
    provides: string;
    plugins: string[];
    imports: Record<string, string>;
  };

  /** Every module Node loads to import the entry, as it runs it: files by their paths, others as named. */
  function loaded(): string[] {
    const trace = `
      import { registerHooks } from 'node:module';
      const seen = new Set();
      registerHooks({ resolve(s, c, next) { const r = next(s, c); seen.add(r.url); return r; } });
      await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'src/index.ts')).href)});
      console.log(JSON.stringify([...seen]));`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', trace], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    const root = pathToFileURL(ROOT).href + '/';
    return (JSON.parse(out) as string[])
      .map((u) => (u.startsWith(root) ? u.slice(root.length) : u))
      .sort();
  }

  it('is_a_library_whose_entry_is_this_file', () => {
    expect(manifest.plugins).toStrictEqual([]);
    expect(manifest.provides).toBe('@inventorybottron/state');
    expect(Object.keys(manifest.imports)).toStrictEqual(['@inventorybottron/grammar']);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as {
      name: string;
      exports: Record<string, string>;
    };
    expect([pkg.name, pkg.exports['.'], pkg.exports['./*']]).toStrictEqual([
      manifest.provides,
      './src/index.ts',
      './src/*',
    ]);
  });

  it('its_entry_loads_its_own_sources_and_the_grammars_only', () => {
    // No npm package, no Node API: its own src/ and the grammar, by its entry.
    const files = loaded();
    const own = files.filter((f) => /^src\/[\w/.-]+\.ts$/u.test(f));
    expect(own.length).toBeGreaterThan(1);
    const others = files.filter((f) => !own.includes(f));
    expect(others.filter((f) => !/\/packages\/grammar\/src\/[\w/.-]+\.ts$/u.test(f))).toStrictEqual(
      []
    );
    expect(others).toContain(others.find((f) => f.endsWith('/packages/grammar/src/index.ts')));
  });
});
