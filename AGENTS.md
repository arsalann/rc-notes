# AGENTS.md — Agent Instructions & Context

## Which doc to follow
- **App editing mode** (changing code, fixing bugs, adding features, schema/db
  changes, UI work): follow THIS file (`AGENTS.md`).
- **Assistant mode** (managing Arsalan's tasks/notes/diary, answering questions
  about his data, daily briefings, triaging Slack/Gmail/GitHub/Calendar — i.e.
  operating ON the data rather than editing the app): follow
  [`ASSISTANT.md`](./ASSISTANT.md) instead. That doc defines the
  `assistant_agent` provenance, safety rules, and command vocabulary.
- If a request mixes both (e.g. "add a feature AND backfill my tasks"), apply
  `AGENTS.md` to the code changes and `ASSISTANT.md` to the data writes.

## Project Context
- This is a mobile-first **todo/reminder + notes app** called **rc-notes**
- Core features: tasks with subtasks, notes with @-mention linking, diary, workspaces, 5-day calendar,
  task templates, tag settings, multi-select bulk actions
- Tech: Nuxt 4 (SPA) + Nuxt UI + Tailwind CSS + Postgres (Supabase) + Bruin CLI, plus a native iOS app in `ios/`
  that works offline on a local copy and syncs (see "Offline sync" below)
- Deployed on Railway (see `DEPLOY.md`); it includes setup and login flows, but data endpoints are not yet consistently scoped by `user_id`
- Primary use: phone browser

## Key File Locations
- `README.md` — public project overview, setup, and pointers to implementation sources of truth
- `DEPLOY.md` — Supabase + Railway setup, data migration runbook, rollback
- `.bruin.yml` — Bruin pipeline config (root, gitignored — contains the database connection)
- `app/.env` — `DATABASE_URL`, `DATABASE_CA_CERT_FILE`, `SESSION_SECRET` (gitignored)
- `prod-ca-2021.crt` — Supabase SSL root certificate (repo root, gitignored)
- `pipeline/` — Bruin SQL assets
- `app/` — Nuxt 4 application
- `app/server/utils/db.ts` — Postgres/PGlite connection, `queryAll()` / `execute()` (critical file)
- `app/server/utils/schema.ts` — table DDL, boot-time schema check, sync triggers, `DATA_REPAIRS` ledger (critical file)
- `app/server/api/sync/` — `push` (replays queued iOS changes) and `pull` (rows changed since a cursor)
- `app/server/utils/syncContext.ts` — device/op/client-time headers → the write context the triggers read
- `ios/DaybookKit/Sources/DaybookKit/Sync/` — the iOS local copy, change queue and sync engine
- `app/server/api/tasks/` — Task CRUD endpoints; `bulk.post.ts` is the multi-select bar (archive / unarchive /
  delete / status / priority for many ids in one request)
- `app/server/api/templates/` + `server/utils/templates.ts` — task templates CRUD (soft delete)
- `app/server/api/tags/` + `server/utils/tags.ts` — tag list with usage counts, display overrides, rename
- `app/components/BulkActionBar.vue` — the select-mode toolbar shared by Tasks and Today
- `app/components/SettingsTemplates.vue`, `SettingsTags.vue` — the Settings sections
- `app/composables/useTemplates.ts` (save / edit / instantiate), `useTagSettings.ts` (overrides, `present()`)
- `app/server/api/notes/` — Notes CRUD endpoints
- `app/composables/useNotes.ts` — exports `useTasks()`, `useNotesCrud()`, `Task`, `Note` types
- `app/composables/useWorkspace.ts` — workspace state management
- `app/assets/css/main.css` — theme, all CSS utility classes defined here

## Data Model
All content tables include `user_id` and `user_name` for future multi-user support.

- **workspaces**: filter-based labels (Personal, Work seeded by default), with description, color, archived, updated_at
- **tasks**: parent_id for subtasks, workspace_id, display_id, status, priority, completed/completed_at, due_at, reminder_at, deleted_at, position, tags[]
- **notes**: workspace_id, display_id, title/content, deleted_at, tags[]
- **links**: bidirectional links between tasks and notes (source_type/id ↔ target_type/id)
- **diary_entries**: workspace_id, entry_date, content, deleted_at
- **event_log**: audit log of all API actions with user_id, user_name
- **task_templates**: name, title, description, priority, tags[], `subtasks` JSONB (ordered, one level:
  `{title, description, priority|null, tags}`), workspace_id, position, deleted_at (soft delete). Using a template
  creates ordinary tasks from the client (`useTemplates().instantiateTemplate`, client ids → idempotent)
