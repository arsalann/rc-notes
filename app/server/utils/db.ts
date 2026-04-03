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
