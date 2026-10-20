/** Verify the isolation upgrade against a captured production SCHEMA, with synthetic rows only.
 * npx tsx scripts/verify-launch-schema.ts ../.context/pre-deploy.sql
 * Always in-memory PGlite; never opens DATABASE_URL or runs application routes.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema, OWNED_TABLES, APP_ROLE, type Run } from '../server/utils/schema';

if (!process.argv[2]) throw new Error('Schema snapshot path required');
const db = await PGlite.create('memory://');
const run: Run = async (sql, values = []) => (await db.query<Record<string, any>>(sql, values)).rows;
try {
  // Roles used by Supabase's schema grants; no Supabase data or credentials are involved.
  for (const role of ['anon', 'authenticated', 'service_role', 'supabase_admin']) await run(`CREATE ROLE ${role}`);
  const dump = readFileSync(process.argv[2], 'utf8')
    .split('\n').filter(line => !line.startsWith('\\')).join('\n')
    .replace('CREATE SCHEMA public;', 'CREATE SCHEMA IF NOT EXISTS public;');
  await db.exec(dump);
  await run("SET search_path TO public");
  await run("SET row_security TO on");
  await run(`INSERT INTO users (id, username, is_admin) VALUES
    ('master_tester', 'arsalan', true), ('master_tester_2_fixture', 'master_tester_2_fixture', false)`);
  await run(`INSERT INTO tasks (id, title, description, user_id) VALUES
    ('unowned', 'MasterTester_fixture_unowned', 'keep exactly', NULL),
    ('invalid', 'MasterTester_fixture_invalid', 'keep exactly', 'missing'),
    ('other', 'MasterTester_fixture_other', 'keep exactly', 'master_tester_2_fixture'),
    ('correct', 'MasterTester_fixture_correct', 'keep exactly', 'master_tester')`);
  await run(`INSERT INTO notes (id, title, content) VALUES ('note', 'MasterTester_fixture_note', 'keep exactly')`);
  await run(`INSERT INTO diary_entries (id, entry_date, content) VALUES ('diary', '2035-01-01', 'keep exactly')`);
  await run(`INSERT INTO links (id, source_type, source_id, target_type, target_id) VALUES ('link', 'task', 'unowned', 'note', 'note')`);
  await ensureSchema(run, { transaction: fn => db.transaction(tx => fn(async (sql, values = []) =>
    (await tx.query<Record<string, any>>(sql, values)).rows)) });
  const rows = await run('SELECT id, user_id, description FROM tasks ORDER BY id');
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.description, 'keep exactly');
    assert.equal(row.user_id, row.id === 'other' ? 'master_tester_2_fixture' : 'master_tester');
  }
  assert.equal((await run(`SELECT content FROM diary_entries WHERE id = 'diary'`))[0]!.content, 'keep exactly');
  assert.equal((await run(`SELECT content FROM notes WHERE id = 'note'`))[0]!.content, 'keep exactly');
  assert.equal((await run(`SELECT name FROM applied_migrations WHERE name = 'v16_assign_owner'`)).length, 1);
  for (const table of OWNED_TABLES.filter(t => t !== 'event_log')) {
    assert.equal((await run(`SELECT count(*)::int AS n FROM ${table} WHERE user_id IS NULL`))[0]!.n, 0);
    assert.equal((await run(`SELECT is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = 'user_id'`, [table]))[0]!.is_nullable, 'NO');
  }
  await db.transaction(async tx => {
    await tx.query(`SELECT set_config('role', $1, true), set_config('daybook.user_id', '', true)`, [APP_ROLE]);
    assert.equal((await tx.query('SELECT id FROM tasks')).rows.length, 0);
  });
  console.log('Captured production schema upgrade passed: ownership, content preservation, ledger, NOT NULL and anonymous RLS.');
} finally { await db.close(); }
