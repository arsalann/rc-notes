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
};

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
const COLUMN_MIGRATIONS: { table: string; column: string; type: string }[] = [];

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

  // --- 2. Create only the missing tables.
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
