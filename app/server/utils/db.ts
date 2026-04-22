import { DuckDBInstance } from '@duckdb/node-api';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { getMotherDuckToken } from '~/server/utils/config';

let connectionPromise: Promise<any> | null = null;

export function resetConnection() {
  connectionPromise = null;
}

export function useDB() {
  if (!connectionPromise) {
    connectionPromise = (async () => {
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

      // --- Schema ---

      await connection.run(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
          user_id VARCHAR DEFAULT NULL,
          user_name VARCHAR DEFAULT NULL,
          name VARCHAR NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          emoji VARCHAR NOT NULL DEFAULT '',
          color VARCHAR DEFAULT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          archived BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
          updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS tasks (
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
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
          updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS notes (
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
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
          updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS links (
          id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
          user_id VARCHAR DEFAULT NULL,
          source_type VARCHAR NOT NULL,
          source_id VARCHAR NOT NULL,
          target_type VARCHAR NOT NULL,
          target_id VARCHAR NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS diary_entries (
          id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
          user_id VARCHAR DEFAULT NULL,
          user_name VARCHAR DEFAULT NULL,
          workspace_id VARCHAR DEFAULT NULL,
          entry_date DATE NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          deleted_at TIMESTAMP DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
          updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS event_log (
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
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR PRIMARY KEY,
          username VARCHAR NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      // --- Migrations (for existing databases) ---
      const migrate = async (sql: string) => { try { await connection.run(sql); } catch {} };

      // v1: display_id
      await migrate("ALTER TABLE tasks ADD COLUMN display_id VARCHAR DEFAULT ''");
      await migrate("ALTER TABLE notes ADD COLUMN display_id VARCHAR DEFAULT ''");

      // v2: user_id, user_name on all tables
      await migrate("ALTER TABLE workspaces ADD COLUMN user_id VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE workspaces ADD COLUMN user_name VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE tasks ADD COLUMN user_id VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE tasks ADD COLUMN user_name VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE notes ADD COLUMN user_id VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE notes ADD COLUMN user_name VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE links ADD COLUMN user_id VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE diary_entries ADD COLUMN user_id VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE diary_entries ADD COLUMN user_name VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE event_log ADD COLUMN user_id VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE event_log ADD COLUMN user_name VARCHAR DEFAULT NULL");

      // v2: additional standard columns
      await migrate("ALTER TABLE workspaces ADD COLUMN description TEXT NOT NULL DEFAULT ''");
      await migrate("ALTER TABLE workspaces ADD COLUMN color VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE workspaces ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false");
      await migrate("ALTER TABLE workspaces ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp");
      await migrate("ALTER TABLE tasks ADD COLUMN status VARCHAR DEFAULT 'next'");
      await migrate("ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0");
      await migrate("ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL");
      await migrate("ALTER TABLE tasks ADD COLUMN reminder_at TIMESTAMP DEFAULT NULL");
      await migrate("ALTER TABLE notes ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL");
      await migrate("ALTER TABLE diary_entries ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL");

      // v3: ensure status column exists (retry without NOT NULL constraint if needed)
      await migrate("ALTER TABLE tasks ADD COLUMN status VARCHAR DEFAULT 'next'");
      // backfill status from 'open' to 'next'/'done'
      await migrate("UPDATE tasks SET status = 'done' WHERE (status = 'open' OR status IS NULL) AND completed = true");
      await migrate("UPDATE tasks SET status = 'next' WHERE (status = 'open' OR status IS NULL) AND completed = false");

      // Backfill empty display_ids with a short id derived from existing data
      const emptyTasks = await connection.runAndReadAll(
        "SELECT id, title, tags, parent_id FROM tasks WHERE display_id = '' OR display_id IS NULL"
      );
      for (const row of emptyTasks.getRowObjectsJson()) {
        const title = (row.title as string) || 'task';
        const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
        const prefix = title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toLowerCase().padEnd(3, 'x');
        const tagPart = tags.length ? (tags[0] as string).replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toLowerCase().padEnd(2, 'x') : 'xx';
        const shortId = (row.id as string).slice(0, 4);
        const displayId = prefix + tagPart + shortId;
        await connection.run(`UPDATE tasks SET display_id = '${displayId}' WHERE id = '${row.id}'`);
      }

      const emptyNotes = await connection.runAndReadAll(
        "SELECT id, title, tags FROM notes WHERE display_id = '' OR display_id IS NULL"
      );
      for (const row of emptyNotes.getRowObjectsJson()) {
        const title = (row.title as string) || 'note';
        const tags: string[] = Array.isArray(row.tags) ? row.tags : [];
        const prefix = title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toLowerCase().padEnd(3, 'x');
        const tagPart = tags.length ? (tags[0] as string).replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toLowerCase().padEnd(2, 'x') : 'xx';
        const shortId = (row.id as string).slice(0, 4);
        const displayId = prefix + tagPart + shortId;
        await connection.run(`UPDATE notes SET display_id = '${displayId}' WHERE id = '${row.id}'`);
      }

      // Seed default workspaces if empty
      const wsCount = await connection.runAndReadAll('SELECT count(*)::INTEGER as c FROM workspaces');
      const count = wsCount.getRowObjectsJson()[0]?.c;
      if (count === 0) {
        await connection.run("INSERT INTO workspaces (id, name, emoji, position) VALUES (uuid()::VARCHAR, 'Personal', '🏠', 0)");
        await connection.run("INSERT INTO workspaces (id, name, emoji, position) VALUES (uuid()::VARCHAR, 'Work', '💼', 1)");
      }

      // v4: (legacy) user_id backfill — previously used config.json, now handled by setup flow

      // v8: auth — add password_hash, is_admin, updated_at to users table
      await migrate("ALTER TABLE users ADD COLUMN password_hash VARCHAR DEFAULT NULL");
      await migrate("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false");
      await migrate("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT current_timestamp");

      // v9: unique username constraint
      await migrate("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)");

      // v10: removed — was a one-time legacy cleanup that ran on every restart, nuking the password

      // v5: backfill tasks/notes/diary with no workspace to "Work"
      const workWs = await connection.runAndReadAll("SELECT id FROM workspaces WHERE name = 'Work' LIMIT 1");
      const workWsId = workWs.getRowObjectsJson()[0]?.id;
      if (workWsId) {
        await migrate(`UPDATE tasks SET workspace_id = '${workWsId}' WHERE workspace_id IS NULL`);
        await migrate(`UPDATE notes SET workspace_id = '${workWsId}' WHERE workspace_id IS NULL`);
        await migrate(`UPDATE diary_entries SET workspace_id = '${workWsId}' WHERE workspace_id IS NULL`);
      }

      // v6: auto-set status to 'now' for tasks with a due date that aren't done
      await migrate(`UPDATE tasks SET status = 'now' WHERE due_at IS NOT NULL AND status != 'done' AND status != 'now'`);

      // v7: backfill diary links for tasks with due dates that aren't already linked
      try {
        const unlinkedTasks = await connection.runAndReadAll(`
          SELECT t.id, t.due_at, t.workspace_id
          FROM tasks t
          WHERE t.due_at IS NOT NULL
            AND t.parent_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM links l
              WHERE l.target_type = 'task' AND l.target_id = t.id
                AND l.source_type = 'diary'
            )
        `);
        const rows = unlinkedTasks.getRowObjectsJson();
        for (const task of rows) {
          const dateStr = String(task.due_at).slice(0, 10);
          // Find or create diary entry
          let diaryResult = await connection.runAndReadAll(
            `SELECT id FROM diary_entries WHERE entry_date = '${dateStr}'::DATE LIMIT 1`
          );
          let diaryRows = diaryResult.getRowObjectsJson();
          if (!diaryRows.length) {
            const wsClause = task.workspace_id ? `'${task.workspace_id}'` : 'NULL';
            diaryResult = await connection.runAndReadAll(
              `INSERT INTO diary_entries (id, entry_date, content, workspace_id)
               VALUES (uuid()::VARCHAR, '${dateStr}'::DATE, '', ${wsClause}) RETURNING id`
            );
            diaryRows = diaryResult.getRowObjectsJson();
          }
          if (diaryRows.length) {
            await connection.run(
              `INSERT INTO links (id, source_type, source_id, target_type, target_id)
               VALUES (uuid()::VARCHAR, 'diary', '${diaryRows[0].id}', 'task', '${task.id}')`
            );
          }
        }
      } catch (e) {
        console.warn('v7 diary link backfill warning:', e);
      }

      // --- Indexes for query performance ---
      await migrate("CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks (workspace_id)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (parent_id)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks (archived, completed)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_at)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_tasks_display_id ON tasks (display_id)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_notes_workspace ON notes (workspace_id)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes (archived)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_notes_display_id ON notes (display_id)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_diary_date ON diary_entries (entry_date)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_diary_workspace ON diary_entries (workspace_id)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_links_source ON links (source_type, source_id)");
      await migrate("CREATE INDEX IF NOT EXISTS idx_links_target ON links (target_type, target_id)");

      return connection;
    })();
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

  // Find existing diary entry for this date
  let diaryRows = await queryAll(
    'SELECT id FROM diary_entries WHERE entry_date = $date::DATE LIMIT 1',
    { date: dateStr }, { date: VARCHAR }
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