- **tag_settings**: one row per tag key (`tag_key` unique): catalog key or `manual:<normalized>` (`manualTaskTagKey`
  in `utils/taskTags.ts`), with display `label` / `emoji` overrides and `archived` (hidden from pickers). Overrides
  are display only and applied on the client (`useTagSettings().present`); renaming a custom tag rewrites
  `tasks.tags` / `notes.tags` (`POST /api/tags/rename`). Built-in tags cannot be renamed, only relabelled
- Not synced: `task_templates` and `tag_settings` are online-only on iOS too (fetched after each sync, cached,
  edited via `APIClient`); creating tasks from a template is queued like any new task
- Today page section switches (`todayShowJournal`, `todayShowGoals`) are per-device preferences in localStorage
  (`usePreferences`), like the other view settings

## Color System — CRITICAL
The app uses one dim, warm-neutral Daybook theme with no light/dark toggle. `app/assets/css/main.css` is the source of truth: use its `--daybook-*` variables and mapped `--ui-*` tokens rather than reintroducing a separate palette.

- Canvas/surfaces: `#171716`, `#20201e`, `#282723`; borders: `#38362f`
- Text: `#f1ede5` primary, `#b9b4aa` muted, `#989289` faint
- Accent: muted sage `#9fb9aa` / `#c0d9c9`; warm state `#d7b17a`; danger `#d48f82`
- Preserve strong contrast and 44px touch targets. Do not use light-mode utility classes or a `dark:` variant.

## Database Connection
- **Postgres** (Supabase `eu-west-1` in production): set `DATABASE_URL` (Supabase *session pooler*
  string) and the CA for full TLS verification: `DATABASE_CA_CERT` (PEM contents; Railway) or
  `DATABASE_CA_CERT_FILE` (path relative to `app/`, e.g. `../prod-ca-2021.crt`; local `.env`). Every connection runs `SET TIME ZONE 'UTC'`.
- **Embedded fallback**: without `DATABASE_URL`, the server runs PGlite (Postgres compiled to WASM) in
  `data/pglite` (or `PGLITE_PATH`). Same SQL dialect, no server needed. Production refuses to start
  without `DATABASE_URL`.
- All API endpoints use `queryAll()` / `execute()` from `db.ts` — they don't know which backend runs.
- Schema lives in `schema.ts`: missing tables/columns/indexes are added on boot after reading the real
  catalog; RLS is enabled on every table (no policies; the server is the owner and bypasses it).
- MotherDuck (`md:rc_notes`) was the database until the Postgres move. It is now a read-only archive;
  `app/scripts/migrate-motherduck-to-postgres.ts` did the one-time copy on 2026-10-17. Never write to it.
  Exception to be cleaned up: the legacy Railway project `exemplary-vitality` still serves the old
  DuckDB-era app against it (see `DEPLOY.md` "Status").
- Production: Railway `fearless-embrace` → `https://rc-notes-production-a50f.up.railway.app`, Supabase
  `eu-west-1`. Railway needs `PORT=3000` (it injects 8080 otherwise; the domain targets 3000).
- The worktree's `app/.env` may point at production Supabase: a local `npm run dev` then edits real data.

## Offline sync
The iOS app keeps a local copy of the data and a queue of changes; the web app stays online-only
(it sends a device id, nothing else). How it fits together:
- **Synced tables**: `SYNCED_TABLES` in `schema.ts` (workspaces, tasks, notes, links, diary_entries,
  goals_weekly). Each has `sync_seq`, `field_clock`, `created_device_kind/id`, `updated_device_kind/id`,
  `client_updated_at`, `sync_op_id`, maintained by the `daybook_sync_row` trigger; hard deletes leave a row
  in `sync_tombstones` (`daybook_sync_tombstone` trigger) that also keeps the deleted row as JSON in
  `row_data` (not returned by pull) — the recovery path for bulk-deleted tasks. Hard deletes happen for
  links and for tasks deleted from the multi-select bar. `sync_ops` is the push ledger (op id → result).
