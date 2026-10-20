import { queryAll } from '~/server/utils/db';
import { VARCHAR, INTEGER } from '~/server/utils/sqlTypes';
import {
  CLIENT_TIME_HEADER, DEVICE_HEADER, OP_HEADER, editTime, headerToken,
} from '~/server/utils/syncContext';

/**
 * `POST /api/sync/push` — body `{ ops: [{ id, client_time, method, path, body }] }`
 *
 * Applies a device's queued changes, in order, by replaying each one through the normal endpoint
 * in-process. The endpoints keep every rule they already have (display ids, diary links,
 * carry-forward, journal compare-and-swap); this handler adds only:
 *
 * - Exactly once: each op id is recorded in `sync_ops` with its result. A repeated id (the phone
 *   retrying after a lost response) gets the stored result back and changes nothing.
 * - Device time: `X-Daybook-Client-Time` carries when the change was made, so the sync triggers
 *   can keep a newer edit made elsewhere in the meantime (last writer wins, per field).
 * - Order: a server error stops the batch, since later ops may depend on the failed one; the phone
 *   retries from there. A 4xx is final for that op and the batch goes on.
 *
 * Only data routes are allowed: no auth, users or setup.
 */
const MAX_OPS = 100;
const MAX_STORED_RESPONSE = 32_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = '[A-Za-z0-9-]+';
const DATE = '\\d{4}-\\d{2}-\\d{2}';
const ALLOWED: { method: string; path: RegExp }[] = [
  { method: 'POST', path: /^\/api\/tasks$/ },
  { method: 'PUT', path: new RegExp(`^/api/tasks/${ID}$`) },
  { method: 'DELETE', path: new RegExp(`^/api/tasks/${ID}$`) },
  { method: 'PATCH', path: new RegExp(`^/api/tasks/${ID}/(complete|pin)$`) },
  { method: 'PATCH', path: /^\/api\/tasks\/positions$/ },
  // Multi-select bar: archive / status / priority / delete for many tasks (absolute, safe to replay).
  { method: 'POST', path: /^\/api\/tasks\/bulk$/ },
  { method: 'POST', path: /^\/api\/tasks\/from-checklist$/ },
  { method: 'POST', path: /^\/api\/notes$/ },
  { method: 'PUT', path: new RegExp(`^/api/notes/${ID}$`) },
  { method: 'POST', path: /^\/api\/links$/ },
  { method: 'POST', path: /^\/api\/diary$/ },
  { method: 'PUT', path: new RegExp(`^/api/diary/${DATE}$`) },
  // Opening a day page links the tasks due that day (the GET has that side effect).
  { method: 'GET', path: new RegExp(`^/api/diary/${DATE}(\\?workspace_id=${ID})?$`) },
  { method: 'PUT', path: new RegExp(`^/api/goals/${DATE}$`) },
];

interface Op { id: string; client_time?: string; method: string; path: string; body?: unknown }
interface OpResult { id: string; status: number; body: unknown; replayed?: boolean }

function allowed(method: string, path: string): boolean {
  return ALLOWED.some(rule => rule.method === method && rule.path.test(path));
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const ops: Op[] = Array.isArray(body?.ops) ? body.ops : [];
  if (!ops.length) throw createError({ statusCode: 400, statusMessage: 'ops must be a non-empty array' });
  if (ops.length > MAX_OPS) throw createError({ statusCode: 400, statusMessage: `Too many ops (max ${MAX_OPS})` });

  const user = event.context.user as { id?: string } | undefined;
  const deviceId = headerToken(getRequestHeader(event, DEVICE_HEADER));
  const forward: Record<string, string> = { 'content-type': 'application/json' };
  for (const name of ['cookie', 'user-agent', 'x-forwarded-for', DEVICE_HEADER]) {
    const value = getRequestHeader(event, name);
    if (value) forward[name] = value;
  }

  const nitro = useNitroApp();
  const results: OpResult[] = [];
  let stopped = false;

  for (const op of ops) {
    const method = String(op?.method || '').toUpperCase();
    const path = String(op?.path || '');
    if (typeof op?.id !== 'string' || !UUID_RE.test(op.id)) {
      throw createError({ statusCode: 400, statusMessage: 'each op needs a UUID id' });
    }
    const id = op.id.toLowerCase();

    const done = await queryAll('SELECT status, response FROM sync_ops WHERE op_id = $id', { id }, { id: VARCHAR });
    if (done.length) {
      results.push({ id, status: Number(done[0]!.status), body: parse(done[0]!.response), replayed: true });
      continue;
    }

    if (!allowed(method, path)) {
      results.push({ id, status: 400, body: { statusMessage: `Not allowed in a sync batch: ${method} ${path}` } });
      continue;
    }

    let status: number;
    let responseText: string;
    try {
      const response = await nitro.localFetch(path, {
        method,
        headers: { ...forward, [OP_HEADER]: id, ...(op.client_time ? { [CLIENT_TIME_HEADER]: String(op.client_time) } : {}) },
        body: method === 'GET' || op.body === undefined ? undefined : JSON.stringify(op.body),
      });
      status = response.status;
      responseText = await response.text();
    } catch (e) {
      console.warn('[sync] op failed to run:', (e as Error)?.message);
      status = 500;
      responseText = '';
    }

    if (status >= 500) {
      results.push({ id, status, body: parse(responseText) });
      stopped = true;
      break;
    }

    // Day-page visits return the whole hydrated page; the phone gets it from the pull instead.
    const keep = method === 'GET' ? '' : responseText;
    await queryAll(
      `INSERT INTO sync_ops (op_id, user_id, device_id, method, path, status, response, client_time)
       VALUES ($id, $user_id, $device_id, $method, $path, $status, $response, $client_time::TIMESTAMP)
       ON CONFLICT (user_id, op_id) DO NOTHING`,
      {
        id, user_id: user?.id ?? null, device_id: deviceId, method, path, status,
        response: keep.length > MAX_STORED_RESPONSE ? null : keep,
        client_time: editTime(op.client_time),
      },
      {
        id: VARCHAR, user_id: VARCHAR, device_id: VARCHAR, method: VARCHAR, path: VARCHAR,
        status: INTEGER, response: VARCHAR, client_time: VARCHAR,
      },
    );
    results.push({ id, status, body: method === 'GET' ? null : parse(responseText) });
  }

  // The ledger only has to outlive a device's retries.
  await queryAll("DELETE FROM sync_ops WHERE received_at < current_timestamp - INTERVAL '60 days'").catch(() => {});

  return { results, stopped };
});

function parse(text: unknown): unknown {
  if (typeof text !== 'string' || !text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
