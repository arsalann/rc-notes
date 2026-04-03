import { DuckDBInstance } from '@duckdb/node-api';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

let connectionPromise: Promise<any> | null = null;

export function useDB() {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const dataDir = resolve(process.cwd(), '..', 'data');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      const dbPath = process.env.DUCKDB_PATH || resolve(dataDir, 'notes.db');
      const instance = await DuckDBInstance.create(dbPath);
      const connection = await instance.connect();

      await connection.run(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
          name VARCHAR NOT NULL,
          emoji VARCHAR NOT NULL DEFAULT '',
          position INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS tasks (
          id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
          workspace_id VARCHAR DEFAULT NULL,
          parent_id VARCHAR DEFAULT NULL,
          title VARCHAR NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          completed BOOLEAN NOT NULL DEFAULT false,
          completed_at TIMESTAMP DEFAULT NULL,
          pinned BOOLEAN NOT NULL DEFAULT false,
          archived BOOLEAN NOT NULL DEFAULT false,
          due_at TIMESTAMP DEFAULT NULL,
          tags VARCHAR[] NOT NULL DEFAULT [],
          position INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
          updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS notes (
          id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
          workspace_id VARCHAR DEFAULT NULL,
          title VARCHAR NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          pinned BOOLEAN NOT NULL DEFAULT false,
          archived BOOLEAN NOT NULL DEFAULT false,
          tags VARCHAR[] NOT NULL DEFAULT [],
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
          updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS links (
          id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
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
          workspace_id VARCHAR DEFAULT NULL,
          entry_date DATE NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
          updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
        )
      `);

      await connection.run(`
        CREATE TABLE IF NOT EXISTS event_log (
          id VARCHAR PRIMARY KEY DEFAULT uuid()::VARCHAR,
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

      // Add display_id column to tasks and notes (migration)
      try { await connection.run("ALTER TABLE tasks ADD COLUMN display_id VARCHAR DEFAULT ''"); } catch {}
      try { await connection.run("ALTER TABLE notes ADD COLUMN display_id VARCHAR DEFAULT ''"); } catch {}

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

export async function execute(sql: string, params: Record<string, any> = {}, types?: Record<string, any>) {
  const db = await useDB();
  if (types) {
    await db.run(sql, params, types);
  } else {
    await db.run(sql, params);
  }
}
