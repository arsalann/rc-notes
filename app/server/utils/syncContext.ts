import type { H3Event } from 'h3';
import type { WriteContext } from './db';
import { classifyClient, deriveUpdatedBy } from './eventLog';

/**
 * Headers a client sends so its writes carry device metadata:
 * - `X-Daybook-Device`: a random id the client keeps for its install.
 * - `X-Daybook-Op` / `X-Daybook-Client-Time`: set by `POST /api/sync/push` when it replays a queued
 *   change, so the change keeps its id and the time it was made on the device.
 */
export const DEVICE_HEADER = 'x-daybook-device';
export const OP_HEADER = 'x-daybook-op';
export const CLIENT_TIME_HEADER = 'x-daybook-client-time';

const TOKEN = /^[A-Za-z0-9._:-]{1,64}$/;
/** Device clocks before this are wrong, not old: fall back to the receive time. */
const EARLIEST_EDIT = Date.UTC(2025, 0, 1);

export function headerToken(value: string | undefined | null): string | null {
  const v = value?.trim();
  return v && TOKEN.test(v) ? v : null;
}

/** Naive UTC timestamp with milliseconds, the format the database's TIMESTAMP columns hold. */
export function naiveUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * The time an edit was made, from the device's clock, capped at `now` so a phone whose clock runs
 * fast cannot make its edits win forever. Missing or implausible values give null (= now).
 */
export function editTime(raw: string | undefined | null, now = new Date()): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t) || t < EARLIEST_EDIT) return null;
  return naiveUtc(new Date(Math.min(t, now.getTime())));
}

/** The write context of a request, computed once (auth middleware has run by the first write). */
export function writeContextFor(event: H3Event): WriteContext {
  const cached = event.context._writeContext as WriteContext | undefined;
  if (cached) return cached;
  const kind = classifyClient(getRequestHeader(event, 'user-agent'));
  const ctx: WriteContext = {
    deviceKind: kind,
    deviceId: headerToken(getRequestHeader(event, DEVICE_HEADER)),
    opId: headerToken(getRequestHeader(event, OP_HEADER)),
    opTime: editTime(getRequestHeader(event, CLIENT_TIME_HEADER)),
    updatedBy: deriveUpdatedBy(kind, !!event.context.user),
  };
  // Not cached before auth: `updatedBy` depends on the signed-in user.
  if (event.context.user) event.context._writeContext = ctx;
  return ctx;
}
