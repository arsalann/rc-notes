import { AsyncLocalStorage } from 'async_hooks';
import { resolve } from 'path';
import { mkdirSync, readFileSync } from 'fs';
import { getDatabaseUrl } from './config';
import { APP_ROLE, ensureSchema, type Run } from './schema';
import { toPositional } from './sql';
import { VARCHAR, type SqlType } from './sqlTypes';

/**
 * Database access. Production and shared dev use Postgres (Supabase) via `DATABASE_URL`. Without it
 * the server runs an embedded Postgres (PGlite) in a local directory, so tests and offline dev need
 * no database server: `PGLITE_PATH`, default `data/pglite`.
 *
 * Results keep the shapes the API always returned: DATE and TIMESTAMP columns come back as the
 * server's text (`2026-10-16`, `2026-10-16 17:30:30.24154`), never as JS Dates. The journal's
 * optimistic concurrency echoes `updated_at` byte for byte, so this matters. Counts are numbers.
 */

const OID = { INT8: 20, NUMERIC: 1700, DATE: 1082, TIMESTAMP: 1114, TIMESTAMPTZ: 1184 } as const;
const asText = (v: string) => v;

export interface Database {
  run: Run;
  transaction<T>(fn: (run: Run) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Who is asking and when, handed to the database through per-connection settings: the sync
 * triggers read the device fields (see `SYNC_ROW_FUNCTION` in `schema.ts`), and row level security
 * reads `daybook.user_id`. `opTime` is naive UTC (`2026-10-17 09:30:00.123`).
 *
 * Every statement made inside a request runs as the `APP_ROLE` role, which row level security
 * applies to: it sees and writes only rows whose `user_id` is the signed-in user (`userId`; null
 * before sign-in = no rows). Statements outside a request (boot, schema check, scripts, the event
 * log flush) run as the connecting owner role and see everything.
 */
export interface WriteContext {
  userId: string | null;
  deviceKind: string | null;
  deviceId: string | null;
  opId: string | null;
  opTime: string | null;
  updatedBy: string | null;
}

let writeContextProvider: () => WriteContext | null = () => null;

/** Set by the Nitro plugin `plugins/sync-context.ts`; scripts never set it and write without one. */
export function setWriteContextProvider(provider: () => WriteContext | null) {
  writeContextProvider = provider;
}

const system = new AsyncLocalStorage<true>();
const transactionRun = new AsyncLocalStorage<Run>();

/**
 * Run `fn` as the owner role, outside row level security, even inside a request. Only for writes
 * that are not one user's data: the audit log (it records requests before sign-in too) and
 * account deletion's own cleanup. Timers started inside a request inherit its context, so
 * anything they write that is not the user's own must go through here.
 */
export function asSystem<T>(fn: () => Promise<T>): Promise<T> {
  return system.run(true, fn);
}

function currentWriteContext(): WriteContext | null {
  if (system.getStore()) return null;
  // A malformed request context must fail the query, never silently elevate it to the owner.
  return writeContextProvider();
}

function contextValues(ctx: WriteContext | null): string[] {
  if (!ctx) return ['none', '', '', '', '', '', ''];
  return [APP_ROLE, ...[ctx.userId, ctx.deviceKind, ctx.deviceId, ctx.opId, ctx.opTime, ctx.updatedBy].map(v => v ?? '')];
}

/** `role` is the setting behind `SET ROLE`; `none` switches back to the connecting role. */
function contextSql(local: boolean): string {
  const names = ['role', 'daybook.user_id', 'daybook.device_kind', 'daybook.device_id', 'daybook.op_id',
    'daybook.op_time', 'daybook.updated_by'];
  return `SELECT ${names.map((n, i) => `set_config('${n}', $${i + 1}, ${local})`).join(', ')}`;
}

/**
 * TLS for the Postgres connection. With `DATABASE_CA_CERT` (the PEM from Supabase → Database →
 * SSL Configuration; Railway) or `DATABASE_CA_CERT_FILE` (a path to it, relative to `app/`; local
 * `.env`) the server certificate is fully verified. Without either, the connection string's own
 * `sslmode` applies (local Postgres needs none).
 */
function caCert(): string | undefined {
  const inline = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  if (inline) return inline;
  const file = process.env.DATABASE_CA_CERT_FILE;
  return file ? readFileSync(resolve(process.cwd(), file), 'utf8').trim() : undefined;
}

function sslConfig(url: string): { connectionString: string; ssl?: { ca: string; rejectUnauthorized: true } } {
  const ca = caCert();
  if (!ca) return { connectionString: url };
  // A `sslmode` in the URL would override the `ssl` object below, so drop it.
  const parsed = new URL(url);
  parsed.searchParams.delete('sslmode');
  return { connectionString: parsed.toString(), ssl: { ca, rejectUnauthorized: true } };
}

async function connectPostgres(url: string): Promise<Database> {
  const pg = (await import('pg')).default;
  const raw = new Set<number>([OID.DATE, OID.TIMESTAMP, OID.TIMESTAMPTZ]);
  const pool = new pg.Pool({
    ...sslConfig(url),
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    types: {
      getTypeParser: ((oid: number, format?: any) => {
        if (raw.has(oid)) return asText;
        if (oid === OID.INT8 || oid === OID.NUMERIC) return Number;
        return pg.types.getTypeParser(oid, format);
      }) as any,
    },
  });
  pool.on('error', (e) => console.warn('[db] idle client error:', e.message));
  // Pin each pooled connection to UTC before its first query, so `now()` / `current_timestamp`
  // always write UTC whatever the database's default time zone is.
  const utc = new WeakSet<object>();
  // The context last set on each pooled connection. A statement whose context differs updates it
  // first (one extra round trip). New connections start as the owner role with no context.
  const contextKey = new WeakMap<object, string>();
  const setContext = contextSql(false);
  async function acquire() {
    const client = await pool.connect();
    try {
      if (!utc.has(client)) {
        await client.query("SET TIME ZONE 'UTC'");
        utc.add(client);
      }
      const ctxValues = contextValues(currentWriteContext());
      const key = ctxValues.join('\u0000');
      if (contextKey.get(client) !== key) {
        contextKey.delete(client);
        await client.query(setContext, ctxValues);
        contextKey.set(client, key);
      }
      return client;
    } catch (error) {
      // A failed settings update must never leave a reusable, ambiguously scoped client.
      client.release(true);
      throw error;
    }
  }
  return {
    run: async (sql, values = []) => {
      const client = await acquire();
      try { return (await client.query(sql, values)).rows; }
      finally { client.release(); }
    },
    transaction: async (fn) => {
      const client = await acquire();
      let broken = false;
      try {
        await client.query('BEGIN');
        const result = await fn(async (sql, values = []) => (await client.query(sql, values)).rows);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { broken = true; }
        throw error;
      } finally { client.release(broken); }
    },
    close: () => pool.end(),
  };
}

async function connectPglite(dir: string): Promise<Database> {
  const { PGlite, types } = await import('@electric-sql/pglite');
  if (dir !== 'memory://') mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir, {
    parsers: {
      [types.DATE]: asText, [types.TIMESTAMP]: asText, [types.TIMESTAMPTZ]: asText,
      [types.INT8]: Number, [types.NUMERIC]: Number,
    },
  });
  await db.exec("SET TIME ZONE 'UTC'");
  // One connection shared by every request: a statement with a context runs in a transaction that
  // sets it locally, so it can never leak into another request's statement.
  const setContext = contextSql(true);
  return {
    run: async (sql, values = []) => {
      const ctx = currentWriteContext();
      if (!ctx) return (await db.query<Record<string, any>>(sql, values)).rows;
      return db.transaction(async (tx) => {
        await tx.query(setContext, contextValues(ctx));
        return (await tx.query<Record<string, any>>(sql, values)).rows;
      });
    },
    transaction: async (fn) => db.transaction(async (tx) => {
      await tx.query(setContext, contextValues(currentWriteContext()));
      return fn(async (sql, values = []) => (await tx.query<Record<string, any>>(sql, values)).rows);
    }),
    close: () => db.close(),
  };
}

export async function openDatabase(url: string | null = getDatabaseUrl()): Promise<Database> {
  if (url) {
    // Host only — never log credentials. ios/scripts/test-server.sh checks these lines.
    let host = 'unknown host';
    try { host = new URL(url).host; } catch {}
    console.log(`[db] postgres at ${host}`);
    return connectPostgres(url);
  }
  if (process.env.NODE_ENV === 'production') {
    // Never silently start an empty embedded database in a deployment.
    throw new Error('DATABASE_URL must be set in production');
  }
  const dir = process.env.PGLITE_PATH || resolve(process.cwd(), '..', 'data', 'pglite');
  console.log(`[db] embedded PGlite at ${dir}`);
  return connectPglite(dir);
}

let connectionPromise: Promise<Database> | null = null;

export function resetConnection() {
  connectionPromise = null;
}

export function useDB(): Promise<Database> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const db = await openDatabase();
      try {
        await asSystem(() => ensureSchema(db.run, { transaction: db.transaction }));
        return db;
      } catch (error) {
        await db.close();
        throw error;
      }
    })().catch((err) => {
      // Never memoize a rejected promise: a transient failure must not brick the process.
      connectionPromise = null;
      throw err;
    });
  }
  return connectionPromise;
}

