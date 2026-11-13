/**
 * The state's dates: ISO 8601 with their UTC offset (`2026-11-06T12:00:00+01:00`), as the wiki
 * writes the dates of an export, compared as instants. Pure functions.
 */

const ISO_DATE =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})([+-])([0-9]{2}):([0-9]{2})$/u;

interface Zoned {
  /** Epoch seconds of the wall clock read as UTC. */
  wall: number;
  /** Minutes east of UTC. */
  offset: number;
}

/** A date's wall clock and offset, or null when it is not an ISO date with an offset that exists. */
function parse(s: string | null | undefined): Zoned | null {
  const m = typeof s === 'string' ? ISO_DATE.exec(s) : null;
  if (m === null) return null;
  const [year, month, day, hour, minute, second, oh, om] = [1, 2, 3, 4, 5, 6, 8, 9].map((i) =>
    Number(m[i])
  ) as [number, number, number, number, number, number, number, number];
  if (oh > 23 || om > 59) return null;
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second);
  const exists =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === minute &&
    d.getUTCSeconds() === second;
  if (!exists) return null;
  return { wall: d.getTime() / 1000, offset: (m[7] === '-' ? -1 : 1) * (oh * 60 + om) };
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** A wall clock (epoch seconds read as UTC) and an offset, as an ISO date. */
function format(wall: number, offset: number): string {
  const t = new Date(wall * 1000);
  const a = Math.abs(offset);
  return (
    `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}` +
    `${offset < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
  );
}

/** Epoch seconds of an ISO date, or null if it is not one. */
export function isoDateSeconds(s: string | null | undefined): number | null {
  const d = parse(s);
  return d === null ? null : d.wall - d.offset * 60;
}

const instants = new Map<string, number>();

/**
 * Epoch seconds of a date, so that dates written with different offsets compare right;
 * -Infinity for a missing or unparsable one, which sorts before every real date.
 */
export function instant(s: string | null | undefined): number {
  if (typeof s !== 'string') return -Infinity;
  let v = instants.get(s);
  if (v === undefined) {
    v = isoDateSeconds(s) ?? -Infinity;
    if (instants.size > 10_000) instants.clear();
    instants.set(s, v);
  }
  return v;
}

/** An ISO date `seconds` later, with the same offset; null if it is not one. */
export function isoPlusSeconds(s: string | null | undefined, seconds: number): string | null {
  const d = parse(s);
  return d === null ? null : format(d.wall + seconds, d.offset);
}

/** A time in milliseconds as an ISO date in UTC, to the second (`2026-11-06T12:00:00+00:00`). */
export function isoOf(ms: number): string {
  return format(Math.floor(ms / 1000), 0);
}
