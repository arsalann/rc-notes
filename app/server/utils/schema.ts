/**
 * Postgres schema + boot-time schema check. Plain module (relative imports only) so the
 * `scripts/` tools can create the schema outside Nitro.
 *
 * Timestamps are `TIMESTAMP` (no time zone) holding UTC wall time: every connection sets
 * `TIME ZONE 'UTC'`, so `current_timestamp` / `now()` write UTC. Clients parse them as UTC.
 */

/** Runs one statement with positional parameters and returns its rows. */
export type Run = (sql: string, values?: any[]) => Promise<Record<string, any>[]>;

export const TABLE_DDL: Record<string, string> = {
  workspaces: `
    CREATE TABLE workspaces (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR DEFAULT NULL,
      user_name VARCHAR DEFAULT NULL,
      name VARCHAR NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      emoji VARCHAR NOT NULL DEFAULT '',
      color VARCHAR DEFAULT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      archived BOOLEAN NOT NULL DEFAULT false,
      updated_by VARCHAR DEFAULT NULL,
      created_device_kind VARCHAR DEFAULT NULL,
      created_device_id VARCHAR DEFAULT NULL,
      updated_device_kind VARCHAR DEFAULT NULL,
      updated_device_id VARCHAR DEFAULT NULL,
      client_updated_at TIMESTAMP DEFAULT NULL,
      sync_op_id VARCHAR DEFAULT NULL,
      field_clock JSONB NOT NULL DEFAULT '{}',
      sync_seq BIGINT NOT NULL DEFAULT nextval('sync_seq'),
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  tasks: `
    CREATE TABLE tasks (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      display_id VARCHAR NOT NULL DEFAULT '',
      user_id VARCHAR DEFAULT NULL,
      user_name VARCHAR DEFAULT NULL,
      workspace_id VARCHAR DEFAULT NULL,
      parent_id VARCHAR DEFAULT NULL,
      title VARCHAR NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status VARCHAR DEFAULT 'next',
      priority INTEGER NOT NULL DEFAULT 0,
      completed BOOLEAN NOT NULL DEFAULT false,
      completed_at TIMESTAMP DEFAULT NULL,
      pinned BOOLEAN NOT NULL DEFAULT false,
      archived BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMP DEFAULT NULL,
      due_at TIMESTAMP DEFAULT NULL,
      reminder_at TIMESTAMP DEFAULT NULL,
      tags VARCHAR[] NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      updated_by VARCHAR DEFAULT NULL,
      created_device_kind VARCHAR DEFAULT NULL,
      created_device_id VARCHAR DEFAULT NULL,
      updated_device_kind VARCHAR DEFAULT NULL,
      updated_device_id VARCHAR DEFAULT NULL,
      client_updated_at TIMESTAMP DEFAULT NULL,
      sync_op_id VARCHAR DEFAULT NULL,
      field_clock JSONB NOT NULL DEFAULT '{}',
      sync_seq BIGINT NOT NULL DEFAULT nextval('sync_seq'),
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  notes: `
    CREATE TABLE notes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      display_id VARCHAR NOT NULL DEFAULT '',
      user_id VARCHAR DEFAULT NULL,
      user_name VARCHAR DEFAULT NULL,
      workspace_id VARCHAR DEFAULT NULL,
      title VARCHAR NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      pinned BOOLEAN NOT NULL DEFAULT false,
      archived BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMP DEFAULT NULL,
      tags VARCHAR[] NOT NULL DEFAULT '{}',
      updated_by VARCHAR DEFAULT NULL,
      created_device_kind VARCHAR DEFAULT NULL,
      created_device_id VARCHAR DEFAULT NULL,
      updated_device_kind VARCHAR DEFAULT NULL,
      updated_device_id VARCHAR DEFAULT NULL,
      client_updated_at TIMESTAMP DEFAULT NULL,
      sync_op_id VARCHAR DEFAULT NULL,
      field_clock JSONB NOT NULL DEFAULT '{}',
      sync_seq BIGINT NOT NULL DEFAULT nextval('sync_seq'),
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  links: `
    CREATE TABLE links (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR DEFAULT NULL,
      source_type VARCHAR NOT NULL,
      source_id VARCHAR NOT NULL,
      target_type VARCHAR NOT NULL,
      target_id VARCHAR NOT NULL,
      updated_by VARCHAR DEFAULT NULL,
      created_device_kind VARCHAR DEFAULT NULL,
      created_device_id VARCHAR DEFAULT NULL,
      updated_device_kind VARCHAR DEFAULT NULL,
      updated_device_id VARCHAR DEFAULT NULL,
      client_updated_at TIMESTAMP DEFAULT NULL,
      sync_op_id VARCHAR DEFAULT NULL,
      field_clock JSONB NOT NULL DEFAULT '{}',
      sync_seq BIGINT NOT NULL DEFAULT nextval('sync_seq'),
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  diary_entries: `
    CREATE TABLE diary_entries (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR DEFAULT NULL,
      user_name VARCHAR DEFAULT NULL,
      workspace_id VARCHAR DEFAULT NULL,
      entry_date DATE NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      deleted_at TIMESTAMP DEFAULT NULL,
      updated_by VARCHAR DEFAULT NULL,
      created_device_kind VARCHAR DEFAULT NULL,
      created_device_id VARCHAR DEFAULT NULL,
      updated_device_kind VARCHAR DEFAULT NULL,
      updated_device_id VARCHAR DEFAULT NULL,
      client_updated_at TIMESTAMP DEFAULT NULL,
      sync_op_id VARCHAR DEFAULT NULL,
      field_clock JSONB NOT NULL DEFAULT '{}',
      sync_seq BIGINT NOT NULL DEFAULT nextval('sync_seq'),
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  goals_weekly: `
    CREATE TABLE goals_weekly (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR DEFAULT NULL,
      user_name VARCHAR DEFAULT NULL,
      workspace_id VARCHAR DEFAULT NULL,
      week_start DATE NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      deleted_at TIMESTAMP DEFAULT NULL,
      updated_by VARCHAR DEFAULT NULL,
      created_device_kind VARCHAR DEFAULT NULL,
      created_device_id VARCHAR DEFAULT NULL,
      updated_device_kind VARCHAR DEFAULT NULL,
      updated_device_id VARCHAR DEFAULT NULL,
      client_updated_at TIMESTAMP DEFAULT NULL,
      sync_op_id VARCHAR DEFAULT NULL,
      field_clock JSONB NOT NULL DEFAULT '{}',
      sync_seq BIGINT NOT NULL DEFAULT nextval('sync_seq'),
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  event_log: `
    CREATE TABLE event_log (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR DEFAULT NULL,
      user_name VARCHAR DEFAULT NULL,
      event_type VARCHAR NOT NULL,
      method VARCHAR NOT NULL,
      path VARCHAR NOT NULL,
      entity_type VARCHAR,
      entity_id VARCHAR,
      workspace_id VARCHAR,
      metadata TEXT DEFAULT '{}',
      user_agent VARCHAR,
      updated_by VARCHAR DEFAULT NULL,
      request_body VARCHAR DEFAULT NULL,
      response_status INTEGER DEFAULT NULL,
      client_kind VARCHAR DEFAULT NULL,
      request_ip VARCHAR DEFAULT NULL,
      duration_ms INTEGER DEFAULT NULL,
      device_id VARCHAR DEFAULT NULL,
      sync_op_id VARCHAR DEFAULT NULL,
      client_time TIMESTAMP DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  users: `
    CREATE TABLE users (
      id VARCHAR PRIMARY KEY,
      username VARCHAR NOT NULL,
      password_hash VARCHAR DEFAULT NULL,
      is_admin BOOLEAN DEFAULT false,
      updated_by VARCHAR DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP DEFAULT current_timestamp
    )`,
  applied_migrations: `
    CREATE TABLE applied_migrations (
      name VARCHAR PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  sync_tombstones: `
    CREATE TABLE sync_tombstones (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      table_name VARCHAR NOT NULL,
      row_id VARCHAR NOT NULL,
      updated_device_kind VARCHAR DEFAULT NULL,
      updated_device_id VARCHAR DEFAULT NULL,
      sync_op_id VARCHAR DEFAULT NULL,
      sync_seq BIGINT NOT NULL DEFAULT nextval('sync_seq'),
      deleted_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      row_data JSONB DEFAULT NULL
    )`,
  sync_ops: `
    CREATE TABLE sync_ops (
      op_id VARCHAR PRIMARY KEY,
      user_id VARCHAR DEFAULT NULL,
      device_id VARCHAR DEFAULT NULL,
      method VARCHAR NOT NULL,
      path VARCHAR NOT NULL,
      status INTEGER NOT NULL,
      response TEXT DEFAULT NULL,
      client_time TIMESTAMP DEFAULT NULL,
      received_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  task_templates: `
    CREATE TABLE task_templates (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR DEFAULT NULL,
      user_name VARCHAR DEFAULT NULL,
      workspace_id VARCHAR DEFAULT NULL,
      name VARCHAR NOT NULL,
      title VARCHAR NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 2,
      tags VARCHAR[] NOT NULL DEFAULT '{}',
      subtasks JSONB NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0,
      deleted_at TIMESTAMP DEFAULT NULL,
      updated_by VARCHAR DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  tag_settings: `
    CREATE TABLE tag_settings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR DEFAULT NULL,
      tag_key VARCHAR NOT NULL,
      label VARCHAR DEFAULT NULL,
      emoji VARCHAR DEFAULT NULL,
      archived BOOLEAN NOT NULL DEFAULT false,
      updated_by VARCHAR DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
};

/**
 * Tables the iOS app keeps a local copy of. Each carries the sync columns below, a row trigger that
 * maintains them, and a delete trigger that records a tombstone. See `SYNC_TRIGGER_SQL`.
 *
 * - `sync_seq`: a global, ever-increasing number stamped on every insert and update; clients pull
 *   "everything after N".
 * - `field_clock`: per field, when the edit that wrote it was made (JSON, `{"title": "2026-…"}`).
 *   An edit older than the field's clock is dropped for that field: last writer wins per field.
 * - `created_device_*` / `updated_device_*`: the client kind (`ios`, `browser`, …) and device id.
 * - `client_updated_at`: when the last edit was made on the device (device clock, capped at the
 *   server's receive time). For online writes it equals the write time.
 * - `sync_op_id`: id of the queued change (`sync_ops.op_id`) that last wrote the row, if any.
 */
export const SYNCED_TABLES = ['workspaces', 'tasks', 'notes', 'links', 'diary_entries', 'goals_weekly'] as const;

/** Tables holding app data, in copy order for `scripts/migrate-motherduck-to-postgres.ts`. */
export const DATA_TABLES = [
  'users', 'workspaces', 'tasks', 'notes', 'links', 'diary_entries', 'goals_weekly', 'event_log',
  'applied_migrations',
] as const;

/**
 * Columns added to tables that already exist. Each is applied only if the column is actually
 * missing. Empty since the move to Postgres: `TABLE_DDL` above already has every column the
 * DuckDB-era migrations added. Append new columns here AND to `TABLE_DDL`.
 */
const SYNC_COLUMNS: { column: string; type: string }[] = [
  { column: 'created_device_kind', type: 'VARCHAR DEFAULT NULL' },
  { column: 'created_device_id', type: 'VARCHAR DEFAULT NULL' },
  { column: 'updated_device_kind', type: 'VARCHAR DEFAULT NULL' },
  { column: 'updated_device_id', type: 'VARCHAR DEFAULT NULL' },
  { column: 'client_updated_at', type: 'TIMESTAMP DEFAULT NULL' },
  { column: 'sync_op_id', type: 'VARCHAR DEFAULT NULL' },
  { column: 'field_clock', type: "JSONB NOT NULL DEFAULT '{}'" },
  // Existing rows get numbered by the default, in no particular order; a first pull takes them all.
  { column: 'sync_seq', type: "BIGINT NOT NULL DEFAULT nextval('sync_seq')" },
];

const COLUMN_MIGRATIONS: { table: string; column: string; type: string }[] = [
  ...SYNCED_TABLES.flatMap(table => SYNC_COLUMNS.map(c => ({ table, ...c }))),
  { table: 'event_log', column: 'device_id', type: 'VARCHAR DEFAULT NULL' },
  { table: 'event_log', column: 'sync_op_id', type: 'VARCHAR DEFAULT NULL' },
  { table: 'event_log', column: 'client_time', type: 'TIMESTAMP DEFAULT NULL' },
  { table: 'sync_tombstones', column: 'row_data', type: 'JSONB DEFAULT NULL' },
];

/**
 * Columns the per-field clock ignores: identity, bookkeeping, and server-generated values.
 * Everything else is a field a person edits.
 */
const CLOCK_EXEMPT_COLUMNS = [
  'id', 'sync_seq', 'field_clock', 'updated_at', 'updated_by', 'created_at', 'created_device_kind',
  'created_device_id', 'updated_device_kind', 'updated_device_id', 'client_updated_at', 'sync_op_id',
  'display_id', 'user_id', 'user_name',
];

/**
 * Row triggers for the synced tables. The server sets these per-connection settings before a write
 * (see `db.ts`), and the trigger reads them, so every write path is covered without each endpoint
 * knowing about sync:
 *
 * - `daybook.op_time`: when the edit was made (UTC). Empty = now.
 * - `daybook.device_kind` / `daybook.device_id`: who made it.
 * - `daybook.op_id`: the queued change it came from, if any.
 * - `daybook.updated_by`: provenance, used when the statement does not set `updated_by` itself.
 *
 * On UPDATE, every changed field is compared with its clock: if a newer edit already wrote that
 * field, this edit's value is dropped for it (last writer wins, per field). `status`, `completed`
 * and `completed_at` share one clock so they never disagree. If every field of an edit is dropped,
 * the row stays exactly as it was.
 */
const SYNC_ROW_FUNCTION = `
CREATE OR REPLACE FUNCTION daybook_sync_row() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  ctx_time text := NULLIF(current_setting('daybook.op_time', true), '');
  op_time timestamp := COALESCE(ctx_time::timestamp, now()::timestamp);
  ctx_kind text := NULLIF(current_setting('daybook.device_kind', true), '');
  ctx_device text := NULLIF(current_setting('daybook.device_id', true), '');
  ctx_op text := NULLIF(current_setting('daybook.op_id', true), '');
  ctx_by text := NULLIF(current_setting('daybook.updated_by', true), '');
  stamp text := to_char(op_time, 'YYYY-MM-DD HH24:MI:SS.US');
  old_row jsonb;
  new_row jsonb;
  clock jsonb;
  k text;
  clock_key text;
  applied int := 0;
  dropped int := 0;
BEGIN
  NEW.sync_seq := nextval('sync_seq');
  IF TG_OP = 'INSERT' THEN
    NEW.created_device_kind := COALESCE(NEW.created_device_kind, ctx_kind);
    NEW.created_device_id := COALESCE(NEW.created_device_id, ctx_device);
    NEW.updated_device_kind := ctx_kind;
    NEW.updated_device_id := ctx_device;
    NEW.client_updated_at := op_time;
    NEW.sync_op_id := ctx_op;
    IF NEW.updated_by IS NULL THEN NEW.updated_by := ctx_by; END IF;
    RETURN NEW;
  END IF;

  old_row := to_jsonb(OLD);
  new_row := to_jsonb(NEW);
  clock := COALESCE(NEW.field_clock, '{}'::jsonb);
  FOR k IN
    SELECT key FROM jsonb_each(new_row)
    WHERE NOT (key = ANY (ARRAY[${CLOCK_EXEMPT_COLUMNS.map(c => `'${c}'`).join(', ')}]))
      AND (new_row -> key) IS DISTINCT FROM (old_row -> key)
  LOOP
    clock_key := CASE WHEN k IN ('completed', 'completed_at') THEN 'status' ELSE k END;
    IF (clock ->> clock_key) IS NOT NULL AND (clock ->> clock_key)::timestamp > op_time THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(k, old_row -> k));
      dropped := dropped + 1;
    ELSE
      clock := clock || jsonb_build_object(clock_key, stamp);
      applied := applied + 1;
    END IF;
  END LOOP;

  IF applied = 0 AND dropped > 0 THEN
    -- Every field this edit touched was edited more recently elsewhere: keep the row as it was.
    NEW := jsonb_populate_record(NEW, old_row - 'sync_seq');
    RETURN NEW;
  END IF;

  NEW.field_clock := clock;
  NEW.updated_device_kind := ctx_kind;
  NEW.updated_device_id := ctx_device;
  NEW.client_updated_at := op_time;
  NEW.sync_op_id := ctx_op;
  IF ctx_by IS NOT NULL AND NEW.updated_by IS NOT DISTINCT FROM OLD.updated_by THEN
    NEW.updated_by := ctx_by;
  END IF;
  RETURN NEW;
END
$fn$`;

/**
 * Hard deletes (links, and tasks deleted in bulk) leave a tombstone so clients drop their copy. The
 * tombstone keeps the deleted row as JSON (`row_data`): the way back if a delete was a mistake.
 */
const SYNC_TOMBSTONE_FUNCTION = `
CREATE OR REPLACE FUNCTION daybook_sync_tombstone() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO sync_tombstones (table_name, row_id, updated_device_kind, updated_device_id, sync_op_id, row_data)
  VALUES (TG_TABLE_NAME, OLD.id,
    NULLIF(current_setting('daybook.device_kind', true), ''),
    NULLIF(current_setting('daybook.device_id', true), ''),
    NULLIF(current_setting('daybook.op_id', true), ''),
    to_jsonb(OLD));
  RETURN OLD;
END
$fn$`;

/** The body between the `$fn$` markers, as `pg_proc.prosrc` stores it. */
function functionBody(ddl: string): string {
  return ddl.slice(ddl.indexOf('$fn$') + 4, ddl.lastIndexOf('$fn$'));
}

const INDEX_MIGRATIONS: { name: string; ddl: string }[] = [
  { name: 'idx_users_username', ddl: 'CREATE UNIQUE INDEX idx_users_username ON users (username)' },
  { name: 'idx_tasks_workspace', ddl: 'CREATE INDEX idx_tasks_workspace ON tasks (workspace_id)' },
  { name: 'idx_tasks_parent', ddl: 'CREATE INDEX idx_tasks_parent ON tasks (parent_id)' },
  { name: 'idx_tasks_archived', ddl: 'CREATE INDEX idx_tasks_archived ON tasks (archived, completed)' },
  { name: 'idx_tasks_due', ddl: 'CREATE INDEX idx_tasks_due ON tasks (due_at)' },
  { name: 'idx_tasks_display_id', ddl: 'CREATE INDEX idx_tasks_display_id ON tasks (display_id)' },
  { name: 'idx_notes_workspace', ddl: 'CREATE INDEX idx_notes_workspace ON notes (workspace_id)' },
  { name: 'idx_notes_archived', ddl: 'CREATE INDEX idx_notes_archived ON notes (archived)' },
  { name: 'idx_notes_display_id', ddl: 'CREATE INDEX idx_notes_display_id ON notes (display_id)' },
  { name: 'idx_diary_date', ddl: 'CREATE INDEX idx_diary_date ON diary_entries (entry_date)' },
  { name: 'idx_diary_workspace', ddl: 'CREATE INDEX idx_diary_workspace ON diary_entries (workspace_id)' },
  { name: 'idx_goals_week', ddl: 'CREATE INDEX idx_goals_week ON goals_weekly (week_start)' },
  { name: 'idx_goals_workspace', ddl: 'CREATE INDEX idx_goals_workspace ON goals_weekly (workspace_id)' },
  { name: 'idx_links_source', ddl: 'CREATE INDEX idx_links_source ON links (source_type, source_id)' },
  { name: 'idx_links_target', ddl: 'CREATE INDEX idx_links_target ON links (target_type, target_id)' },
  { name: 'idx_event_log_created', ddl: 'CREATE INDEX idx_event_log_created ON event_log (created_at)' },
  ...SYNCED_TABLES.map(t => ({ name: `idx_${t}_sync_seq`, ddl: `CREATE INDEX idx_${t}_sync_seq ON ${t} (sync_seq)` })),
  { name: 'idx_sync_tombstones_seq', ddl: 'CREATE INDEX idx_sync_tombstones_seq ON sync_tombstones (sync_seq)' },
  { name: 'idx_sync_ops_received', ddl: 'CREATE INDEX idx_sync_ops_received ON sync_ops (received_at)' },
  { name: 'idx_tag_settings_key', ddl: 'CREATE UNIQUE INDEX idx_tag_settings_key ON tag_settings (tag_key)' },
];

/**
 * One-time repairs that ran against the DuckDB/MotherDuck database before the move to Postgres.
 * They are applied in production and recorded in its `applied_migrations` ledger, which the data
 * migration copies over. A fresh database has nothing to repair, so they are only ever recorded,
 * never run. Their SQL is in git history (`app/server/utils/db.ts` before the Postgres move).
 */
const HISTORICAL_REPAIRS = [
  'v2_priority_not_null', 'v3_status_from_open', 'v5_default_workspace', 'v6_status_now_for_due',
  'v7_diary_links_for_due', 'v12_subtask_priority_inherit', 'v13_daybook_carry_forward_repair',
  'v14_restore_sep14_diary_from_event_log', 'v15_restore_corrupted_diary_copies',
];

/**
 * One-time DATA repairs (as opposed to schema), gated on the `applied_migrations` ledger. Each name
 * is recorded only after its statements succeed, so a transient failure retries on the next boot.
 * See AGENTS.md "Retroactive data fixes" for the procedure (backups, fixture test, provenance).
 * A fresh database records these as applied without running them.
 */
const DATA_REPAIRS: { name: string; statements: string[] }[] = [];

export const RLS_TABLES = Object.keys(TABLE_DDL);

export async function ensureSchema(run: Run, opts: { seed?: boolean } = {}) {
  const seed = opts.seed ?? true;
  const columnsByTable = async () => {
    const rows = await run(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`
    );
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      const t = String(r.table_name);
      if (!map.has(t)) map.set(t, new Set());
      map.get(t)!.add(String(r.column_name));
    }
    return map;
  };

  // --- 1. Read the ACTUAL schema; never trust a stored version number.
  let schema = await columnsByTable();
  const preExisting = schema.has('tasks');
  const ledgerIsNew = !schema.has('applied_migrations');

  // --- 2. Create only the missing tables (after the sequence their `sync_seq` default uses).
  await run('CREATE SEQUENCE IF NOT EXISTS sync_seq');
  const missingTables = Object.keys(TABLE_DDL).filter(t => !schema.has(t));
  for (const t of missingTables) await run(TABLE_DDL[t]!);
  if (missingTables.length) schema = await columnsByTable();

  // --- 3. Add only the genuinely absent columns. Steady state: zero statements.
  for (const m of COLUMN_MIGRATIONS) {
    const cols = schema.get(m.table);
    if (!cols || cols.has(m.column)) continue;
    try {
      await run(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
      cols.add(m.column);
    } catch (e) {
      console.warn(`[db] could not add ${m.table}.${m.column}:`, (e as Error)?.message);
    }
  }

  // --- 3b. Sync triggers: (re)install the functions only when their body changed, and the
  // triggers only where missing.
  for (const ddl of [SYNC_ROW_FUNCTION, SYNC_TOMBSTONE_FUNCTION]) {
    const name = ddl.match(/FUNCTION (\w+)\(/)![1]!;
    const current = await run('SELECT prosrc FROM pg_proc WHERE proname = $1', [name]);
    if (current[0]?.prosrc !== functionBody(ddl)) await run(ddl);
  }
  const triggers = new Set(
    (await run(`SELECT tgname, c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                WHERE NOT t.tgisinternal`)).map(r => `${r.relname}.${r.tgname}`)
  );
  for (const table of SYNCED_TABLES) {
    if (!triggers.has(`${table}.daybook_sync_row`)) {
      await run(`CREATE TRIGGER daybook_sync_row BEFORE INSERT OR UPDATE ON ${table}
                 FOR EACH ROW EXECUTE FUNCTION daybook_sync_row()`);
    }
    if (!triggers.has(`${table}.daybook_sync_tombstone`)) {
      await run(`CREATE TRIGGER daybook_sync_tombstone AFTER DELETE ON ${table}
                 FOR EACH ROW EXECUTE FUNCTION daybook_sync_tombstone()`);
    }
  }

  // --- 4. Create only the missing indexes.
  const idx = await run(`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`);
  const indexNames = new Set(idx.map(r => String(r.indexname)));
  for (const i of INDEX_MIGRATIONS) {
    if (indexNames.has(i.name)) continue;
    try {
      await run(i.ddl);
    } catch (e) {
      console.warn(`[db] could not create ${i.name}:`, (e as Error)?.message);
    }
  }

  // --- 5. Row level security with no policies. The server connects as the table owner, which
  // bypasses RLS; Supabase's public REST API (anon/authenticated roles) sees nothing.
  const rls = await run(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND c.relkind = 'r' AND NOT c.relrowsecurity`
  );
  for (const r of rls) {
    const table = String(r.relname);
    if (RLS_TABLES.includes(table)) await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  }

  // --- 6. Seed default workspaces, but only when the table was just created.
  if (seed && missingTables.includes('workspaces')) {
    await run("INSERT INTO workspaces (name, emoji, position) VALUES ('Personal', '🏠', 0), ('Work', '💼', 1)");
  }

  // --- 7. Data repairs, gated on the ledger.
  let applied: Set<string>;
  if (ledgerIsNew || !preExisting) {
    // Fresh database (or one whose ledger predates nothing): nothing to repair. Record everything.
    const names = [...HISTORICAL_REPAIRS, ...DATA_REPAIRS.map(r => r.name)];
    await run(
      `INSERT INTO applied_migrations (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING`,
      [names]
    );
    applied = new Set(names);
  } else {
    applied = new Set((await run('SELECT name FROM applied_migrations')).map(r => String(r.name)));
  }
  for (const repair of DATA_REPAIRS) {
    if (applied.has(repair.name)) continue;
    try {
      for (const sql of repair.statements) await run(sql);
      await run('INSERT INTO applied_migrations (name) VALUES ($1)', [repair.name]);
      console.log(`[db] applied one-time repair ${repair.name}`);
    } catch (e) {
      console.warn(`[db] repair ${repair.name} failed, will retry next boot:`, (e as Error)?.message);
    }
  }

  // --- 8. display_id backfill. Un-gated on purpose: an idempotent self-healing check that normally
  // finds zero rows, and the safety net for any row that slips through the create endpoints.
  for (const table of ['tasks', 'notes'] as const) {
    try {
      const empty = await run(`SELECT id, title, tags FROM ${table} WHERE display_id = '' OR display_id IS NULL`);
      for (const row of empty) {
        const title = (row.title as string) || table.slice(0, -1);
        const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
        const prefix = title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toLowerCase().padEnd(3, 'x');
        const tagPart = tags.length
          ? (tags[0] as string).replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toLowerCase().padEnd(2, 'x')
          : 'xx';
        await run(`UPDATE ${table} SET display_id = $1 WHERE id = $2`, [prefix + tagPart + String(row.id).slice(0, 4), row.id]);
      }
    } catch (e) {
      console.warn(`[db] display_id backfill for ${table} failed:`, (e as Error)?.message);
    }
  }
}