export async function queryAll(
  sql: string,
  params: Record<string, any> = {},
  types?: Record<string, SqlType>
): Promise<Record<string, any>[]> {
  const db = await useDB();
  const { text, values } = toPositional(sql, params, types);
  return (transactionRun.getStore() ?? db.run)(text, values);
}

/** Pin all queryAll/execute calls in fn to one connection and commit or roll back together.
 * The caller's user/system scope is fixed for the transaction; do not switch it inside fn.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (transactionRun.getStore()) return fn();
  const db = await useDB();
  return db.transaction(run => transactionRun.run(run, fn));
}

export async function execute(sql: string, params: Record<string, any> = {}, types?: Record<string, SqlType>) {
  await queryAll(sql, params, types);
}

/**
 * SQL for the id of a NEW diary entry: derived from its date and workspace, so the iOS app (which
 * computes the same value, `DiaryIds.entryId`) and the server agree on it even when the page is
 * created offline. Entries created before this existed keep their random ids.
 */
export function diaryIdSql(dateParam: string, workspaceParam: string): string {
  return `md5('daybook-diary:' || ${dateParam} || ':' || COALESCE(${workspaceParam}, ''))::uuid::text`;
}

/**
 * Give a user the default Personal and Work workspaces if they have none. Runs inside the user's
 * request (sign-up, sign-in, setup), so row level security scopes it and stamps the owner.
 */
