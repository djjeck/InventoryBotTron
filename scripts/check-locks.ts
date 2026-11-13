/**
 * `npm run check:locks`: fails when the files a module ships changed and its version did not, for
 * every module of the repository (scripts/locks.ts).
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkModule, readModules } from './locks.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const modules = readModules(ROOT);
const problems = modules.flatMap(checkModule);
for (const p of problems) console.error(p);
if (problems.length === 0)
  console.log(`Locks: ${modules.map((m) => `${m.dir} ${m.module.version}`).join(', ')}.`);
process.exit(problems.length > 0 ? 1 : 0);
