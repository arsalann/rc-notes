import { afterAll, beforeAll, expect, it } from 'vitest';
import { asSystem, queryAll, resetConnection, setWriteContextProvider, useDB, withTransaction, type Database } from './db';
import { deleteUserAndData } from './accounts';
import { OWNED_TABLES } from './schema';
import { logEvent } from './eventLog';

let db: Database;
let userId: string | null = null;
beforeAll(async () => {
  // Never load app/.env or use a persistent database in this suite.
  process.env.DATABASE_URL = '';
  process.env.PGLITE_PATH = 'memory://';
  resetConnection();
  db = await useDB();
  setWriteContextProvider(() => ({ userId, deviceKind: null, deviceId: null, opId: null, opTime: null, updatedBy: 'test_playwright' }));
  await queryAll(`INSERT INTO users (id, username) VALUES ('master_tester', 'master_tester'), ('master_tester_2', 'master_tester_2')`);
  for (const owner of ['master_tester', 'master_tester_2']) {
    userId = owner;
    await queryAll(`INSERT INTO workspaces (name) VALUES ('Work')`);
    await queryAll(`INSERT INTO tasks (title) VALUES ('MasterTester_delete')`);
    await queryAll(`INSERT INTO notes (title) VALUES ('MasterTester_delete')`);
    await queryAll(`INSERT INTO diary_entries (entry_date) VALUES ('2030-01-01')`);
    await queryAll(`INSERT INTO goals_weekly (week_start) VALUES ('2030-01-01')`);
    await queryAll(`INSERT INTO task_templates (name) VALUES ('MasterTester_delete')`);
    await queryAll(`INSERT INTO tag_settings (tag_key) VALUES ('manual:test')`);
    await queryAll(`INSERT INTO links (source_type, source_id, target_type, target_id) VALUES ('task', 't', 'note', 'n')`);
    await queryAll(`INSERT INTO sync_tombstones (table_name, row_id) VALUES ('tasks', 'old')`);
    await queryAll(`INSERT INTO sync_ops (op_id, method, path, status) VALUES ($id, 'PUT', '/api/tasks/t', 200)`, { id: owner });
    await queryAll(`INSERT INTO event_log (event_type, method, path) VALUES ('test', 'POST', '/test')`);
  }
  userId = 'master_tester';
});
afterAll(async () => {
  setWriteContextProvider(() => null);
  await db.close();
  resetConnection();
});

it('rolls back all content and trigger tombstones when account removal fails', async () => {
  await asSystem(() => queryAll(`CREATE FUNCTION reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced deletion failure'; END $$`));
  await asSystem(() => queryAll(`CREATE TRIGGER reject_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION reject_delete()`));
  await expect(deleteUserAndData(userId!)).rejects.toThrow('forced deletion failure');
  for (const table of OWNED_TABLES) {
    expect((await queryAll(`SELECT count(*)::int AS n FROM ${table}`))[0]!.n, table).toBe(1);
  }
  expect((await queryAll(`SELECT id FROM users WHERE id = 'master_tester'`)).length).toBe(1);
  await asSystem(() => queryAll('DROP TRIGGER reject_delete ON users'));
});

it('deletes every owned table including generated tombstones and preserves the other user', async () => {
  await deleteUserAndData(userId!);
  for (const table of OWNED_TABLES) {
    expect(await queryAll(`SELECT * FROM ${table}`), table).toEqual([]);
    const others = await asSystem(() => queryAll(`SELECT user_id FROM ${table}`));
    expect(others, table).toEqual([{ user_id: 'master_tester_2' }]);
  }
  expect(await queryAll(`SELECT id FROM users ORDER BY id`)).toEqual([{ id: 'master_tester_2' }]);
});

it('shares one transaction across nested calls and rolls back on failure', async () => {
  userId = 'master_tester_2';
  await expect(withTransaction(async () => {
    await queryAll(`UPDATE tasks SET title = 'changed'`);
    await withTransaction(async () => { throw new Error('abort'); });
  })).rejects.toThrow('abort');
  expect((await queryAll('SELECT title FROM tasks'))[0]!.title).toBe('MasterTester_delete');
});

it("does not reinsert a deleted account's audit data when a late request finishes", async () => {
  await logEvent({ method: 'POST', path: '/api/tasks', user_id: 'master_tester', request_body: 'MasterTester_private' });
  expect(await asSystem(() => queryAll("SELECT id FROM event_log WHERE user_id = 'master_tester'"))).toEqual([]);
  await logEvent({ method: 'GET', path: '/api/tasks', user_id: 'master_tester_2' });
  expect((await asSystem(() => queryAll("SELECT count(*)::int AS n FROM event_log WHERE user_id = 'master_tester_2'")))[0]!.n).toBe(2);
});

it('rejects orphaned content even from a request that started before deletion', async () => {
  await expect(asSystem(() => queryAll(
    "INSERT INTO tasks (title, user_id) VALUES ('MasterTester_stale', 'master_tester')",
  ))).rejects.toThrow('tasks_owner_fk');
});

it('fails closed when request context cannot be parsed', async () => {
  setWriteContextProvider(() => { throw new Error('invalid request context'); });
  try {
    await expect(queryAll('SELECT * FROM tasks')).rejects.toThrow('invalid request context');
  } finally {
    setWriteContextProvider(() => ({ userId, deviceKind: null, deviceId: null, opId: null, opTime: null, updatedBy: 'test_playwright' }));
  }
});