- **Write context**: before a write, `db.ts` sets `daybook.device_kind/device_id/op_id/op_time/updated_by`
  on the connection (session `set_config` cached per pooled client; a local transaction on PGlite) from the
  request (`syncContext.ts`, via `nitro.experimental.asyncContext`). Endpoints don't pass anything.
  Raw SQL and scripts have no context: device columns become NULL, and `updated_by` must still be set
  explicitly (see Provenance).
- **Last writer wins, per field**: on UPDATE the trigger drops any changed field whose `field_clock` entry is
  newer than this edit's time (`op_time` = the device time of a queued change, capped at the receive time;
  otherwise now). `status`, `completed`, `completed_at` share one clock. If every field is dropped the row is
  left untouched. Journal content additionally keeps its compare-and-swap (`expected_updated_at`).
- **Push** (`POST /api/sync/push`): replays each queued op through the normal endpoint in-process
  (`useNitroApp().localFetch`), in order, exactly once per op id. Only the routes in its `ALLOWED` list. A
  new endpoint the iOS app writes through needs: an `ALLOWED` entry, a `Mutation` case (request + local
  effect in `LocalEffects.swift`), and idempotency (accept a client `id`, or be an absolute set).
- **Pull** (`GET /api/sync/pull?since=`): rows with `sync_seq > since` plus tombstones; same text formats as
  other endpoints. The app does a full pull (`since=0`) daily.
- **Client ids**: creates accept a client UUID (`clientId()` in `ids.ts`). New diary pages get an id derived
  from date + workspace (`diaryIdSql` in `db.ts` = `DiaryIds.entryId` in Swift; keep them identical) so a page
  made offline and the same page made in the browser are one row.
- **Schema changes to a synced table**: the trigger covers new columns automatically. If the app should see
  the column, add it to `Rows.swift` (and the local effect/query that uses it).
- **Tests**: `app/server/utils/sync.test.ts` (triggers), `app/scripts/sync-smoke.mjs` (endpoints, against the
  test server), `ios/DaybookKit/Tests/DaybookKitTests/SyncTests.swift` (queue, conflicts, local queries).

## SQL conventions
- Use `$name` placeholders; `queryAll()` rewrites them to positional `$1…` (`server/utils/sql.ts`).
- Pass type hints (`VARCHAR`, `BOOLEAN`, `INTEGER`, `LIST(VARCHAR)` from `~/server/utils/sqlTypes`);
  each hinted placeholder gets an explicit cast. Array params: `listValue(arr)` + `LIST(VARCHAR)`, used
  as `col = ANY($ids)` or `unnest($ids)`.
- A text value bound for a DATE/TIMESTAMP column needs an explicit cast in SQL (`$date::DATE`). Client
  timestamps with a zone go through `($due_at::timestamptz AT TIME ZONE 'UTC')`.
- DATE/TIMESTAMP results come back as text (`2026-10-16`, `2026-10-16 17:30:30.24154`), never JS
  Dates — the journal compares `updated_at` byte for byte. BIGINT/NUMERIC come back as numbers.
- IDs: `gen_random_uuid()::text`. Intervals: `INTERVAL '1 day'`. `DESC` sorts NULLs first in Postgres
  (DuckDB sorted them last) — add `NULLS LAST` when sorting a nullable column descending.
- Always `String(getRouterParam())` — may return non-string.
- `app/scripts/api-smoke.mjs` exercises every route against the local test server and checks the iOS
  fixture shapes; run it after any SQL change. `app/scripts/sync-smoke.mjs` does the same for sync.

## Web UI gotchas
- `NuxtLink` ignores `preventDefault()` from a fall-through `@click`: a "select instead of open" mode must render
  a plain element (`<component :is="selectMode ? 'button' : NuxtLink">`, see `TaskItem.vue`).
- The Today page renders both a desktop board and a mobile list (one hidden by CSS), so every task appears
  twice in the DOM; browser tests must pick the visible one.
- The Today page hides archived tasks client-side (`allTaskIds` filters `archived`); their diary links stay.

## Nitro Routing
- Nested routes: `server/api/tasks/[id]/complete.patch.ts` → PATCH /api/tasks/:id/complete
- Top-level CRUD: `[id].get.ts`, `[id].put.ts`, `[id].delete.ts`
- DO NOT use `[id].foo.patch.ts` — creates wrong route

