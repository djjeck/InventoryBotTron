import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** The packages and the modules: each directory of `packages/` and `modules/` with a `package.json`. */
function workspaces(root = import.meta.dirname): string[] {
  return ['packages', 'modules'].flatMap((top) => {
    const dir = path.join(root, top);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, 'package.json')))
      .map((d) => `${top}/${d}`);
  });
}

const PER_PACKAGE = { statements: 90, branches: 90, functions: 90, lines: 90 };

export default defineConfig({
  test: {
    // The packages' and modules' tests and the root's scripts'; MegaBotTron1999's own tests run
    // in its repository.
    include: ['packages/*/src/**/*.test.ts', 'modules/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: workspaces().map((p) => `${p}/src/**/*.ts`),
      exclude: ['**/*.test.ts'],
      // The rule holds for the whole and for each package and module (CLAUDE.md), so that each
      // one's own tests keep it covered.
      thresholds: {
        ...PER_PACKAGE,
        ...Object.fromEntries(workspaces().map((p) => [`${p}/src/**/*.ts`, PER_PACKAGE])),
      },
    },
  },
});
