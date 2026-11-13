/**
 * The state's records (item, recipe and place names to values) read and written by any name, even
 * one an object's prototype has (an item a player named `__proto__`): only their own properties
 * count, and a name is always written as one.
 */

/** The value of `key`, if the record has it. */
export const own = <V>(r: Record<string, V>, key: string): V | undefined =>
  Object.hasOwn(r, key) ? r[key] : undefined;

/** Sets `key` to `value` (in place, where it was), and gives `value`. */
export function put<V>(r: Record<string, V>, key: string, value: V): V {
  Object.defineProperty(r, key, { value, writable: true, enumerable: true, configurable: true });
  return value;
}

/** The value of `key`, set to `make()` first if the record has none. */
export const ensure = <V>(r: Record<string, V>, key: string, make: () => V): V =>
  own(r, key) ?? put(r, key, make());