## Nuxt
- SSR disabled (`ssr: false`)
- `@electric-sql/pglite` in `nitro.rollupConfig.external` (it loads WASM files from its package dir)
- `"type": "module"` in package.json
- All `<script setup>` blocks with TypeScript must have `lang="ts"`
- All `<template>` blocks must have closing `</template>` tag

## Bruin
- Run from project root, not from `app/`
- `.bruin.yml` at project root should hold a `postgres` connection named `supabase-default`. **Pending**: as of
  2026-10-17 it still only has `motherduck-default` (the archive) — see `DEPLOY.md` runbook step 6
- `bruin validate pipeline/` then `bruin run pipeline/`

### Keep pipeline assets in sync with the database — REQUIRED
Whenever a change is made to the database schema (new table, dropped table, added/removed/renamed column, type change), you MUST refresh the Bruin asset definitions so `pipeline/` stays an accurate mirror of the database:

1. Run `bruin import database --connection supabase-default pipeline` from the project root.
2. Keep ONLY the asset files for the real app tables (tasks, notes, workspaces, diary_entries, goals_weekly, links, event_log, users, task_templates, tag_settings). Delete anything for the `backup` schema (snapshot tables are operational, not pipeline assets) and any Supabase system schemas (`auth`, `storage`, `realtime`, `extensions`, …).
3. Re-add per-column `description:` text on any columns the importer touched — `bruin import` strips descriptions, and the asset YAMLs are the canonical column dictionary.
4. Run `bruin validate pipeline/` and confirm "No issues found" before committing.
5. Commit the asset changes alongside the schema change in `app/server/utils/schema.ts` so the two never drift.

Until `supabase-default` exists (runbook step 6 in `DEPLOY.md`) the import cannot run: write or edit the asset
YAML by hand from `TABLE_DDL` in `schema.ts` (done this way for `task_templates` and `tag_settings` on
2026-10-20), then `bruin validate pipeline/`.

Also use the Bruin MCP tools when available for richer schema inspection — the CLI import is the source of truth for the on-disk asset files.

## Daybook Journal Write Safety
- Bind every journal draft and save to the immutable loaded entry identity: user, entry ID,
  actual workspace ID, entry date, and server revision. Never derive a save target from selectors
  that may already point at the next day or workspace.
- A recovered local draft must never write automatically. Show Restore/Discard, and require the
  user to choose before sending a divergent draft to the server.
- Version local draft keys. Quarantine legacy drafts instead of replaying them after draft logic
  changes.
- Journal updates must target exactly one entry and use optimistic concurrency. A NULL workspace is
  an exact value, never a wildcard for writes.
- Any change to date/workspace navigation, autosave, or session recovery requires regression tests
  proving distinct journal contents cannot cross dates or workspaces.

## iOS app (`ios/`)
- Read `ios/HANDOFF.md` first. Native SwiftUI client over the same API; `DaybookKit` (Swift package) holds
  all non-UI logic and is unit-tested with `swift test`.
- Local first: screens read and write through `Repository` (same method names as `APIClient`), which answers
  from `SyncStore.data` and queues changes; `SyncStore` syncs ~2 s after a change, on foreground, on
  reconnect and every 30 s. Read endpoints are ported in `LocalQueries.swift` and write rules in
  `LocalEffects.swift`: when an endpoint's behaviour changes, change the port too. Only auth, users,
  password and new workspaces call `APIClient` directly (online only).
- Journal offline: the local save is a content-based compare-and-swap; a save the server rejects (409, the
  page changed elsewhere) becomes a recovery draft (Restore / Discard), never a silent overwrite.
- `xcode-select` on this Mac points at CommandLineTools: export
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for `swift test` / `xcodebuild`.
- After adding or removing Swift files, run `xcodegen generate` in `ios/` (the `.xcodeproj` is generated
  from `project.yml` and committed).
- `ios/scripts/test.sh` runs everything against `ios/scripts/test-server.sh`: an isolated server with a
  throwaway PGlite database; it unsets `DATABASE_URL`, skips `app/.env`, and aborts unless the log shows
  PGlite. Never point iOS tests at the real server.
- Journal safety rules above apply to iOS too; `JournalSessionTests` and `JournalE2ETests` are the
  regression tests and must stay green.
- SwiftUI gotcha: `.accessibilityIdentifier` on a container overrides its children's identifiers; add
  `.accessibilityElement(children: .contain)` first when children need their own ids.
