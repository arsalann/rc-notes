import { queryAll } from './db';
import { VARCHAR, INTEGER } from '@duckdb/node-api';

/**
 * Maps HTTP method + path pattern to a human-readable event type.
 */
function resolveEventType(method: string, path: string): string {
  const m = method.toUpperCase();
  const p = path.replace(/\/api\//, '');

  // Tasks
  if (p.match(/^tasks$/) && m === 'GET') return 'task.list';
  if (p.match(/^tasks$/) && m === 'POST') return 'task.create';
  if (p.match(/^tasks\/[^/]+$/) && m === 'GET') return 'task.view';
  if (p.match(/^tasks\/[^/]+$/) && m === 'PUT') return 'task.update';
  if (p.match(/^tasks\/[^/]+$/) && m === 'DELETE') return 'task.delete';
  if (p.match(/^tasks\/[^/]+\/complete$/)) return 'task.toggle_complete';
  if (p.match(/^tasks\/[^/]+\/pin$/)) return 'task.toggle_pin';
  if (p.match(/^tasks\/[^/]+\/archive$/)) return 'task.toggle_archive';

  // Notes
  if (p.match(/^notes$/) && m === 'GET') return 'note.list';
  if (p.match(/^notes$/) && m === 'POST') return 'note.create';
  if (p.match(/^notes\/[^/]+$/) && m === 'GET') return 'note.view';
  if (p.match(/^notes\/[^/]+$/) && m === 'PUT') return 'note.update';
  if (p.match(/^notes\/[^/]+$/) && m === 'DELETE') return 'note.delete';
  if (p.match(/^notes\/[^/]+\/pin$/)) return 'note.toggle_pin';

  // Diary
  if (p.match(/^diary$/) && m === 'GET') return 'diary.list';
  if (p.match(/^diary$/) && m === 'POST') return 'diary.create';
  if (p.match(/^diary\/[^/]+$/) && m === 'GET') return 'diary.view';
  if (p.match(/^diary\/[^/]+$/) && m === 'PUT') return 'diary.update';

  // Links
  if (p.match(/^links$/) && m === 'POST') return 'link.create';
  if (p.match(/^task-links\//)) return 'task_links.view';

  // Search & mention
  if (p.match(/^search$/)) return 'search';
  if (p.match(/^mention$/)) return 'mention';

  // Calendar
  if (p.match(/^calendar$/)) return 'calendar.view';

  // Workspaces
  if (p.match(/^workspaces$/) && m === 'GET') return 'workspace.list';
  if (p.match(/^workspaces$/) && m === 'POST') return 'workspace.create';

  // Stats
  if (p.match(/^stats$/)) return 'stats.view';

  return `${m.toLowerCase()}.${p.replace(/\//g, '.')}`;
}

/**
 * Extract entity type and ID from the path.
 */
function resolveEntity(path: string): { entity_type: string | null; entity_id: string | null } {
  const p = path.replace(/\/api\//, '');

  const taskMatch = p.match(/^tasks\/([^/]+)/);
  if (taskMatch) return { entity_type: 'task', entity_id: taskMatch[1] };

  const noteMatch = p.match(/^notes\/([^/]+)/);
  if (noteMatch) return { entity_type: 'note', entity_id: noteMatch[1] };

  const diaryMatch = p.match(/^diary\/([^/]+)/);
  if (diaryMatch) return { entity_type: 'diary', entity_id: diaryMatch[1] };

  const taskLinksMatch = p.match(/^task-links\/([^/]+)/);
  if (taskLinksMatch) return { entity_type: 'task', entity_id: taskLinksMatch[1] };

  return { entity_type: null, entity_id: null };
}

/**
 * Classify the client based on user-agent. Used for `client_kind` and `updated_by` defaults.
 * - 'playwright' : Playwright-driven browser tests
 * - 'curl'       : curl/wget command-line
 * - 'node_fetch' : node-fetch / undici / fetch from Node scripts
 * - 'browser'    : ordinary browser (Mozilla UA)
 * - 'unknown'    : everything else (or empty UA)
 */
export function classifyClient(userAgent: string | null | undefined): string {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (ua.includes('playwright')) return 'playwright';
  if (ua.includes('headlesschrome')) return 'playwright';  // playwright headless
  if (ua.includes('curl/')) return 'curl';
  if (ua.includes('node-fetch') || ua.includes('undici') || ua.startsWith('node')) return 'node_fetch';
  if (ua.includes('mozilla')) return 'browser';
  return 'unknown';
}

/**
 * Map client_kind + auth context to an `updated_by` category.
 * Used to tag rows so we can tell apart real-user actions from tests/agents.
 */
export function deriveUpdatedBy(clientKind: string, isAuthed: boolean): string {
  if (clientKind === 'playwright') return 'test_playwright';
  if (clientKind === 'curl' || clientKind === 'node_fetch') return 'agent_query';
  if (clientKind === 'browser') return isAuthed ? 'user_in_app' : 'anonymous_browser';
  return 'unknown';
}

export interface EventLogInput {
  method: string;
  path: string;
  workspace_id?: string | null;
  metadata?: Record<string, any>;
  user_agent?: string;
  user_id?: string | null;
  user_name?: string | null;
  request_body?: string | null;
  response_status?: number | null;
  request_ip?: string | null;
  duration_ms?: number | null;
  /**
   * When the event was observed, not when it is written. Matters for buffered rows.
   * Must be a naive server-local timestamp string — see `localTimestamp`.
   */
  occurred_at?: string;
}

/** The 17 bound columns, in insert order. `created_at` is appended separately. */
const FIELDS = [
  'event_type', 'method', 'path', 'entity_type', 'entity_id',
  'workspace_id', 'metadata', 'user_agent', 'user_id', 'user_name',
  'updated_by', 'request_body', 'response_status', 'client_kind', 'request_ip', 'duration_ms',
] as const;

const FIELD_TYPES: Record<string, any> = {
  event_type: VARCHAR, method: VARCHAR, path: VARCHAR,
  entity_type: VARCHAR, entity_id: VARCHAR, workspace_id: VARCHAR,
  metadata: VARCHAR, user_agent: VARCHAR, user_id: VARCHAR, user_name: VARCHAR,
  updated_by: VARCHAR, request_body: VARCHAR, response_status: INTEGER,
  client_kind: VARCHAR, request_ip: VARCHAR, duration_ms: INTEGER,
  created_at: VARCHAR,
};

/**
 * `event_log.created_at` is a naive TIMESTAMP, and every existing row was written by
 * `current_timestamp`, i.e. server-local wall time. Formatting as a UTC ISO string instead would
 * silently offset new rows by the server's UTC offset and scramble the log's ordering against
 * historical rows — so match what the database itself would have written.
 */
function localTimestamp(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function buildRow(opts: EventLogInput): Record<string, any> {
  const { entity_type, entity_id } = resolveEntity(opts.path);
  const clientKind = classifyClient(opts.user_agent);
  return {
    event_type: resolveEventType(opts.method, opts.path),
    method: opts.method.toUpperCase(),
    path: opts.path,
    entity_type: entity_type || '',
    entity_id: entity_id || '',
    workspace_id: opts.workspace_id || '',
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : '{}',
    user_agent: opts.user_agent || '',
    user_id: opts.user_id || '',
    user_name: opts.user_name || '',
    updated_by: deriveUpdatedBy(clientKind, !!opts.user_id),
    request_body: opts.request_body || '',
    response_status: opts.response_status ?? null,
    client_kind: clientKind,
    request_ip: opts.request_ip || '',
    duration_ms: opts.duration_ms ?? null,
    created_at: opts.occurred_at || localTimestamp(),
  };
}

async function insertRows(rows: Record<string, any>[]) {
  if (!rows.length) return;
  const params: Record<string, any> = {};
  const types: Record<string, any> = {};
  const tuples = rows.map((row, i) => {
    const placeholders = [...FIELDS, 'created_at'].map((f) => {
      const key = `${f}_${i}`;
      params[key] = row[f];
      types[key] = FIELD_TYPES[f];
      return f === 'created_at' ? `$${key}::TIMESTAMP` : `$${key}`;
    });
    return `(uuid()::VARCHAR, ${placeholders.join(', ')})`;
  });

  await queryAll(
    `INSERT INTO event_log (id, ${[...FIELDS, 'created_at'].join(', ')})
     VALUES ${tuples.join(', ')}`,
    params,
    types
  );
}

/**
 * Write one event immediately. Used for every mutation (POST/PUT/PATCH/DELETE).
 *
 * These are deliberately NOT buffered: `pipeline/assets/main/event_log.asset.yml` declares this
 * table the source of truth for data-loss and damage-recovery investigations, so losing mutation
 * rows to a hard crash would break it in exactly the scenario it exists for. Reads are buffered
 * instead — see `bufferEvent`. See .context/perf-plan.md item 7.
 */
export async function logEvent(opts: EventLogInput) {
  try {
    await insertRows([buildRow(opts)]);
  } catch {
    // Never let logging errors break the app
  }
}

// --- Buffered path, for reads only ---

const FLUSH_ROWS = 25;
const FLUSH_MS = 2000;

let buffer: Record<string, any>[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Buffer a read event. GETs are ~78% of event_log rows and each INSERT occupied the single shared
 * DuckDB connection, delaying the *next* request — which is why a one-SELECT endpoint measured
 * 150-250ms against a ~55ms network floor.
 *
 * `created_at` is captured here, at observation time, not at insert time, so ordering and durations
 * in the log are not skewed by up to the flush interval.
 */
export function bufferEvent(opts: EventLogInput) {
  buffer.push(buildRow(opts));
  if (buffer.length >= FLUSH_ROWS) {
    void flushEvents();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => { void flushEvents(); }, FLUSH_MS);
    // Do not hold the process open just for a pending flush.
    (flushTimer as any).unref?.();
  }
}

export async function flushEvents() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!buffer.length) return;
  const batch = buffer;
  buffer = [];
  try {
    await insertRows(batch);
  } catch (e) {
    // A failed flush drops the whole batch rather than one row, so make it observable rather than
    // silent. Not re-queued: retrying indefinitely on a broken connection would grow without bound.
    console.warn(`[event-log] dropped ${batch.length} buffered read events:`, (e as Error)?.message);
  }
}
