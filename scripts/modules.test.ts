/**
 * The modules of `modules/` keep MegaBotTron1999's module format (its docs/bot-os-api.md §7.1):
 * each has a `module.json` that names it, the import name it provides, the modules it imports and
 * its plugin entries; it is also a workspace package of the same name and version, with no npm
 * dependencies; and its code imports only Node, MegaBotTron1999, zod, its own files and the
 * modules it declares, which this repository's packages provide.
 */
import { parseManifest, type Plugin } from '@megabottron1999/core';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');

interface ModuleJson {
  id: string;
  version: string;
  api: string;
  provides: string;
  imports: Record<string, string>;
  plugins: string[];
}

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

/** The directories of `top` with a `module.json`. */
const modulesIn = (top: string): string[] =>
  fs
    .readdirSync(path.join(ROOT, top))
    .filter((d) => fs.existsSync(path.join(ROOT, top, d, 'module.json')))
    .map((d) => `${top}/${d}`);

/** The library modules of `packages/`, by the name each provides, with its version. */
const LIBRARIES: Record<string, string> = Object.fromEntries(
  modulesIn('packages').map((dir) => {
    const json = read<ModuleJson>(path.join(ROOT, dir, 'module.json'));
    return [json.provides, json.version];
  })
);

/** Whether `version` satisfies a caret range (`^0.3.1`), the form the modules use. */
function satisfiesCaret(version: string, range: string): boolean {
  const [v, r] = [version, range.replace(/^\^/u, '')].map((x) => x.split('.').map(Number)) as [
    number[],
    number[],
  ];
  const fixed = r[0] === 0 ? 2 : 1; // ^0.x.y fixes the minor too
  for (let i = 0; i < fixed; i++) if (v[i] !== r[i]) return false;
  for (let i = 0; i < 3; i++)
    if ((v[i] as number) !== (r[i] as number)) return (v[i] as number) > (r[i] as number);
  return true;
}

/** The `.ts` files under `dir`, relative to it. */
const sources = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .flatMap((e) =>
      e.isFile() && e.name.endsWith('.ts')
        ? [path.relative(dir, path.join(e.parentPath, e.name))]
        : []
    );

/** The specifiers a file imports from, static and dynamic. */
const specifiers = (text: string): string[] =>
  [...text.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/gu)].map((m) => m[1] as string);

describe('the modules', () => {
  const all = modulesIn('modules');

  it('satisfy caret ranges as npm does', () => {
    expect(['0.3.1', '0.3.5', '0.4.0', '0.3.0'].map((v) => satisfiesCaret(v, '^0.3.1'))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(['1.2.3', '1.9.0', '2.0.0'].map((v) => satisfiesCaret(v, '^1.2.3'))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('are the one of InventoryBotTron', () => {
    expect(all).toEqual(['modules/inventorybot']);
  });

  for (const dir of all) {
    const id = path.basename(dir);
    const json = read<ModuleJson>(path.join(ROOT, dir, 'module.json'));
    const pkg = read<Record<string, unknown>>(path.join(ROOT, dir, 'package.json'));

    describe(id, () => {
      it('declares itself as the package it is', () => {
        expect(json).toMatchObject({ id, api: '1', provides: `@inventorybottron/${id}` });
        expect(pkg).toMatchObject({
          name: json.provides,
          version: json.version,
          license: 'MIT',
          exports: { './*': './src/*' },
        });
        for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies'])
          expect(pkg[key]).toBeUndefined();
      });

      it('names plugin entries that exist, each exporting its plugins', async () => {
        expect(json.plugins.length).toBeGreaterThan(0);
        for (const entry of json.plugins) {
          expect(entry).toMatch(/^src\/plugins\/[\w-]+\.ts$/u);
          const exported = (await import(path.join(ROOT, dir, entry))) as { plugins?: unknown };
          expect(Array.isArray(exported.plugins), `${dir}/${entry}`).toBe(true);
          for (const p of exported.plugins as Plugin[])
            expect(() => parseManifest(p.manifest)).not.toThrow();
        }
      });

      it('imports only Node, MegaBotTron1999, zod, its own files and the modules it declares', () => {
        for (const [name, range] of Object.entries(json.imports)) {
          expect(LIBRARIES[name], name).toBeDefined();
          expect(satisfiesCaret(LIBRARIES[name] as string, range), `${name} ${range}`).toBe(true);
        }
        const found = new Set<string>();
        for (const sub of ['src', 'test']) {
          const base = path.join(ROOT, dir, sub);
          if (!fs.existsSync(base)) continue;
          for (const file of sources(base)) {
            const test = sub === 'test' || file.endsWith('.test.ts');
            for (const s of specifiers(fs.readFileSync(path.join(base, file), 'utf8'))) {
              const ok =
                s.startsWith('node:') ||
                s.startsWith('@megabottron1999/') ||
                s === 'zod' ||
                s.startsWith('#src/') ||
                s.startsWith('./') ||
                (test && (s === 'vitest' || s.startsWith('#test/'))) ||
                s in LIBRARIES;
              expect(ok, `${dir}/${sub}/${file}: ${s}`).toBe(true);
              if (s in LIBRARIES && !test) found.add(s);
            }
          }
        }
        expect([...found].sort()).toEqual(Object.keys(json.imports).sort());
      });
    });
  }
});
