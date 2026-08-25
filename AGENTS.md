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
- Core features: tasks with subtasks, notes with @-mention linking, diary, workspaces, 5-day calendar
- Tech: Nuxt 4 (SPA) + Nuxt UI + Tailwind CSS + MotherDuck (cloud DuckDB) + Bruin CLI
- Runs on localhost; it includes setup and login flows, but data endpoints are not yet consistently scoped by `user_id`
- Primary use: phone browser

## Key File Locations
- `README.md` — public project overview, setup, and pointers to implementation sources of truth
- `.bruin.yml` — Bruin pipeline config (root, gitignored — contains MotherDuck connection)
- `app/.env` — `MOTHERDUCK_NOTEBOOK_RC` token (gitignored)
- `pipeline/` — Bruin SQL assets
- `app/` — Nuxt 4 application
- `app/server/utils/db.ts` — MotherDuck/DuckDB singleton + schema init + migrations (critical file)
- `app/server/api/tasks/` — Task CRUD endpoints
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

## Color System — CRITICAL
The app uses one dim, warm-neutral Daybook theme with no light/dark toggle. `app/assets/css/main.css` is the source of truth: use its `--daybook-*` variables and mapped `--ui-*` tokens rather than reintroducing a separate palette.

- Canvas/surfaces: `#171716`, `#20201e`, `#282723`; borders: `#38362f`
- Text: `#f1ede5` primary, `#b9b4aa` muted, `#989289` faint
- Accent: muted sage `#9fb9aa` / `#c0d9c9`; warm state `#d7b17a`; danger `#d48f82`
- Preserve strong contrast and 44px touch targets. Do not use light-mode utility classes or a `dark:` variant.

## Database Connection
- **MotherDuck** (cloud): set `MOTHERDUCK_NOTEBOOK_RC` env var → `db.ts` does `INSTALL motherduck; LOAD motherduck; ATTACH 'md:'; CREATE DATABASE IF NOT EXISTS rc_notes; USE rc_notes`
- **Local fallback**: without the env var, uses local file at `data/notes.db`
- All 29 API endpoints use `queryAll()` / `execute()` from `db.ts` — they don't know about MotherDuck vs local
- Migrations use `ALTER TABLE ... ADD COLUMN` wrapped in try/catch (idempotent)
- MotherDuck adds ~50-200ms latency per query vs <5ms local — acceptable for this app's dataset size

## DuckDB Node API
- Always provide **explicit types** for all params: `VARCHAR`, `BOOLEAN`, `INTEGER`, `LIST(VARCHAR)`
- Import types from `@duckdb/node-api`
- Use `$name` syntax for named params
- Array params need `listValue(arr)` wrapper + `LIST(VARCHAR)` type
- Always `String(getRouterParam())` — may return non-string
- `runAndReadAll()` returns reader → `.getRowObjectsJson()`
- DuckDB `UNNEST()` must be in a subquery for GROUP BY

## Nitro Routing
- Nested routes: `server/api/tasks/[id]/complete.patch.ts` → PATCH /api/tasks/:id/complete
- Top-level CRUD: `[id].get.ts`, `[id].put.ts`, `[id].delete.ts`
- DO NOT use `[id].foo.patch.ts` — creates wrong route

## Nuxt
- SSR disabled (`ssr: false`) — DuckDB native module crashes Vite SSR worker
- `@duckdb/node-api` in `nitro.rollupConfig.external`
- `"type": "module"` in package.json
- All `<script setup>` blocks with TypeScript must have `lang="ts"`
- All `<template>` blocks must have closing `</template>` tag

## Bruin
- Run from project root, not from `app/`
- `.bruin.yml` at project root references `md:rc_notes` (MotherDuck) via `MOTHERDUCK_NOTEBOOK_RC` env var
- `bruin validate pipeline/` then `bruin run pipeline/`

### Keep pipeline assets in sync with the database — REQUIRED
Whenever a change is made to the database schema (new table, dropped table, added/removed/renamed column, type change, new backup snapshot), you MUST refresh the Bruin asset definitions so `pipeline/` stays an accurate mirror of MotherDuck:

1. Run `bruin import database --connection motherduck-default pipeline` from the project root.
2. Delete any junk the importer pulls in from MotherDuck's shared catalogs — keep ONLY `pipeline/assets/main/*.asset.yml` (the seven real `rc_notes.main` tables: tasks, notes, workspaces, diary_entries, links, event_log, users). Remove anything under `backup/` (snapshot tables are operational, not pipeline assets), `hn/`, `kaggle/`, `nyc/`, `stackoverflow_survey/`, `who/`, and any `main/*.sql` files for MotherDuck system views (`database_snapshots`, `databases`, `owned_shares`, `query_history`, `recent_queries`, `shared_with_me`, `storage_info*`).
3. Re-add per-column `description:` text on any columns the importer touched — `bruin import` strips descriptions, and the asset YAMLs are the canonical column dictionary.
4. Run `bruin validate pipeline/` and confirm "No issues found" before committing.
5. Commit the asset changes alongside the schema/migration change in `app/server/utils/db.ts` so the two never drift.

Also use the Bruin MCP tools when available for richer schema inspection — the CLI import is the source of truth for the on-disk asset files.

## Home Page (Tasks) UI
- Two independent toolbar controls: **order-by** (newest / due date) and **group-by** (none / workspace / tag)
- Default view: group by workspace + order newest
- Workspace groups use drag-and-drop (via `vuedraggable` with `@change` event, NOT `@end`) to move tasks between workspaces
- Flat list uses drag handles for reordering
- Empty workspace groups are hidden

