/**
 * The version locks (CLAUDE.md, "Versions"): any change to a file a module ships needs a new
 * version in its `module.json`. Every module of the repository, each directory with a
 * `module.json` that MegaBotTron1999 would find (below), has its own lock, `module.lock.json`
 * beside it, which records the version and a hash of the files the module ships. `npm run
 * check:locks` fails when a module's hash changed and its lock was not stamped again, and `npm run
 * stamp` stamps the locks after a bump.
 *
 * The modules are those MegaBotTron1999 finds in the repository (its `module-files.ts`): every
 * `module.json` at any depth, but under `.git`, `node_modules`, a `vendor/` directory or a test
 * directory. The files a module ships are those it installs: all of the module's directory, but its
 * tests (`*.test.ts`, `*.spec.ts` and the like, and `test/`, `tests/`, `__tests__/`,
 * `__snapshots__/` at any depth) and its top-level `vendor/`. Two differences: the lock itself is
 * left out of its own hash, and the files are those git tracks or would track (as a GitHub install
 * sees the repository), so an ignored file never counts. A `files` list in `module.json` is not
 * supported: the check refuses it.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** The lock, in each module's directory. */
export const LOCK_FILE = 'module.lock.json';

export interface Lock {
  version: string;
  hash: string;
}

const TEST_DIRS = new Set(['test', 'tests', '__tests__', '__snapshots__']);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const NEVER = new Set(['.git', 'node_modules']);

/** Whether MegaBotTron1999 ships a file of a module (its path from the module's directory). */
export function shipped(rel: string): boolean {
  const parts = rel.split('/');
  const name = parts.pop() ?? '';
  if (rel === LOCK_FILE || parts.some((p) => NEVER.has(p))) return false;
  return !(parts[0] === 'vendor' || parts.some((p) => TEST_DIRS.has(p)) || TEST_FILE.test(name));
}

/**
 * The modules among a repository's files: the directory of every `module.json`, but one under
 * `.git`, `node_modules`, a `vendor/` directory or a test directory (as MegaBotTron1999 discovers
 * them). `.` for one at the root.
 */
export function modulesIn(files: readonly string[]): string[] {
  return files
    .filter((f) => f === 'module.json' || f.endsWith('/module.json'))
    .map((f) => path.posix.dirname(f))
    .filter(
      (d) =>
        d === '.' || !d.split('/').some((p) => NEVER.has(p) || p === 'vendor' || TEST_DIRS.has(p))
    )
    .sort();
}

/** The hash of the files shipped: each path, sorted, with the SHA-256 of its bytes. */
export function shippedHash(rels: readonly string[], read: (rel: string) => Uint8Array): string {
  const all = createHash('sha256');
  for (const rel of rels.filter(shipped).sort()) {
    all.update(`${rel}\0${createHash('sha256').update(read(rel)).digest('hex')}\n`);
  }
  return `sha256:${all.digest('hex')}`;
}

/** A pre-release identifier's order against another: numbers by value, below words. */
function compareIdentifiers(a: string, b: string): number {
  const na = /^\d+$/u.test(a);
  const nb = /^\d+$/u.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A `MAJOR.MINOR.PATCH[-pre]` version's order against another, as semver orders them: <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): [number[], string[] | null] => {
    const [core = '', pre] = v.split(/-(.*)/su);
    return [core.split('.').map(Number), pre === undefined ? null : pre.split('.')];
  };
  const [ca, pa] = parse(a);
  const [cb, pb] = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (ca[i] ?? 0) - (cb[i] ?? 0);
    if (d !== 0) return d;
  }
  if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const [x, y] = [pa[i], pb[i]];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const d = compareIdentifiers(x, y);
    if (d !== 0) return d;
  }
  return 0;
}

/** What a module's files say now. */
export interface ModuleState {
  /** The module's directory, from the repository's root. */
  dir: string;
  /** `module.json`'s version and its `files`, if any. */
  module: { version: string; files?: unknown };
  /** `package.json`'s version, when the module is also a workspace package; else null. */
  packageVersion: string | null;
  /** The hash of the files shipped now. */
  hash: string;
  /** The lock recorded, if any. */
  lock: Lock | null;
}

