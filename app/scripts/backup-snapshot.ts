/**
 * Snapshot public tables into the `backup` schema before a risky write or a schema-changing deploy
 * (AGENTS.md "Always back up before risky operations"):
 *
 *   backup.<table>_<YYYYMMDD>_<N>   N = next free suffix for that table and day
 *
 * Each copy gets row level security, and its row count is checked against the source.
 *
 *   cd app
 *   npx tsx --env-file=.env scripts/backup-snapshot.ts            # dry run: tables, counts, names
 *   npx tsx --env-file=.env scripts/backup-snapshot.ts --apply    # take the snapshots
 *   ... --tables tasks,notes                                      # only some tables
 *
 * Connects with `openDatabase()` and never runs `ensureSchema()`, so it cannot change the schema of
 * the database it backs up. Without `DATABASE_URL` it would open local PGlite: it refuses instead.
 */
import { openDatabase } from '../server/utils/db';

const apply = process.argv.includes('--apply');
const tablesArg = process.argv[process.argv.indexOf('--tables') + 1];
const only = process.argv.includes('--tables') && tablesArg ? new Set(tablesArg.split(',').map(t => t.trim())) : null;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (pass --env-file=.env); refusing to snapshot a local database.');
  process.exit(2);
}

const db = await openDatabase();
// The operator's local date, as the existing backup names use.
const now = new Date();
const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

try {
  const tables = (await db.run(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  )).map(r => String(r.table_name)).filter(t => !only || only.has(t));
  if (only) {
    const missing = [...only].filter(t => !tables.includes(t));
    if (missing.length) throw new Error(`no such public table: ${missing.join(', ')}`);
  }

  const existing = new Set((await db.run(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'backup'`,
  )).map(r => String(r.table_name)));

  const plan = [];
  for (const table of tables) {
    let n = 1;
    while (existing.has(`${table}_${day}_${n}`)) n++;
    const [{ count }] = await db.run(`SELECT count(*)::bigint AS count FROM public.${table}`) as { count: number }[];
    plan.push({ table, target: `${table}_${day}_${n}`, count: Number(count) });
  }
  console.table(plan);

  if (!apply) {
    console.log('dry run: nothing written. Re-run with --apply to take the snapshots.');
  } else {
    await db.run('CREATE SCHEMA IF NOT EXISTS backup');
    for (const { table, target, count } of plan) {
      await db.run(`CREATE TABLE backup.${target} AS TABLE public.${table}`);
      await db.run(`ALTER TABLE backup.${target} ENABLE ROW LEVEL SECURITY`);
      const [{ copied }] = await db.run(`SELECT count(*)::bigint AS copied FROM backup.${target}`) as { copied: number }[];
      // The source can grow between the count and the copy (live writes); it can never shrink here.
      if (Number(copied) < count) throw new Error(`backup.${target} has ${copied} rows, expected at least ${count}`);
      console.log(`backup.${target}: ${copied} rows`);
    }
    console.log(`done: ${plan.length} snapshot(s)`);
  }
} finally {
  await db.close();
}
