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
| Templates + tags (2026-10-20) | New tables `task_templates`, `tag_settings`, new column `sync_tombstones.row_data`, new tombstone trigger body; added on boot. Backups `backup.<table>_20261020_<N>` taken before the deploy |
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
| `ALLOW_SIGNUP` | `true` when ready for public sign-up, after isolation is verified and contact details are configured. Leave off during preparation; admins add users in Settings |
| `NUXT_PUBLIC_CONTACT_EMAIL` | Contact address shown on `/privacy` and `/support` (required for App Store review) |

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

**Deploy order for the iOS parity work**: the server change that accepts `POST /api/tasks/bulk` in
`/api/sync/push` must be live before an iPhone build that queues bulk deletes; an older server answers
those ops with 400, which the phone treats as final (the delete would be lost on the server side).
No schema change, so no backup is required for that deploy (take one anyway if in doubt).

For the templates/tags deploy (2026-10-20) every public table was snapshotted, since bulk delete and tag
rename are new ways to change existing `tasks`/`notes`/`links` rows.

Additions only (new columns with defaults, new tables, triggers) need no downtime. Rolling back the
code leaves the extra columns and triggers in place; the old code ignores them, and the triggers only
fill bookkeeping columns.

## Rollback

MotherDuck still holds the data exactly as it was at the 2026-10-17 copy. To go back, run the
server from before PR #44 (commit `2ecb3d5`) against MotherDuck. Anything written to Supabase after
the switch would have to be copied back by hand, so decide within the first day.

## Launch preparation: per-user isolation (v16_assign_owner)

We are preparing for launch; App Store submission is deferred. This production isolation rollout
can be completed while public sign-up remains disabled. App Store setup and submission are future
steps when the user chooses to proceed, not prerequisites for this rollout.

Every request now runs as the `daybook_app` role under row level security (see AGENTS.md
"Per-user isolation"). The first boot of this release creates the role and policies and runs the
`v16_assign_owner` repair, which gives every row without a valid owner to `arsalan`. Order:

Run maintenance commands from `app/`, using `npx tsx --env-file=.env`; they intentionally use
`openDatabase()` without `ensureSchema()`. Verify the TLS CA file exists before connecting.

1. Read-only preflight: `scripts/launch-audit.ts` reports per-table totals, missing/invalid owners,
   the repair ledger and existing snapshot names. Present the affected counts for approval before
   applying the repair. Production sign-up stays disabled until isolation is verified.
2. Capture the pre-deploy schema (including policies, constraints and indexes) with
   `scripts/schema-snapshot.ts <output.sql>` (requires `pg_dump`/Homebrew `libpq`), as well as table
   snapshots. Run `scripts/backup-snapshot.ts --apply` for backup #1. Its default invocation is a
   dry run. All public tables are copied atomically with RLS and count verification.
3. Run `scripts/verify-launch-schema.ts <output.sql>` to verify the captured schema upgrade with
   synthetic rows in in-memory PGlite, then take backup #2 immediately before
   the approved deployment. Suffixes increment automatically; never assume `_1` / `_2` are free.
4. Deploy. Boot applies `v16_assign_owner` with its ledger entry in one transaction, then enforces
   required ownership/FKs and the per-user sync receipt key. A repair failure aborts startup.
5. Run the read-only audit again: verify zero missing/invalid owners for content/sync tables,
   unchanged content row totals, the repair ledger entry, and expected visibility in the app.
   Audit counts may grow normally; anonymous audit rows may have NULL ownership by design.
6. Before a future public launch, set `NUXT_PUBLIC_CONTACT_EMAIL` and check `/privacy` and `/support`
   signed out. Enable `ALLOW_SIGNUP=true` only when ready for public sign-up, after isolation is
   verified. Keep sign-up disabled during preparation if desired. `docs/APP_STORE.md` records the
   deferred App Store checklist; submit only when the user chooses to proceed. Automated tests stay on PGlite.

**Rollback requires schema and data restoration, not just reverting the code.** Stop writes and
sign-up, preserve any post-deployment data separately, and restore the pre-deploy schema and backup
#2 under an explicitly reviewed rollback procedure. The new NOT NULL/FK constraints, tag uniqueness
and sync receipt key are incompatible with the previous application's write behavior. Deleting the
repair ledger row alone does not undo them. Test the rollback against a restored isolated database
before applying it to production.

## Backups

- Supabase takes daily backups (7 days on the free plan, more on paid).
- Before any risky write, snapshot into a `backup` schema in the same database:
  `CREATE TABLE backup.<table>_<YYYYMMDD>_<N> AS TABLE public.<table>;` (see AGENTS.md).
- The privacy policy promises deleted accounts leave backups within 30 days: drop `backup.*`
  snapshots older than 30 days (and keep Supabase's backup retention at or below 30 days).
- Tasks deleted from the multi-select bar (and deleted links) are kept as JSON in
  `sync_tombstones.row_data`. To restore one:
  `INSERT INTO tasks SELECT * FROM jsonb_populate_record(NULL::tasks, (SELECT row_data FROM sync_tombstones WHERE table_name = 'tasks' AND row_id = '<id>' ORDER BY sync_seq DESC LIMIT 1));`
  (subtasks and links the same way; the insert gets a new `sync_seq`, so the phone pulls it back).

## Known limits (unchanged from before the move)

- Timestamps written before the migration hold the Mac's local time, as they did in MotherDuck.
  Rows written after it hold UTC, which matches how the clients already read them.
- One replica only: the login rate limiter and the event-log buffer live in process memory.
