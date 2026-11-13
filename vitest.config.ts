import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** The packages: each directory of `packages/` with a `package.json`. */
function packages(root = import.meta.dirname): string[] {
  const dir = path.join(root, 'packages');
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'package.json')))
    .map((d) => `packages/${d}`);
}

const PER_PACKAGE = { statements: 90, branches: 90, functions: 90, lines: 90 };

export default defineConfig({
  test: {
    // The packages' tests and the root's scripts'.
    include: ['packages/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: packages().map((p) => `${p}/src/**/*.ts`),
      exclude: ['**/*.test.ts'],
      // The rule holds for the whole and for each package (CLAUDE.md), so that a package's own
      // tests keep it covered.
      thresholds: {
        ...PER_PACKAGE,
        ...Object.fromEntries(packages().map((p) => [`${p}/src/**/*.ts`, PER_PACKAGE])),
      },
    },
  },
});
