/**
 * The parser's events as the bus and the log give them, for the state's tests: a private reply as
 * its kind's event (`src/replies.ts`), its context beside the grammar's fields.
 */
import { type BusEvent } from '@megabottron1999/core';
import { replyEvent, type ReplyKind } from '#src/replies.ts';

export const T0 = Date.parse('2026-11-06T12:00:00Z');

/** The grammar's event `r` (with its `type`), as the parser publishes it, at `t`. */
export function replyBus(
  r: Record<string, unknown>,
  query: string | null,
  o: { self?: string; t?: number; playback?: true } = {}
): BusEvent {
  const { type, ...fields } = r;
  return {
    type: replyEvent(type as ReplyKind),
    t: o.t ?? T0,
    instance: 'inventorybot',
    chat: '@InventoryBot',
    query,
    ...(o.self === undefined ? {} : { self: o.self }),
    ...(o.playback === undefined ? {} : { playback: o.playback }),
    ...fields,
  } as BusEvent;
}