## User Preferences
- Keep things simple — this is a personal tool
- Document durable contributor conventions here and public product context in `README.md`; use source code, migrations, and pipeline assets as the schema/API authority
- Track agent learnings in this file
- Optimize for phone browser usage
- Color-blind friendly, high contrast
- Subtask + due date creation must be frictionless

## Safety Rules — READ BEFORE TOUCHING DATA

### Tests must use `master_tester` only
- The dev server hits **MotherDuck cloud**, which holds the user's real data.
- `/api/tasks` and other endpoints **do not filter by `user_id`** (known cross-user leak). A test that signs up a fresh user and then runs `selectAll()` will grab the user's real tasks too.
- **Going forward, tests run as user `master_tester` (password `password123`).** Never sign up new test users; never operate against other users' data.
- Never run "select all" + bulk-modify in browser tests. Select tasks individually by id/title prefix that you created in the same test.
- Tag every test task title with a unique prefix (e.g. `MasterTester_<feature>_<n>`) so it can be filtered out of any cleanup query.
- If a test would touch the user's data on failure, do not run it.

### Always back up before risky operations
- **Before any agent/script writes that could affect existing rows** (UPDATE, DELETE, ALTER on populated tables, mass re-keying, etc.), snapshot the affected tables to the `rc_notes.backup` schema.
- **Backup naming:** `rc_notes.backup.<table_name>_<YYYYMMDD>_<N>` where `N` is a 1-based suffix that increments per backup taken on the same day. Check existing backups for that date before picking N.
- Use `CREATE OR REPLACE TABLE rc_notes.backup.<name>_<date>_<n> AS SELECT * FROM rc_notes.main.<name>` (fully qualified — DuckDB has a built-in "backup" catalog that conflicts with bare `backup.foo`).
- Backups are cheap (MotherDuck dedupes storage) and have already saved a 43-task corruption incident — take them aggressively.

### Retroactive data fixes — use the `DATA_REPAIRS` ledger
When existing rows are wrong because of a bug (not just a schema gap), the correct mechanism is a gated one-time repair in `DATA_REPAIRS` in `app/server/utils/db.ts`, recorded in the `applied_migrations` ledger so it runs **exactly once** per database. Do NOT hand-run a one-off UPDATE and walk away — a repair that can re-run on boot will re-clobber values the user later edited by hand (see the `v6_status_now` note in `db.ts`).

Procedure that was validated on `v12_subtask_priority_inherit` (2026-08-25, fixed 243 subtasks whose priority defaulted to 2/Focus instead of inheriting the parent's lane):
1. **Make the repair idempotent.** Scope the `WHERE` so a second run matches nothing (e.g. only touch rows still at the buggy default *and* whose target differs), and so user-edited rows and orphans are excluded. Set `updated_at` and `updated_by = 'migration_<name>'` in the same statement.
2. **Backup #1** — snapshot *all* tables to `rc_notes.backup.<table>_<YYYYMMDD>_1` before doing anything.
3. **Test on an isolated fixture** — build a throwaway schema (`rc_notes.fixtest`) mirroring the table, populate every case (buggy default, already-correct, user-edited, orphan), run the exact fix SQL, assert expected priorities, drop it. Never test by mutating `main.*`.
4. **Backup #2** — snapshot all tables again to `..._2` immediately before the write, so revert restores the exact pre-fix state.
5. **Apply** to `main.*`, then `INSERT` the repair name into `applied_migrations` so boot skips it. Add the same entry to `DATA_REPAIRS` so fresh restores self-heal (prod ledger already marks it done → no re-run).
6. **Backfill provenance** on exactly the rows changed, identified by diffing against backup #2 (`WHERE m.priority <> b.priority`) — an out-of-band apply that forgot `updated_by` can be repaired precisely this way.
7. **Verify** the affected-count is 0 and row totals are unchanged. Revert = restore `main.tasks` from a backup + delete the ledger row.

Gotchas:
- Ad-hoc maintenance scripts must live **under `app/`** (ESM resolves `@duckdb/node-api` from the script's own directory, not cwd) and should connect directly (`INSTALL/LOAD motherduck; SET token; ATTACH 'md:'; USE rc_notes`) *without* calling `ensureSchema()`, so no migration/backfill side effects fire mid-procedure.
- Fully qualify the backup/test schemas as `rc_notes.backup` / `rc_notes.fixtest` — `ATTACH 'md:'` exposes a built-in `backup` catalog and bare `backup.foo` is ambiguous.
- The `@duckdb/node-api` native addon can crash a process (`libc++abi: terminating due to uncaught exception of type Napi::Error`) when a second connection hits MotherDuck concurrently — expect the dev server to die while a script runs against the same DB; just restart it, the data is unaffected.
- Only backup snapshots + no `main` schema change means **no Bruin asset refresh is needed** (backup tables are excluded from `pipeline/` anyway).

### Provenance: every write should set `updated_by`
All content tables (`tasks`, `notes`, `diary_entries`, `workspaces`, `links`, `users`) and `event_log` have an `updated_by VARCHAR` column. Standard values:
- `user_in_app` — real user via the Nuxt UI in a browser
- `user_in_test` — real user behavior simulated via Playwright (rare; prefer `test_playwright`)
- `test_playwright` — automated browser test
- `agent_query` — agent or operator running raw SQL via MotherDuck
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
