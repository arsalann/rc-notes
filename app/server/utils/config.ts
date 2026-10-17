/** Postgres connection string (Supabase in production). Unset → embedded PGlite (see db.ts). */
export function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL || null;
}