const STAMP = 'npm run stamp';

/** Why a module fails the check: one line each, none when it passes. */
export function checkModule(s: ModuleState): string[] {
  const at = (f: string): string => (s.dir === '.' ? f : `${s.dir}/${f}`);
  if (s.module.files !== undefined)
    return [
      `${at('module.json')} has a files list, which ${LOCK_FILE} does not follow: remove it, or teach scripts/locks.ts`,
    ];
  const out: string[] = [];
  if (s.packageVersion !== null && s.packageVersion !== s.module.version)
    out.push(
      `${at('package.json')} is at version ${s.packageVersion}, its module.json at ${s.module.version}: give both the same version`
    );
  if (s.lock === null) out.push(`${at(LOCK_FILE)} is missing: run ${STAMP}`);
  else if (s.lock.version === s.module.version && s.lock.hash !== s.hash)
    out.push(
      `the files the module ${s.dir} ships changed, and its version is still ${s.module.version}: bump the version in ${at('module.json')}${s.packageVersion === null ? '' : ' and package.json'} (CLAUDE.md, "Versions"), then run ${STAMP}`
    );
  else if (s.lock.version !== s.module.version)
    out.push(
      `${at('module.json')} is at version ${s.module.version}, its ${LOCK_FILE} at ${s.lock.version}: run ${STAMP}`
    );
  return out;
}

/** The lock to write for a module, or why it is refused. */
export function stampModule(s: ModuleState): { lock: Lock } | { error: string } {
  const problems = checkModule(s).filter((p) => !p.includes(STAMP));
  if (problems.length > 0) return { error: problems.join('\n') };
  if (s.lock !== null && s.lock.version === s.module.version) {
    return s.lock.hash === s.hash
      ? { lock: s.lock }
      : {
          error: `${s.dir}: the version is still ${s.module.version}, as the lock records: bump it in its module.json${s.packageVersion === null ? '' : ' and package.json'} first`,
        };
  }
  if (s.lock !== null && compareVersions(s.module.version, s.lock.version) < 0)
    return {
      error: `${s.dir}: version ${s.module.version} is older than ${s.lock.version}, the lock's: a version only goes up`,
    };
  return { lock: { version: s.module.version, hash: s.hash } };
}

/** The files git tracks or would track under `dir` (new ones included, ignored and deleted ones not). */
export function gitFiles(root: string, dir = '.'): string[] {
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', dir],
    { cwd: root, encoding: 'utf-8' }
  );
  return listed.split('\n').filter((f) => f !== '' && fs.existsSync(path.join(root, f)));
}

/** A module's state in a repository, its files as git lists them. */
export function readModuleState(root: string, dir: string): ModuleState {
  const abs = path.join(root, dir);
  const json = (rel: string): unknown => JSON.parse(fs.readFileSync(path.join(abs, rel), 'utf-8'));
  const prefix = dir === '.' ? '' : `${dir}/`;
  const rels = gitFiles(root, dir).map((f) => f.slice(prefix.length));
  const pkg = path.join(abs, 'package.json');
  const lockPath = path.join(abs, LOCK_FILE);
  return {
    dir,
    module: json('module.json') as ModuleState['module'],
    packageVersion: fs.existsSync(pkg)
      ? (json('package.json') as { version: string }).version
      : null,
    hash: shippedHash(rels, (rel) => fs.readFileSync(path.join(abs, rel))),
    lock: fs.existsSync(lockPath) ? (json(LOCK_FILE) as Lock) : null,
  };
}

/** Every module of a repository, read. */
export function readModules(root: string): ModuleState[] {
  return modulesIn(gitFiles(root)).map((d) => readModuleState(root, d));
}

/** The lock's text, as the stamp writes it. */
export const lockText = (lock: Lock): string =>
  `${JSON.stringify({ version: lock.version, hash: lock.hash }, null, 2)}\n`;
