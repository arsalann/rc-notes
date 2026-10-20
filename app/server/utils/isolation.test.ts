import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, OWNED_TABLES, ensureSchema, type Run } from './schema';

// Per-user isolation on an in-memory embedded Postgres. `as()` does what `db.ts` does for a
// statement inside a request: switch to the app role and set the signed-in user, locally.
let db: PGlite;
let run: Run;

async function as(user: string | null, sql: string, values: any[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('role', $1, true), set_config('daybook.user_id', $2, true)`, [APP_ROLE, user ?? '']);
    return (await tx.query<Record<string, any>>(sql, values)).rows;
  });
}

beforeAll(async () => {
  db = await PGlite.create('memory://');
  run = async (sql, values = []) => (await db.query<Record<string, any>>(sql, values)).rows;
  await ensureSchema(run, { transaction: fn => db.transaction(tx => fn(async (sql, values = []) => (await tx.query<Record<string, any>>(sql, values)).rows)) });
  await run(`INSERT INTO users (id, username, password_hash, is_admin) VALUES
    ('alice', 'alice', 'x', true), ('bob', 'bob', 'x', false)`);
  await as('alice', `INSERT INTO tasks (id, title) VALUES ('a1', 'alice task')`);
  await as('alice', `INSERT INTO notes (id, title) VALUES ('an1', 'alice note')`);
  await as('bob', `INSERT INTO tasks (id, title) VALUES ('b1', 'bob task')`);
});

afterAll(async () => {
  await db.close();
});

describe('per-user isolation', () => {
  it('stamps new rows with the signed-in user', async () => {
    const rows = await run(`SELECT id, user_id FROM tasks ORDER BY id`);
    expect(rows).toEqual([{ id: 'a1', user_id: 'alice' }, { id: 'b1', user_id: 'bob' }]);
  });

  it('shows each user only their own rows', async () => {
    expect((await as('alice', 'SELECT id FROM tasks')).map(r => r.id)).toEqual(['a1']);
    expect((await as('bob', 'SELECT id FROM tasks')).map(r => r.id)).toEqual(['b1']);
    expect(await as('bob', 'SELECT id FROM notes')).toEqual([]);
    expect(await as('bob', `SELECT id FROM tasks WHERE id = 'a1'`)).toEqual([]);
  });

  it('shows nothing before sign-in, but users can be looked up', async () => {
    for (const t of OWNED_TABLES) expect(await as(null, `SELECT * FROM ${t}`)).toEqual([]);
    expect((await as(null, `SELECT username FROM users ORDER BY username`)).length).toBe(2);
  });

  it("cannot change, delete or steal another user's rows", async () => {
    expect(await as('bob', `UPDATE tasks SET title = 'hacked' WHERE id = 'a1' RETURNING id`)).toEqual([]);
    expect(await as('bob', `DELETE FROM tasks WHERE id = 'a1' RETURNING id`)).toEqual([]);
    await expect(as('bob', `INSERT INTO tasks (id, title, user_id) VALUES ('x', 'x', 'alice')`)).rejects.toThrow();
    await expect(as('bob', `UPDATE tasks SET user_id = 'alice' WHERE id = 'b1'`)).rejects.toThrow();
    expect((await run(`SELECT title FROM tasks WHERE id = 'a1'`))[0]!.title).toBe('alice task');
  });

  it("gives tombstones to the deleted row's owner", async () => {
    await as('bob', `INSERT INTO links (id, source_type, source_id, target_type, target_id) VALUES ('bl', 'task', 'b1', 'note', 'n')`);
    await as('bob', `DELETE FROM links WHERE id = 'bl'`);
    expect((await as('bob', `SELECT row_id FROM sync_tombstones`)).map(r => r.row_id)).toEqual(['bl']);
    expect(await as('alice', `SELECT row_id FROM sync_tombstones`)).toEqual([]);
  });

  it('keeps independent sync receipts when two users choose the same operation id', async () => {
    for (const owner of ['alice', 'bob']) {
      await as(owner, `INSERT INTO sync_ops (op_id, method, path, status, response)
        VALUES ('same-op', 'POST', '/api/tasks', 201, $1) ON CONFLICT (user_id, op_id) DO NOTHING`, [owner]);
    }
    expect((await as('alice', "SELECT response FROM sync_ops WHERE op_id = 'same-op'"))[0]!.response).toBe('alice');
    expect((await as('bob', "SELECT response FROM sync_ops WHERE op_id = 'same-op'"))[0]!.response).toBe('bob');
  });

  it('rolls back the repair and ledger together if any table fails', async () => {
    await run(`INSERT INTO users (id, username) VALUES ('original', 'arsalan')`);
    await run('ALTER TABLE tasks DROP CONSTRAINT tasks_owner_fk');
    await run(`INSERT INTO tasks (id, title, user_id) VALUES ('repair-rollback', 'legacy', 'gone')`);
    await run(`CREATE FUNCTION reject_repair() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced repair failure'; END $$`);
    await run(`CREATE TRIGGER reject_repair BEFORE UPDATE ON notes FOR EACH STATEMENT EXECUTE FUNCTION reject_repair()`);
    await run(`DELETE FROM applied_migrations WHERE name = 'v16_assign_owner'`);
    await expect(ensureSchema(run, { transaction: fn => db.transaction(tx => fn(async (sql, values = []) =>
      (await tx.query<Record<string, any>>(sql, values)).rows)) })).rejects.toThrow('refusing to start');
    expect((await run(`SELECT user_id FROM tasks WHERE id = 'repair-rollback'`))[0]!.user_id).toBe('gone');
    expect(await run(`SELECT name FROM applied_migrations WHERE name = 'v16_assign_owner'`)).toEqual([]);
    await run('DROP TRIGGER reject_repair ON notes');
    await run(`UPDATE tasks SET user_id = 'bob' WHERE id = 'repair-rollback'`);
    await run(`DELETE FROM tasks WHERE id = 'repair-rollback'`);
    await run(`DELETE FROM users WHERE id = 'original'`);
  });

  it('assigns unowned rows to the original owner once', async () => {
    await run(`INSERT INTO users (id, username, password_hash) VALUES ('arsalan-id', 'arsalan', 'x')`);
    await run('ALTER TABLE tasks ALTER COLUMN user_id DROP NOT NULL');
    await run('ALTER TABLE notes DROP CONSTRAINT notes_owner_fk');
    await run(`INSERT INTO tasks (id, title) VALUES ('legacy', 'no owner')`);
    await run(`INSERT INTO notes (id, title, user_id) VALUES ('stale', 'old owner', 'gone')`);
    await run(`DELETE FROM applied_migrations WHERE name = 'v16_assign_owner'`);
    await ensureSchema(run, { transaction: fn => db.transaction(tx => fn(async (sql, values = []) => (await tx.query<Record<string, any>>(sql, values)).rows)) });
    expect((await run(`SELECT user_id, updated_by FROM tasks WHERE id = 'legacy'`))[0]).toEqual({
      user_id: 'arsalan-id', updated_by: 'migration_v16_assign_owner',
    });
    expect((await run(`SELECT user_id FROM notes WHERE id = 'stale'`))[0]!.user_id).toBe('arsalan-id');
    expect((await run(`SELECT user_id FROM tasks WHERE id = 'b1'`))[0]!.user_id).toBe('bob');
  });
});