- Any API response shape change must keep `ios/DaybookKit/Tests/DaybookKitTests/Fixtures` decoding (they
  are real captured responses).
- Device installs: open `ios/Daybook.xcodeproj` in Xcode, pick the iPhone, Run. Signing uses the personal
  team in `project.yml` (`DEVELOPMENT_TEAM`); free-team builds expire after 7 days, so re-run from Xcode then.
  The phone must trust the developer certificate (Settings → General → VPN & Device Management).
- The production server is built in (`AppModel.builtInServer`). Release builds use only it and allow
  HTTPS only. Debug builds can change server and allow local-network HTTP: the ATS exception sits in a
  `#if DAYBOOK_DEBUG` block of the preprocessed `Daybook/Info.plist`. UI tests must pass `-uiTesting`
  (as `DaybookUITestCase.launch` does) so the app never falls back to production.
- To point a Debug build at a local dev server:
  - Use `npx nuxt dev --host 0.0.0.0 --port 3000` and enter `http://<mac LAN IP>:3000` in the app. The
    Mac's IP changes between networks (`ipconfig getifaddr en0`); phone and Mac must be on the same Wi-Fi.
  - A local production build (`node .output/server/index.mjs`) can't log in over plain http: the session
    cookie is `Secure` in production. Use the dev server, or put HTTPS in front.
  - If the checkout is in iCloud Drive (`~/Documents`), iCloud file events make the Nuxt dev watcher
    restart repeatedly, and iCloud must never sync a live PGlite directory (`data/pglite`). Run local
    servers from a checkout outside iCloud.

## User Preferences
- Keep things simple — this is a personal tool
- Document durable contributor conventions here and public product context in `README.md`; use source code, migrations, and pipeline assets as the schema/API authority
- Track agent learnings in this file
- Optimize for phone browser usage
- Color-blind friendly, high contrast
- Subtask + due date creation must be frictionless

## Safety Rules — READ BEFORE TOUCHING DATA

### Tests must use `master_tester` only
- The deployed server and any dev server with `DATABASE_URL` set hit **Supabase**, which holds the user's real data. Automated suites (`ios/scripts/test.sh`, `app/scripts/api-smoke.mjs`) only run against the throwaway PGlite test server.
- `/api/tasks` and other endpoints **do not filter by `user_id`** (known cross-user leak). A test that signs up a fresh user and then runs `selectAll()` will grab the user's real tasks too.
- **Going forward, tests run as user `master_tester` (password `password123`).** Never sign up new test users; never operate against other users' data.
- Never run "select all" + bulk-modify in browser tests. Select tasks individually by id/title prefix that you created in the same test.
- Tag every test task title with a unique prefix (e.g. `MasterTester_<feature>_<n>`) so it can be filtered out of any cleanup query.
- If a test would touch the user's data on failure, do not run it.

### Always back up before risky operations
- **Before any agent/script writes that could affect existing rows** (UPDATE, DELETE, ALTER on populated tables, mass re-keying, etc.), snapshot the affected tables to the `backup` schema in the same database (`CREATE SCHEMA IF NOT EXISTS backup`).
- **Backup naming:** `backup.<table_name>_<YYYYMMDD>_<N>` where `N` is a 1-based suffix that increments per backup taken on the same day. Check existing backups for that date before picking N.
- Use `CREATE TABLE backup.<name>_<date>_<n> AS TABLE public.<name>` (Postgres has no `CREATE OR REPLACE TABLE`; pick a new N instead). Enable RLS on the copy too (`ALTER TABLE backup.<…> ENABLE ROW LEVEL SECURITY`).
- Supabase's daily backups are a second line, not a replacement. Snapshots have already saved a 43-task corruption incident — take them aggressively.

### Retroactive data fixes — use the `DATA_REPAIRS` ledger
When existing rows are wrong because of a bug (not just a schema gap), the correct mechanism is a gated one-time repair in `DATA_REPAIRS` in `app/server/utils/schema.ts`, recorded in the `applied_migrations` ledger so it runs **exactly once** per database. Do NOT hand-run a one-off UPDATE and walk away — a repair that can re-run on boot will re-clobber values the user later edited by hand (the DuckDB-era `v6_status_now` repair did exactly that; see git history of `app/server/utils/db.ts`).

