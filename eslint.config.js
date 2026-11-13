import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

const PARENT_IMPORTS = {
  group: ['../*', '../**'],
  message:
    "Use the package's #src/* alias, or another package's name, for cross-directory imports. Keep ./foo for same-directory imports.",
};

/** Production code never depends on test code, so it can be shipped without it. */
const TEST_IMPORTS = {
  regex: '^(#test/|@[\\w-]+/[\\w-]+/test/)',
  message: 'Only tests may import the test helpers.',
};

/**
 * A package has no dependency at all (CLAUDE.md): its production code imports only its own files
 * and the other packages of this repository (`@inventorybottron/*`); no npm package, no Node API,
 * and nothing of MegaBotTron1999.
 */
const FOREIGN_IMPORTS = {
  regex: '^(?!@inventorybottron/|#src/|\\./)',
  message: 'A package imports only its own files and @inventorybottron/* (CLAUDE.md).',
};

/**
 * A module has no npm dependency of its own (MegaBotTron1999's docs/bot-os-api.md §7.1): its code
 * imports only Node, MegaBotTron1999 (`@megabottron1999/*`, the host's copy), zod, the grammar
 * (`@inventorybottron/grammar`, which it declares) and its own files. `scripts/modules.test.ts`
 * checks the same, and that each module declares the modules it imports in its `module.json`.
 */
const MODULE_FOREIGN_IMPORTS = {
  regex: '^(?!node:|@megabottron1999/|@inventorybottron/grammar$|zod$|#src/|#test/|\\./|vitest$)',
  message:
    'A module imports only node:*, @megabottron1999/*, zod and @inventorybottron/grammar (CLAUDE.md).',
};

/** Nothing here plays: no module imports MegaBotTron1999's actors. */
const ACTOR_IMPORTS = {
  regex: '^@megabottron1999/turns/turn-actor\\.ts$',
  message: 'InventoryBotTron automates no play: it imports no actor.',
};

const TESTS = ['**/*.test.ts'];

/** The rule with the given patterns, `../` always among them. */
const restrict = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns: [PARENT_IMPORTS, ...patterns] }],
});

export default tseslint.config(
  // Coverage reports, git-ignored (the flat config does not read .gitignore), and
  // MegaBotTron1999, vendored as a submodule and linted by its own repository.
  { ignores: ['coverage/', 'vendor/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      import: importPlugin,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      // Only dead imports are removed automatically; other unused code is left to review.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      'import/consistent-type-specifier-style': ['error', 'prefer-inline'],
      'import/no-duplicates': ['error', { 'prefer-inline': true }],
      'unused-imports/no-unused-imports': 'error',
      ...restrict(),
      // One group, so autofix never inserts blank lines between categories: packages, then
      // the #src and #test aliases, then relative imports, then side-effect imports.
      'simple-import-sort/imports': [
        'error',
        { groups: [['^@?\\w', '^#src(?:/.*|$)', '^#test(?:/.*|$)', '^\\.', '^\\u0000']] },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
  // The packages' production code: no test helpers, nothing outside the package and its siblings.
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: TESTS,
    rules: restrict(TEST_IMPORTS, FOREIGN_IMPORTS),
  },
  // The modules' production code: no test helpers, no actor, nothing outside §7.1's list.
  {
    files: ['modules/*/src/**/*.ts'],
    ignores: TESTS,
    rules: restrict(TEST_IMPORTS, ACTOR_IMPORTS, MODULE_FOREIGN_IMPORTS),
  },
  // Their tests and helpers: the same, but the helpers and Vitest.
  {
    files: ['modules/*/src/**/*.test.ts', 'modules/*/test/**/*.ts'],
    rules: restrict(ACTOR_IMPORTS, MODULE_FOREIGN_IMPORTS),
  }
);
