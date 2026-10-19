# Deploying daybook: Supabase + Railway

```
iPhone app ─┐
            ├── https ──▶ Railway (one web service: Nuxt SPA + Nitro API, Dockerfile) ──▶ Supabase Postgres
browser ────┘
```

- **Supabase** is only the Postgres database. The app keeps its own login: a sealed `rc-session`
  cookie with bcrypt passwords. Supabase Auth, its REST API and its storage are not used. Every
  table has row level security switched on with no policies, so Supabase's public API can't read
  anything. The server connects as the table owner, which bypasses RLS.
- **Railway** runs the existing `Dockerfile` as one service with one replica (`railway.json`). The
  service has an HTTPS domain and a health check at `/api/health`, and it redeploys on every push
  to `main`.
- **One repo.** The web app, API and iOS app share one API contract, and the iOS tests run against
  this server, so splitting the repo would only add sync work. Railway builds from the repo root and
  ignores `ios/` (see `.dockerignore`).
- **MotherDuck** stays untouched as the pre-migration archive and the rollback. The migration
  script only reads from it.

## Status (2026-10-17)

| Piece | State |
|---|---|
| Supabase | Project in `eu-west-1` (Ireland), session pooler, SSL enforced, RLS on every table |
| Data | Copied from MotherDuck on 2026-10-17 and verified value by value: 2 users, 2 workspaces, 607 tasks, 12 notes, 2,972 links, 144 diary entries, 7 weekly goals, 53,084 event-log rows, 9 ledger rows |
| Railway | Project `fearless-embrace`, service `rc-notes`, region EU West (Amsterdam), `https://rc-notes-production-a50f.up.railway.app`, deploys on push to `main` |
| Clients | iPhone app and phone browser switch to the Railway address |
| Bruin | **Pending**: `.bruin.yml` still has only the MotherDuck connection; step 6 below not done yet |
| Offline sync | `/api/sync/push` + `/api/sync/pull`, sync triggers and device columns; added to the schema on boot by the deploy that ships them (see "Schema changes on deploy") |
| MotherDuck | Frozen archive as of the 2026-10-17 copy. Nothing writes to it except the legacy service below |

**Legacy Railway project, still to handle.** `exemplary-vitality` (service `rc-notes`,
`https://rc-notes-production.up.railway.app`) is an older deployment from before this work. Its last
successful deploy still runs the DuckDB-era code against MotherDuck with its own
`MOTHERDUCK_NOTEBOOK_RC` and `MASTER_PASSWORD_HASH`. Its newer deploys fail because `main` now
needs `DATABASE_URL`. Anything written through it lands in MotherDuck, not Supabase. Kept for now at
Arsalan's request. Plan: stop using it, then delete the project, or at least remove its domain and
MotherDuck token.

**Operating Railway from a terminal**: `brew install railway`, `railway login`, then in any
directory `railway link -p fearless-embrace -e production -s rc-notes`. Useful commands:
`railway logs`, `railway deployment list`, `railway variables --set KEY=value` (redeploys). Don't
run `railway variables` without filtering: it prints secrets.

## Environment variables (Railway service)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **Session pooler** connection string, port 5432 (works over IPv4; the direct host is IPv6-only) |
| `DATABASE_CA_CERT` | Contents of Supabase's SSL certificate (PEM), so the database certificate is verified |
| `SESSION_SECRET` | 64 random characters (`openssl rand -hex 32`). Changing it signs everyone out |
| `PORT` | `3000`. Railway otherwise injects its own port (8080), and the generated domain targets 3000 |
| `ALLOW_SIGNUP` | Leave unset. Sign-up is off in production; admins add users in Settings |

`NODE_ENV=production`, `TZ=UTC` and `HOST` come from the Dockerfile.

Production: Railway project `fearless-embrace`, service `rc-notes`, `https://rc-notes-production-a50f.up.railway.app`.

## Runbook

