/** Read-only launch inventory. Run from app/: npx tsx --env-file=.env scripts/launch-audit.ts
 * Uses openDatabase WITHOUT ensureSchema: safe to run before backing up a schema upgrade.
 * Prints aggregate counts, never content or credentials. Does not write backups or repair data.
 */
import { openDatabase } from '../server/utils/db';
import { OWNED_TABLES } from '../server/utils/schema';

const db = await openDatabase();
try {
  const tables = await db.run(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  const names = new Set(tables.map(r => r.table_name));
  const inventory = [];
  for (const table of OWNED_TABLES) {
    if (!names.has(table)) { inventory.push({ table, missing: true }); continue; }
    const cols = await db.run(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table]);
    const hasOwner = cols.some(r => r.column_name === 'user_id');
    const [counts] = await db.run(`SELECT count(*)::int AS total${hasOwner ? `,
      count(*) FILTER (WHERE user_id IS NULL)::int AS null_owner,
      count(*) FILTER (WHERE user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_id))::int AS invalid_owner` : ''}
      FROM public.${table}`);
    inventory.push({ table, has_owner_column: hasOwner, ...counts });
  }
  const repairs = names.has('applied_migrations')
    ? await db.run(`SELECT name, applied_at FROM applied_migrations WHERE name = 'v16_assign_owner'`) : [];
  const backups = await db.run(`SELECT tablename FROM pg_tables WHERE schemaname = 'backup' ORDER BY tablename`);
  const [owner] = await db.run(`SELECT count(*)::int AS candidates FROM users WHERE username = 'arsalan' OR is_admin`);
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), inventory, repairs, owner_candidates: owner?.candidates, backups: backups.map(r => r.tablename) }, null, 2));
} finally { await db.close(); }
