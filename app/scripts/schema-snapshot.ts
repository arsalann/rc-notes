/** Read-only public schema dump, including indexes, constraints, functions, triggers and policies.
 * Run from app/: npx tsx --env-file=.env scripts/schema-snapshot.ts ../.context/pre-deploy.sql
 * Requires pg_dump (on macOS: brew install libpq). Does not run ensureSchema or mutate the DB.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = process.argv[2];
if (!process.env.DATABASE_URL || !output) throw new Error('DATABASE_URL and output file are required');
const file = resolve(output);
if (existsSync(file)) throw new Error('Refusing to overwrite an existing schema snapshot');
const url = new URL(process.env.DATABASE_URL);
const cert = process.env.DATABASE_CA_CERT_FILE;
if (!cert) throw new Error('DATABASE_CA_CERT_FILE is required for verified pg_dump TLS');
url.searchParams.set('sslmode', 'verify-full');
url.searchParams.set('sslrootcert', resolve(cert));
const binary = process.env.PG_DUMP || (existsSync('/opt/homebrew/opt/libpq/bin/pg_dump') ? '/opt/homebrew/opt/libpq/bin/pg_dump' : 'pg_dump');
const result = spawnSync(binary, ['--schema-only', '--schema=public', '--no-owner', '--file', file], {
  env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'verify-full', PGSSLROOTCERT: resolve(cert),
    PGOPTIONS: '-c default_transaction_read_only=on' },
  encoding: 'utf8',
});
if (result.error || result.status !== 0) {
  let diagnostic = result.stderr || result.error?.message || '';
  for (const secret of [process.env.DATABASE_URL, url.toString(), decodeURIComponent(url.password)]) {
    if (secret) diagnostic = diagnostic.replaceAll(secret, '[redacted]');
  }
  throw new Error(`Schema snapshot failed (exit ${result.status ?? 'unavailable'}): ${diagnostic.trim()}`);
}
console.log(`Public schema snapshot saved to ${file}`);