Procedure that was validated on `v12_subtask_priority_inherit` (2026-08-25, fixed 243 subtasks whose priority defaulted to 2/Focus instead of inheriting the parent's lane):
1. **Make the repair idempotent.** Scope the `WHERE` so a second run matches nothing (e.g. only touch rows still at the buggy default *and* whose target differs), and so user-edited rows and orphans are excluded. Set `updated_at` and `updated_by = 'migration_<name>'` in the same statement.
2. **Backup #1** — snapshot *all* tables to `backup.<table>_<YYYYMMDD>_1` before doing anything.
3. **Test on an isolated fixture** — build a throwaway schema (`fixtest`), or better a local PGlite database, mirroring the table, populate every case (buggy default, already-correct, user-edited, orphan), run the exact fix SQL, assert expected priorities, drop it. Never test by mutating `public.*`.
4. **Backup #2** — snapshot all tables again to `..._2` immediately before the write, so revert restores the exact pre-fix state.
5. **Apply** to `public.*`, then `INSERT` the repair name into `applied_migrations` so boot skips it. Add the same entry to `DATA_REPAIRS` so fresh restores self-heal (prod ledger already marks it done → no re-run).
6. **Backfill provenance** on exactly the rows changed, identified by diffing against backup #2 (`WHERE m.priority <> b.priority`) — an out-of-band apply that forgot `updated_by` can be repaired precisely this way.
7. **Verify** the affected-count is 0 and row totals are unchanged. Revert = restore `public.tasks` from a backup + delete the ledger row.

Gotchas:
- Ad-hoc maintenance scripts live **under `app/scripts/`** (so `pg` resolves from `app/node_modules`), run with `npx tsx`, and connect with `openDatabase()` from `server/utils/db.ts` *without* calling `ensureSchema()`, so no migration/backfill side effects fire mid-procedure. Query through the returned `db.run(sql, params)`: `queryAll()` / `execute()` go through `useDB()`, which runs `ensureSchema()` first, so a "read-only" script using them applies the checked-out branch's schema to whatever `DATABASE_URL` points at (this happened on 2026-10-19: the offline-sync schema reached production before its backup). `tsx` does not load `app/.env`; pass `--env-file=.env` (without it you silently get local PGlite).
- Postgres runs statements in a transaction when you ask it to: wrap multi-statement repairs in `BEGIN … COMMIT` on a single client so a failure leaves nothing half-applied.
- Only backup snapshots + no `public` schema change means **no Bruin asset refresh is needed** (backup tables are excluded from `pipeline/` anyway).

### Provenance: every write should set `updated_by`
All content tables (`tasks`, `notes`, `diary_entries`, `workspaces`, `links`, `users`) and `event_log` have an `updated_by VARCHAR` column. Standard values (the sync trigger fills it from the request when the statement doesn't set it):
- `user_in_app` — real user via the Nuxt UI in a browser
- `user_in_ios_app` — real user via the native iOS app (`ios/`, User-Agent `daybook-ios/<version>`)
- `user_in_test` — real user behavior simulated via Playwright (rare; prefer `test_playwright`)
- `test_playwright` — automated browser test
- `agent_query` — agent or operator running raw SQL against the database
- `agent_query_<purpose>_<date>` — agent running a one-off purposeful job (e.g. `agent_query_recovery_2026-04-27`)
- `migration_<name>` — a gated one-time `DATA_REPAIRS` migration (e.g. `migration_v12_subtask_priority`); use the same value in the SQL and when backfilling provenance on rows an out-of-band apply already changed
- `recovery_script` — generic recovery SQL
- `unknown` — fallback (only used by middleware when classification fails)

The middleware (`app/server/middleware/event-logger.ts`) sets these automatically on `event_log` rows based on `User-Agent`. **For raw-SQL agent operations, set `updated_by` explicitly** in the UPDATE/INSERT, e.g. `SET ..., updated_by = 'agent_query_<task>_<YYYY-MM-DD>'`.

### Event log captures request body
`event_log` records `request_body` (truncated to 4KB), `response_status`, `client_kind`, `request_ip`, and `duration_ms`. Use these for any future damage-recovery analysis instead of guessing from current state.

### When in doubt, ask before destructive ops
- DELETE / UPDATE on existing user data: present scope + counts to the user, wait for explicit go-ahead.
- A user approving one destructive action does NOT extend approval to others — re-confirm each time.
- "Cleanup" requests are not blanket destructive permission; surface the exact rows you plan to touch first.
