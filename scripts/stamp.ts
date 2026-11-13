/**
 * `npm run stamp [-- DIR ...]`: records each module's version and the hash of the files it ships
 * in its lock, after a bump of its version, for every module of the repository or those given;
 * refuses a module whose shipped files changed and whose version did not (scripts/locks.ts). A
 * module whose lock is current is left as it is.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCK_FILE, lockText, readModules, stampModule } from './locks.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const wanted = process.argv.slice(2).map((d) => path.posix.normalize(d).replace(/\/$/u, ''));
const modules = readModules(ROOT).filter((m) => wanted.length === 0 || wanted.includes(m.dir));
const unknown = wanted.filter((d) => !modules.some((m) => m.dir === d));
let failed = unknown.length > 0;
for (const d of unknown) console.error(`${d} is not a module of this repository`);
for (const m of modules) {
  const result = stampModule(m);
  if ('error' in result) {
    console.error(result.error);
    failed = true;
    continue;
  }
  const file = path.join(ROOT, m.dir, LOCK_FILE);
  const text = lockText(result.lock);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf-8') === text) {
    console.log(`${m.dir}/${LOCK_FILE}: current, ${result.lock.version}`);
    continue;
  }
  fs.writeFileSync(file, text);
  console.log(`${m.dir}/${LOCK_FILE}: ${result.lock.version} ${result.lock.hash}`);
}
process.exit(failed ? 1 : 0);
