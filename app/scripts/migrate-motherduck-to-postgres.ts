/**
 * One-time copy of the daybook database from MotherDuck (DuckDB) into Postgres (Supabase).
 *
 *   cd app
 *   TARGET_DATABASE_URL='postgresql://...' npx tsx scripts/migrate-motherduck-to-postgres.ts
 *
 * Source: MotherDuck `rc_notes` via MOTHERDUCK_NOTEBOOK_RC (read from the environment or app/.env),
 *         or a local DuckDB file with `--source-duckdb <path>` (used to test this script).
 * Target: TARGET_DATABASE_URL (deliberately not DATABASE_URL, so it can't be picked up by accident).
 *
 * Safety:
 * - Only SELECTs run against the source. Nothing is written to MotherDuck, which stays as the
 *   untouched original (and the rollback).
 * - The target must hold no data. The only rows allowed are the two default workspaces the app
 *   seeds on first boot and the migrations ledger; those are replaced. Anything else aborts.
 * - Values are copied as-is, including the exact `updated_at` text the journal's optimistic
 *   concurrency compares. Every table is verified afterwards: row counts for all of them, and a
 *   full value-by-value comparison for everything except `event_log` (count + newest row there).
 *
 * Stop the dev server first. Two processes on one MotherDuck database can crash the DuckDB addon.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { openDatabase } from '../server/utils/db';
import { ensureSchema, DATA_TABLES } from '../server/utils/schema';

const args = process.argv.slice(2);
const sourceFileIdx = args.indexOf('--source-duckdb');
const sourceFile = sourceFileIdx >= 0 ? args[sourceFileIdx + 1] : null;

function envFromDotenv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, '') || undefined;
}

const targetUrl = process.env.TARGET_DATABASE_URL;
if (!targetUrl) {
  console.error('Set TARGET_DATABASE_URL to the Supabase connection string.');
  process.exit(2);
}

async function openSource() {
  if (sourceFile) {
    const instance = await DuckDBInstance.create(sourceFile, { access_mode: 'READ_ONLY' });
    return { conn: await instance.connect(), label: `DuckDB file ${sourceFile}` };
  }
  const token = envFromDotenv('MOTHERDUCK_NOTEBOOK_RC');
  if (!token) throw new Error('MOTHERDUCK_NOTEBOOK_RC is not set (env or app/.env).');
  if (!/^[a-zA-Z0-9_\-.:=]+$/.test(token)) throw new Error('Invalid MotherDuck token format');
  const instance = await DuckDBInstance.create();
  const conn = await instance.connect();
  await conn.run('INSTALL motherduck');
  await conn.run('LOAD motherduck');
  await conn.run(`SET motherduck_token = '${token}'`);
  await conn.run(`ATTACH 'md:'`);
  await conn.run('USE rc_notes');
  return { conn, label: 'MotherDuck rc_notes' };
}

const { conn: source, label } = await openSource();
const srcRows = async (sql: string) => (await source.runAndReadAll(sql)).getRowObjectsJson() as Record<string, any>[];

const target = await openDatabase(targetUrl);
const run = target.run;

console.log(`source: ${label}`);
console.log(`target: ${new URL(targetUrl).host}`);

// --- 1. Target must be empty (apart from first-boot seeds).
const existingTables = new Set(
  (await run(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`)).map(r => String(r.table_name)),
);
for (const table of DATA_TABLES) {
  if (!existingTables.has(table) || table === 'applied_migrations') continue;
  const [{ n }] = (await run(`SELECT count(*)::int AS n FROM ${table}`)) as any;
  if (!n) continue;
  if (table === 'workspaces') {
    const seeds = await run(`SELECT name FROM workspaces WHERE user_id IS NULL AND name IN ('Personal', 'Work')`);
    if (seeds.length === n) continue;
  }
  console.error(`abort: target table ${table} already has ${n} row(s). This script only fills an empty database.`);
  process.exit(1);
}

// --- 2. Schema (no seed rows), then drop first-boot seeds so the real workspaces replace them.
await ensureSchema(run, { seed: false });
await run(`DELETE FROM workspaces WHERE user_id IS NULL AND name IN ('Personal', 'Work')`);

// --- 3. Copy.
const columnsOf = async (table: string) => {
  const src = (await srcRows(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'main' AND table_name = '${table}' ORDER BY ordinal_position`,
  )).map(r => String(r.column_name));
  const dst = new Set((await run(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table],
  )).map(r => String(r.column_name)));
  const missing = src.filter(c => !dst.has(c));
  if (missing.length) throw new Error(`${table}: target lacks source columns ${missing.join(', ')}`);
  return src;
};

const keyOf = (table: string) => (table === 'applied_migrations' ? 'name' : 'id');
const summary: { table: string; rows: number }[] = [];

for (const table of DATA_TABLES) {
  const srcTables = await srcRows(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_name = '${table}'`);
  if (!srcTables.length) { console.log(`${table}: not in source, skipped`); continue; }
  const cols = await columnsOf(table);
  const key = keyOf(table);
  const batch = Math.max(1, Math.floor(30000 / cols.length));
  let copied = 0;
  for (let offset = 0; ; offset += batch) {
    const rows = await srcRows(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY ${key} LIMIT ${batch} OFFSET ${offset}`);
    if (!rows.length) break;
    const values: any[] = [];
    const tuples = rows.map(row => `(${cols.map(c => { values.push(row[c] ?? null); return `$${values.length}`; }).join(', ')})`);
    const conflict = table === 'applied_migrations' ? ' ON CONFLICT (name) DO NOTHING' : '';
    await run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${tuples.join(', ')}${conflict}`, values);
    copied += rows.length;
    if (rows.length < batch) break;
  }
  summary.push({ table, rows: copied });
  console.log(`${table}: copied ${copied}`);
}

// --- 4. Verify.
const normalize = (v: any) => (v === null || v === undefined ? null : Array.isArray(v) ? JSON.stringify(v.map(String)) : String(v));
let problems = 0;
for (const { table } of summary) {
  const cols = await columnsOf(table);
  const key = keyOf(table);
  const [{ n: srcCount }] = await srcRows(`SELECT count(*)::INTEGER AS n FROM ${table}`) as any;
  const [{ n: dstCount }] = (await run(`SELECT count(*)::int AS n FROM ${table}`)) as any;
  if (table === 'applied_migrations') {
    // The target may hold extra ledger names (repairs recorded on schema creation); every source
    // name must be present.
    const dst = new Set((await run('SELECT name FROM applied_migrations')).map(r => String(r.name)));
    const lost = (await srcRows('SELECT name FROM applied_migrations')).filter(r => !dst.has(String(r.name)));
    if (lost.length) { problems++; console.error(`${table}: missing ${lost.map(r => r.name).join(', ')}`); }
    continue;
  }
  if (Number(srcCount) !== Number(dstCount)) {
    problems++;
    console.error(`${table}: count mismatch source=${srcCount} target=${dstCount}`);
    continue;
  }
  if (table === 'event_log') {
    const [s] = await srcRows(`SELECT max(created_at)::VARCHAR AS m, count(request_body)::INTEGER AS b FROM event_log`);
    const [d] = await run(`SELECT max(created_at)::text AS m, count(request_body)::int AS b FROM event_log`);
    if (String(s!.m) !== String(d!.m) || Number(s!.b) !== Number(d!.b)) {
      problems++;
      console.error(`event_log: newest/body mismatch source=${JSON.stringify(s)} target=${JSON.stringify(d)}`);
    }
    continue;
  }
  const src = await srcRows(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY ${key}`);
  const dst = await run(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY ${key} COLLATE "C"`);
  const dstByKey = new Map(dst.map(r => [String(r[key]), r]));
  let diffs = 0;
  for (const row of src) {
    const other = dstByKey.get(String(row[key]));
    for (const c of cols) {
      if (normalize(row[c]) !== normalize(other?.[c])) {
        if (diffs++ < 5) console.error(`${table} ${row[key]}.${c}: source=${JSON.stringify(row[c])} target=${JSON.stringify(other?.[c])}`);
      }
    }
  }
  if (diffs) { problems++; console.error(`${table}: ${diffs} differing value(s)`); }
}

await target.close();
if (problems) {
  console.error(`\nverification FAILED (${problems} table(s)). MotherDuck was not modified.`);
  process.exit(1);
}
console.log('\nverified: every table matches the source. MotherDuck was not modified.');