1. **Supabase**: create the project in an EU region (production is `eu-west-1`), copy the session-pooler
   URL, and save the SSL certificate as `prod-ca-2021.crt` in the repo root (gitignored, the same
   root CA for every Supabase project).
2. **Migrate the data** (from a Mac, with the local dev server stopped):
   ```bash
   cd app
   TARGET_DATABASE_URL='<session pooler URL>' DATABASE_CA_CERT="$(cat ../prod-ca-2021.crt)" \
     npx tsx scripts/migrate-motherduck-to-postgres.ts
   ```
   - Passwords with `#`, `@`, `/` or `%` must be percent-encoded in the URL (`#` → `%23`).
   - The script reads MotherDuck with `MOTHERDUCK_NOTEBOOK_RC` from `app/.env` and creates the schema
     in Supabase.
   - It copies every table as-is, then verifies the copy: row counts everywhere, plus every value
     except in `event_log`.
   - It refuses to run if Supabase already has data, and it never writes to MotherDuck.
3. **Railway**: create a project from the GitHub repo, set the variables above (Raw Editor accepts
   `KEY=value` lines; the PEM can be one line with `\n` escapes), pick the region next to Supabase
   (EU West), and generate a domain on port 3000 under Settings → Networking. The first deploy
   fails its health check until the variables exist; that's expected. After that,
   `https://<domain>/api/health` should return `{"ok":true}`.
4. **Switch clients**:
   - **iPhone app**: the address is built in (`AppModel.builtInServer` in `ios/`). A new domain means
     updating that constant and reinstalling.
   - **Browser**: open the same address. The home-screen web app needs to be re-added from it.
5. **Point local dev at Supabase** (optional): put the same `DATABASE_URL` in `app/.env`, plus
   `DATABASE_CA_CERT_FILE=../prod-ca-2021.crt`. Without `DATABASE_URL`, local dev uses a throwaway
   embedded Postgres in `data/pglite`.
6. **Bruin** (pending): add a `postgres` connection named `supabase-default` to `.bruin.yml`. Then refresh the
   asset files (`bruin import database --connection supabase-default pipeline`) and point
   `pipeline/pipeline.yml` at it.

## Schema changes on deploy

The server adds missing tables, columns, indexes and triggers when it boots (`ensureSchema` in
`app/server/utils/schema.ts`), so a merge to `main` that changes the schema migrates production on
deploy. Before merging one:

1. Snapshot the affected tables into the `backup` schema (AGENTS.md "Always back up"), e.g. for the
   offline-sync deploy: `workspaces`, `tasks`, `notes`, `links`, `diary_entries`, `goals_weekly`.
2. Merge; watch `railway logs` for `[db] connection ready` and no `could not add` warnings.
3. Check `https://<domain>/api/health`, then sign in and look at a page.

Additions only (new columns with defaults, new tables, triggers) need no downtime. Rolling back the
code leaves the extra columns and triggers in place; the old code ignores them, and the triggers only
fill bookkeeping columns.

## Rollback

MotherDuck still holds the data exactly as it was at the 2026-10-17 copy. To go back, run the
server from before PR #44 (commit `2ecb3d5`) against MotherDuck. Anything written to Supabase after
the switch would have to be copied back by hand, so decide within the first day.

## Backups

- Supabase takes daily backups (7 days on the free plan, more on paid).
- Before any risky write, snapshot into a `backup` schema in the same database:
  `CREATE TABLE backup.<table>_<YYYYMMDD>_<N> AS TABLE public.<table>;` (see AGENTS.md).

## Known limits (unchanged from before the move)

- The data endpoints don't scope by `user_id`, so every signed-in user sees all data. Keep the
  user list to people you trust; sign-up stays off.
- Timestamps written before the migration hold the Mac's local time, as they did in MotherDuck.
  Rows written after it hold UTC, which matches how the clients already read them.
- One replica only: the login rate limiter and the event-log buffer live in process memory.
