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

## Environment variables (Railway service)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **Session pooler** connection string, port 5432 (works over IPv4; the direct host is IPv6-only) |
| `DATABASE_CA_CERT` | Contents of Supabase's SSL certificate (PEM), so the database certificate is verified |
| `SESSION_SECRET` | 64 random characters (`openssl rand -hex 32`). Changing it signs everyone out |
| `ALLOW_SIGNUP` | Leave unset. Sign-up is off in production; admins add users in Settings |

`NODE_ENV=production`, `TZ=UTC`, `HOST` and `PORT` come from the Dockerfile.

## Runbook

1. **Supabase**: create the project, then copy the session-pooler URL and download the SSL certificate.
2. **Migrate the data** (from a Mac, with the local dev server stopped):
   ```bash
   cd app
   TARGET_DATABASE_URL='<session pooler URL>' DATABASE_CA_CERT="$(cat ~/Downloads/prod-ca-2021.crt)" \
     npx tsx scripts/migrate-motherduck-to-postgres.ts
   ```
   - The script reads MotherDuck with `MOTHERDUCK_NOTEBOOK_RC` from `app/.env` and creates the schema
     in Supabase.
   - It copies every table as-is, then verifies the copy: row counts everywhere, plus every value
     except in `event_log`.
   - It refuses to run if Supabase already has data, and it never writes to MotherDuck.
3. **Railway**: create a project from the GitHub repo and set the variables above. Generate a
   domain under Settings → Networking. After the first deploy, `https://<domain>/api/health` should
   return `{"ok":true}`.
4. **Switch clients**:
   - **iPhone app**: Settings → Server → `https://<domain>`, then sign in with your usual password.
   - **Browser**: open the same address. The home-screen web app needs to be re-added from it.
5. **Point local dev at Supabase** (optional): put the same `DATABASE_URL` and `DATABASE_CA_CERT` in
   `app/.env`. Without `DATABASE_URL`, local dev uses a throwaway embedded Postgres in `data/pglite`.
6. **Bruin**: add a `postgres` connection named `supabase-default` to `.bruin.yml`. Then refresh the
   asset files (`bruin import database --connection supabase-default pipeline`) and point
   `pipeline/pipeline.yml` at it.

## Rollback

MotherDuck still holds the data exactly as it was before the migration. To go back, run the
previous commit's server locally against MotherDuck. Anything written to Supabase after the switch
would have to be copied back by hand, so decide within the first day.

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
