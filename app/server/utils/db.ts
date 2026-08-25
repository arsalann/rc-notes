import { DuckDBInstance } from '@duckdb/node-api';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { getMotherDuckToken } from '~/server/utils/config';

let connectionPromise: Promise<any> | null = null;

export function resetConnection() {
  connectionPromise = null;
}

/**
 * Schema for a fresh database. Only the tables genuinely absent are created.
 */
const TABLE_DDL: Record<string, string> = {
  workspaces: `
    CREATE TABLE workspaces (
      id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
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
      id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
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
      tags VARCHAR[] NOT NULL DEFAULT [],
      position INTEGER NOT NULL DEFAULT 0,
      updated_by VARCHAR DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  notes: `
    CREATE TABLE notes (
      id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
      display_id VARCHAR NOT NULL DEFAULT '',
      user_id VARCHAR DEFAULT NULL,
      user_name VARCHAR DEFAULT NULL,
      workspace_id VARCHAR DEFAULT NULL,
      title VARCHAR NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      pinned BOOLEAN NOT NULL DEFAULT false,
      archived BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMP DEFAULT NULL,
      tags VARCHAR[] NOT NULL DEFAULT [],
      updated_by VARCHAR DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
    )`,
  links: `
    CREATE TABLE links (
      id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
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
      id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
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
  event_log: `
    CREATE TABLE event_log (
      id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
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

/**
 * Columns added to tables that already existed. Ordered oldest-first for readability only —
 * each is applied independently based on whether the column is actually present.
 *
 * IMPORTANT: no constraints. DuckDB rejects `ALTER TABLE ... ADD COLUMN ... NOT NULL` with
 * "Parser Error: Adding columns with constraints not yet supported". The previous implementation
 * wrapped every migration in `try {} catch {}`, so three `NOT NULL` columns on `workspaces`
 * (description, archived, updated_at) silently failed on every boot and were never added.
 * Keep this list constraint-free.
 */
const COLUMN_MIGRATIONS: { table: string; column: string; type: string }[] = [
  // v1: display_id
  { table: 'tasks', column: 'display_id', type: "VARCHAR DEFAULT ''" },
  { table: 'notes', column: 'display_id', type: "VARCHAR DEFAULT ''" },

  // v2: user attribution
  { table: 'workspaces', column: 'user_id', type: 'VARCHAR DEFAULT NULL' },
  { table: 'workspaces', column: 'user_name', type: 'VARCHAR DEFAULT NULL' },
  { table: 'tasks', column: 'user_id', type: 'VARCHAR DEFAULT NULL' },
  { table: 'tasks', column: 'user_name', type: 'VARCHAR DEFAULT NULL' },
  { table: 'notes', column: 'user_id', type: 'VARCHAR DEFAULT NULL' },
  { table: 'notes', column: 'user_name', type: 'VARCHAR DEFAULT NULL' },
  { table: 'links', column: 'user_id', type: 'VARCHAR DEFAULT NULL' },
  { table: 'diary_entries', column: 'user_id', type: 'VARCHAR DEFAULT NULL' },
  { table: 'diary_entries', column: 'user_name', type: 'VARCHAR DEFAULT NULL' },
  { table: 'event_log', column: 'user_id', type: 'VARCHAR DEFAULT NULL' },
  { table: 'event_log', column: 'user_name', type: 'VARCHAR DEFAULT NULL' },

  // v2: additional standard columns
  { table: 'workspaces', column: 'description', type: "TEXT DEFAULT ''" },
  { table: 'workspaces', column: 'color', type: 'VARCHAR DEFAULT NULL' },
  { table: 'workspaces', column: 'archived', type: 'BOOLEAN DEFAULT false' },
  { table: 'workspaces', column: 'updated_at', type: 'TIMESTAMP DEFAULT current_timestamp' },
  { table: 'tasks', column: 'status', type: "VARCHAR DEFAULT 'next'" },
  { table: 'tasks', column: 'priority', type: 'INTEGER DEFAULT 0' },
  { table: 'tasks', column: 'deleted_at', type: 'TIMESTAMP DEFAULT NULL' },
  { table: 'tasks', column: 'reminder_at', type: 'TIMESTAMP DEFAULT NULL' },
  { table: 'notes', column: 'deleted_at', type: 'TIMESTAMP DEFAULT NULL' },
  { table: 'diary_entries', column: 'deleted_at', type: 'TIMESTAMP DEFAULT NULL' },

  // v8: auth
  { table: 'users', column: 'password_hash', type: 'VARCHAR DEFAULT NULL' },
  { table: 'users', column: 'is_admin', type: 'BOOLEAN DEFAULT false' },
  { table: 'users', column: 'updated_at', type: 'TIMESTAMP DEFAULT current_timestamp' },

  // v11: provenance + richer event_log metadata
  { table: 'tasks', column: 'updated_by', type: 'VARCHAR DEFAULT NULL' },
  { table: 'notes', column: 'updated_by', type: 'VARCHAR DEFAULT NULL' },
  { table: 'diary_entries', column: 'updated_by', type: 'VARCHAR DEFAULT NULL' },
  { table: 'workspaces', column: 'updated_by', type: 'VARCHAR DEFAULT NULL' },
  { table: 'links', column: 'updated_by', type: 'VARCHAR DEFAULT NULL' },
  { table: 'users', column: 'updated_by', type: 'VARCHAR DEFAULT NULL' },
  { table: 'event_log', column: 'updated_by', type: 'VARCHAR DEFAULT NULL' },
  { table: 'event_log', column: 'request_body', type: 'VARCHAR DEFAULT NULL' },
  { table: 'event_log', column: 'response_status', type: 'INTEGER DEFAULT NULL' },
  { table: 'event_log', column: 'client_kind', type: 'VARCHAR DEFAULT NULL' },
  { table: 'event_log', column: 'request_ip', type: 'VARCHAR DEFAULT NULL' },
  { table: 'event_log', column: 'duration_ms', type: 'INTEGER DEFAULT NULL' },
];

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
  { name: 'idx_links_source', ddl: 'CREATE INDEX idx_links_source ON links (source_type, source_id)' },
  { name: 'idx_links_target', ddl: 'CREATE INDEX idx_links_target ON links (target_type, target_id)' },
];

/**
 * One-time DATA repairs, as opposed to schema. These mutate rows, so unlike the schema statements
 * they cannot be made safe by checking "is it already there?" — there is nothing to check. They are
 * gated on the `applied_migrations` ledger, and each name is recorded only after its statement
 * succeeds, so a transient failure retries on the next boot instead of being silently skipped.
 *
 * Every one of these ran on EVERY process start before this change. `v6_status_now` in particular
 * overwrote any task the user had manually moved back to `next`, which is a data-corruption bug, not
 * just wasted latency. See also the `v10` note in git history: a one-time cleanup that re-ran on
 * every restart and nuked a user's password.
 */
const DATA_REPAIRS: { name: string; statements: string[] }[] = [
  {
    name: 'v2_priority_not_null',
    statements: ['UPDATE tasks SET priority = 0 WHERE priority IS NULL'],
  },
  {
    name: 'v3_status_from_open',
    statements: [
      "UPDATE tasks SET status = 'done' WHERE (status = 'open' OR status IS NULL) AND completed = true",
      "UPDATE tasks SET status = 'next' WHERE (status = 'open' OR status IS NULL) AND completed = false",
    ],
  },
  {
    name: 'v5_default_workspace',
    statements: [
      "UPDATE tasks SET workspace_id = (SELECT id FROM workspaces WHERE name = 'Work' LIMIT 1) WHERE workspace_id IS NULL AND EXISTS (SELECT 1 FROM workspaces WHERE name = 'Work')",
      "UPDATE notes SET workspace_id = (SELECT id FROM workspaces WHERE name = 'Work' LIMIT 1) WHERE workspace_id IS NULL AND EXISTS (SELECT 1 FROM workspaces WHERE name = 'Work')",
      "UPDATE diary_entries SET workspace_id = (SELECT id FROM workspaces WHERE name = 'Work' LIMIT 1) WHERE workspace_id IS NULL AND EXISTS (SELECT 1 FROM workspaces WHERE name = 'Work')",
    ],
  },
  {
    name: 'v6_status_now_for_due',
    statements: [
      "UPDATE tasks SET status = 'now' WHERE due_at IS NOT NULL AND status != 'done' AND status != 'now'",
    ],
  },
  {
    name: 'v7_diary_links_for_due',
    statements: [
      // Single statement, guarded by NOT EXISTS. The original was a per-row JS loop issuing up to
      // three interpolated queries per task. This only links tasks whose diary entry already
      // exists; it no longer creates diary entries as a side effect of booting.
      `INSERT INTO links (id, source_type, source_id, target_type, target_id)
       SELECT uuid()::VARCHAR, 'diary', d.id, 'task', t.id
       FROM tasks t
       JOIN diary_entries d ON d.entry_date = t.due_at::DATE
       WHERE t.due_at IS NOT NULL AND t.parent_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM links l
           WHERE l.source_type = 'diary' AND l.target_type = 'task' AND l.target_id = t.id
         )`,
    ],
  },
  {
    // Subtasks used to be created with a hard-coded default priority of 2 (Focus) regardless of
    // their parent, so they landed in the wrong kanban lane. The create endpoint now inherits the
    // parent's priority; this repairs the rows created before that fix. Idempotent: it only touches
    // subtasks still at the buggy default (2) whose parent sits in a different lane (0/1/3), so a
    // second run matches nothing. A subtask at 0/1/3 was explicitly edited by the user (creation
    // always produced 2) and is left alone; a Focus parent (2) already matches. Applied to
    // production out-of-band with backups on 2026-08-25 and recorded in the ledger there.
    name: 'v12_subtask_priority_inherit',
    statements: [
      `UPDATE tasks
       SET priority = (SELECT p.priority FROM tasks p WHERE p.id = tasks.parent_id),
           updated_at = current_timestamp,
           updated_by = 'migration_v12_subtask_priority'
       WHERE parent_id IS NOT NULL
         AND priority = 2
         AND (SELECT p.priority FROM tasks p WHERE p.id = tasks.parent_id) IN (0, 1, 3)`,
    ],
  },
];

async function ensureSchema(connection: any) {
  const rows = async (sql: string) => (await connection.runAndReadAll(sql)).getRowObjectsJson();

  // --- 1. Read the ACTUAL schema. One round trip replaces ~45 blind ALTER statements.
  // Schema truth comes from the database, never from a stored version number: `migrate()` used to
  // swallow every error, so a version stamp would assert a state that may well be false and lock
  // any existing gap in permanently.
  let existing = await rows(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_catalog = current_database() AND table_schema = 'main'`
  );
  const columnsByTable = (list: Record<string, any>[]) => {
    const map = new Map<string, Set<string>>();
    for (const r of list) {
      const t = String(r.table_name);
      if (!map.has(t)) map.set(t, new Set());
      map.get(t)!.add(String(r.column_name));
    }
    return map;
  };
  let schema = columnsByTable(existing);

  // Was this a populated database before we touched it? Used to decide whether the one-time data
  // repairs need to run at all.
  const preExisting = schema.has('tasks');
  const ledgerIsNew = !schema.has('applied_migrations');

  // --- 2. Create only the missing tables.
  const missingTables = Object.keys(TABLE_DDL).filter(t => !schema.has(t));
  for (const t of missingTables) {
    await connection.run(TABLE_DDL[t]!);
  }
  if (missingTables.length) {
    existing = await rows(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_catalog = current_database() AND table_schema = 'main'`
    );
    schema = columnsByTable(existing);
  }

  // --- 3. Add only the genuinely absent columns. Steady state: zero statements.
  for (const m of COLUMN_MIGRATIONS) {
    const cols = schema.get(m.table);
    if (!cols || cols.has(m.column)) continue;
    try {
      await connection.run(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
      cols.add(m.column);
    } catch (e) {
      // Log rather than swallow — a silent failure here is what hid the missing `workspaces`
      // columns for months. The next boot will retry, because the check is against reality.
      console.warn(`[db] could not add ${m.table}.${m.column}:`, (e as Error)?.message);
    }
  }

  // --- 4. Create only the missing indexes.
  let indexNames = new Set<string>();
  try {
    const idx = await rows(`SELECT index_name FROM duckdb_indexes() WHERE database_name = current_database()`);
    indexNames = new Set(idx.map(r => String(r.index_name)));
  } catch {
    // duckdb_indexes() unavailable — fall back to IF NOT EXISTS for all of them.
    for (const i of INDEX_MIGRATIONS) {
      try { await connection.run(i.ddl.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ')); } catch {}
    }
    indexNames = new Set(INDEX_MIGRATIONS.map(i => i.name));
  }
  for (const i of INDEX_MIGRATIONS) {
    if (indexNames.has(i.name)) continue;
    try {
      await connection.run(i.ddl);
    } catch (e) {
      console.warn(`[db] could not create ${i.name}:`, (e as Error)?.message);
    }
  }

  // --- 5. Seed default workspaces, but only for a genuinely fresh database. Gating on "did we just
  // create the table" rather than "is it empty" avoids a round trip on every boot, and means a user
  // who deliberately deleted every workspace does not get them silently recreated.
  if (!preExisting || missingTables.includes('workspaces')) {
    await connection.run("INSERT INTO workspaces (id, name, emoji, position) VALUES (uuid()::VARCHAR, 'Personal', '🏠', 0)");
    await connection.run("INSERT INTO workspaces (id, name, emoji, position) VALUES (uuid()::VARCHAR, 'Work', '💼', 1)");
  }

  // --- 6. Data repairs, gated on the ledger.
  let applied: Set<string>;
  if (ledgerIsNew && preExisting) {
    // The ledger is new but the database is not. These repairs have demonstrably run many times
    // already (they ran on every boot). Record them as applied WITHOUT executing them — letting
    // v6_status_now run one final time would overwrite manual `status = 'next'` values one last
    // time, which is the exact bug this gating exists to stop.
    const names = DATA_REPAIRS.map(r => `('${r.name}')`).join(', ');
    await connection.run(`INSERT INTO applied_migrations (name) VALUES ${names}`);
    applied = new Set(DATA_REPAIRS.map(r => r.name));
    console.log('[db] applied_migrations ledger initialised for existing database; one-time repairs marked as done');
  } else {
    const rowsApplied = await rows('SELECT name FROM applied_migrations');
    applied = new Set(rowsApplied.map(r => String(r.name)));
  }

  for (const repair of DATA_REPAIRS) {
    if (applied.has(repair.name)) continue;
    try {
      for (const sql of repair.statements) await connection.run(sql);
      // Recorded only after every statement succeeded, so a partial/transient failure retries.
      await connection.run(`INSERT INTO applied_migrations (name) VALUES ('${repair.name}')`);
      console.log(`[db] applied one-time repair ${repair.name}`);
    } catch (e) {
      console.warn(`[db] repair ${repair.name} failed, will retry next boot:`, (e as Error)?.message);
    }
  }

  // --- 7. display_id backfill. Left un-gated on purpose: it is a genuinely idempotent
  // self-healing check that normally finds zero rows, and it is the safety net for any row that
  // slips through the create endpoints. Two SELECTs.
  for (const table of ['tasks', 'notes'] as const) {
    try {
      const empty = await rows(
        `SELECT id, title, tags FROM ${table} WHERE display_id = '' OR display_id IS NULL`
      );
      for (const row of empty) {
        const title = (row.title as string) || table.slice(0, -1);
        const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
        const prefix = title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toLowerCase().padEnd(3, 'x');
        const tagPart = tags.length
          ? (tags[0] as string).replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toLowerCase().padEnd(2, 'x')
          : 'xx';
        const displayId = prefix + tagPart + (row.id as string).slice(0, 4);
        await connection.run(
          `UPDATE ${table} SET display_id = '${displayId.replace(/'/g, "''")}' WHERE id = '${String(row.id).replace(/'/g, "''")}'`
        );
      }
    } catch (e) {
      console.warn(`[db] display_id backfill for ${table} failed:`, (e as Error)?.message);
    }
  }
}

async function connect() {
  const token = getMotherDuckToken();
  let connection;

  if (token) {
    // MotherDuck cloud mode
    // Validate token chars to prevent injection in SET command
    if (!/^[a-zA-Z0-9_\-.:=]+$/.test(token)) {
      throw new Error('Invalid MotherDuck token format');
    }
    const instance = await DuckDBInstance.create();
    connection = await instance.connect();
    await connection.run('INSTALL motherduck');
    await connection.run('LOAD motherduck');
    await connection.run(`SET motherduck_token = '${token}'`);
    await connection.run(`ATTACH 'md:'`);
    await connection.run(`CREATE DATABASE IF NOT EXISTS rc_notes`);
    await connection.run('USE rc_notes');
  } else {
    // Local file fallback
    const dataDir = resolve(process.cwd(), '..', 'data');
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const dbPath = process.env.DUCKDB_PATH || resolve(dataDir, 'notes.db');
    const instance = await DuckDBInstance.create(dbPath);
    connection = await instance.connect();
  }

  await ensureSchema(connection);
  return connection;
}

export function useDB() {
  if (!connectionPromise) {
    connectionPromise = connect().catch((err) => {
      // Never memoize a rejected promise. Previously a single transient ATTACH failure left a
      // permanently-rejected promise cached, so every subsequent request failed until the process
      // was restarted — and nothing called resetConnection() on error.
      connectionPromise = null;
      throw err;
    });
  }
  return connectionPromise;
}

export async function queryAll(
  sql: string,
  params: Record<string, any> = {},
  types?: Record<string, any>
): Promise<Record<string, any>[]> {
  const db = await useDB();
  const reader = types
    ? await db.runAndReadAll(sql, params, types)
    : await db.runAndReadAll(sql, params);
  return reader.getRowObjectsJson();
}

export async function getDefaultWorkspaceId(): Promise<string | null> {
  const rows = await queryAll(
    "SELECT id FROM workspaces WHERE name = 'Work' ORDER BY position LIMIT 1"
  );
  return rows[0]?.id || null;
}

/**
 * Find or create a diary entry for the given date, then link the task to it.
 */
export async function linkTaskToDiary(taskId: string, dueAt: string, workspaceId?: string | null) {
  const { VARCHAR } = await import('@duckdb/node-api');
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
    const vals = ['uuid()::VARCHAR', '$date::DATE', "''"];
    const p: Record<string, any> = { date: dateStr };
    const t: Record<string, any> = { date: VARCHAR };
    if (wsId) {
      cols.push('workspace_id');
      vals.push('$ws');
      p.ws = wsId;
      t.ws = VARCHAR;
    }
    diaryRows = await queryAll(
      `INSERT INTO diary_entries (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id`,
      p, t
    );
  }

  if (!diaryRows.length) return;
  const diaryId = diaryRows[0].id;

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
     SELECT uuid()::VARCHAR, 'diary', $did, 'task', $tid
     WHERE NOT EXISTS (
       SELECT 1 FROM links WHERE source_type = 'diary' AND source_id = $did AND target_type = 'task' AND target_id = $tid
     )`,
    { did: diaryId, tid: taskId },
    { did: VARCHAR, tid: VARCHAR }
  );
}

export async function execute(sql: string, params: Record<string, any> = {}, types?: Record<string, any>) {
  const db = await useDB();
  if (types) {
    await db.run(sql, params, types);
  } else {
    await db.run(sql, params);
  }
}