export async function ensureUserWorkspaces() {
  await queryAll(
    `INSERT INTO workspaces (name, emoji, position)
     SELECT * FROM (VALUES ('Personal', '🏠', 0), ('Work', '💼', 1)) AS d(name, emoji, position)
     WHERE NOT EXISTS (SELECT 1 FROM workspaces)`
  );
}

export async function getDefaultWorkspaceId(): Promise<string | null> {
  let rows = await queryAll(
    "SELECT id FROM workspaces WHERE name = 'Work' ORDER BY position, id LIMIT 1"
  );
  if (!rows.length) {
    // Historical accounts may have no workspaces. Seed before deriving diary ids: a date with a
    // NULL workspace hashes to the same id for every user. Existing NULL-workspace pages keep
    // their immutable identity; all new pages receive a workspace owned by this user.
    await ensureUserWorkspaces();
    rows = await queryAll("SELECT id FROM workspaces ORDER BY (name = 'Work') DESC, position, id LIMIT 1");
  }
  return rows[0]?.id || null;
}

/**
 * Find or create a diary entry for the given date, then link the task to it.
 */
export async function linkTaskToDiary(taskId: string, dueAt: string, workspaceId?: string | null) {
  // Extract YYYY-MM-DD from the due_at timestamp
  const dateStr = dueAt.slice(0, 10);

  // Find existing diary entry for this date in the task's workspace
  const findParams: Record<string, any> = { date: dateStr };
  const findTypes: Record<string, any> = { date: VARCHAR };
  let wsFilter = '';
  if (workspaceId) {
    wsFilter = ' AND workspace_id = $ws';
    findParams.ws = workspaceId;
    findTypes.ws = VARCHAR;
  } else {
    wsFilter = ' AND workspace_id IS NULL';
  }
  let diaryRows = await queryAll(
    `SELECT id FROM diary_entries WHERE entry_date = $date::DATE${wsFilter} LIMIT 1`,
    findParams, findTypes
  );

  // Create diary entry if it doesn't exist
  if (!diaryRows.length) {
    const wsId = workspaceId || await getDefaultWorkspaceId();
    const cols = ['id', 'entry_date', 'content'];
    const vals = [diaryIdSql('$date', '$ws'), '$date::DATE', "''"];
    const p: Record<string, any> = { date: dateStr, ws: wsId };
    const t: Record<string, any> = { date: VARCHAR, ws: VARCHAR };
    if (wsId) {
      cols.push('workspace_id');
      vals.push('$ws');
    }
    diaryRows = await queryAll(
      `INSERT INTO diary_entries (${cols.join(', ')}) VALUES (${vals.join(', ')})
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      p, t
    );
    if (!diaryRows.length) {
      diaryRows = await queryAll(
        `SELECT id FROM diary_entries WHERE id = ${diaryIdSql('$date', '$ws')}`, p, t
      );
    }
  }

  if (!diaryRows.length) return;
  const diaryId = diaryRows[0]!.id;

  // Remove stale diary→task links pointing at a different day than the current due date.
  // Without this, changing a task's due_at leaves the task visible on its previous day's diary.
  await queryAll(
    `DELETE FROM links
     WHERE source_type = 'diary' AND target_type = 'task' AND target_id = $tid
       AND source_id <> $did
       AND source_id IN (SELECT id FROM diary_entries WHERE entry_date <> $date::DATE)`,
    { tid: taskId, did: diaryId, date: dateStr },
    { tid: VARCHAR, did: VARCHAR, date: VARCHAR }
  );

  // Create link if not already linked
  await queryAll(
    `INSERT INTO links (id, source_type, source_id, target_type, target_id)
     SELECT gen_random_uuid()::text, 'diary', $did, 'task', $tid
     WHERE NOT EXISTS (
       SELECT 1 FROM links WHERE source_type = 'diary' AND source_id = $did AND target_type = 'task' AND target_id = $tid
     )`,
    { did: diaryId, tid: taskId },
    { did: VARCHAR, tid: VARCHAR }
  );
}
