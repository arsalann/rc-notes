import { DuckDBInstance } from '@duckdb/node-api';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

let connectionPromise: Promise<any> | null = null;

export function useDB() {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const token = process.env.MOTHERDUCK_NOTEBOOK_RC;
      let connection;

      if (token) {
        // MotherDuck cloud mode
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
          status VARCHAR NOT NULL DEFAULT 'open',
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
      await migrate("ALTER TABLE tasks ADD COLUMN status VARCHAR NOT NULL DEFAULT 'open'");
      await migrate("ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0");
      await migrate("ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL");
      await migrate("ALTER TABLE tasks ADD COLUMN reminder_at TIMESTAMP DEFAULT NULL");
      await migrate("ALTER TABLE notes ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL");
      await migrate("ALTER TABLE diary_entries ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL");

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
