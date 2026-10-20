# rc-notes

A mobile-first personal productivity app with **tasks**, **notes**, **diary**, and a **5-day calendar view**. Items can be linked via @-mentions. Workspaces (Personal, Work, etc.) act as filters across all content.

Daybook, the diary, is the default landing surface. It combines a dated journal page, incomplete-task carry-forward, workspace filtering, quick capture, and a weekly summary; task order can be adjusted directly and becomes a priority board on wide screens.

## Tech Stack

- **Frontend**: Nuxt 4 (SPA), Vue 3, Nuxt UI, Tailwind CSS
- **API**: Nitro server routes
- **Database**: Postgres on Supabase via `pg`, with an embedded Postgres (PGlite) fallback for local dev and tests
- **Hosting**: Railway (Dockerfile, one service). See [`DEPLOY.md`](DEPLOY.md)
- **Pipelines**: Bruin CLI (SQL assets for schema + analytics)

## Quick Start

```bash
cd app && npm install && npm run dev -- --host
```

The app runs at `http://localhost:3000` and is reachable on your LAN for phone access. With no
configuration it uses a local embedded Postgres in `data/pglite`. To work against the real database,
put `DATABASE_URL` (and `DATABASE_CA_CERT`) in `app/.env`; see [`DEPLOY.md`](DEPLOY.md).

The deployed app runs on Railway against Supabase (EU) at
`https://rc-notes-production-a50f.up.railway.app`; the iPhone app and the phone browser both use it. [`DEPLOY.md`](DEPLOY.md) covers setup, the data
migration from MotherDuck, and rollback.

## Features

- **Tasks**: Create tasks with subtasks, due dates, tags, priority. Quick-add with inline subtask/date picker (Today/Tomorrow/Next week shortcuts). Drag-and-drop reordering and workspace assignment.
- **Multi-select**: On Tasks and Today, the select button (next to the add/filter controls) turns on selection; then mark as Next/Now/Done, set priority, archive or delete the selected tasks in one go.
- **Templates**: Save a task and its subtasks as a template (template icon on the task page), edit templates in Settings → Templates, and create them again from **Template** in the add-task form or **Use** in Settings.
- **Tags**: Settings → Tags lists built-in and custom tags with how many tasks use them. Rename (custom tags are rewritten on every task and note, after a warning), set an emoji, or archive tags to hide them from the tag picker.
- **Notes**: Markdown notes with @-mention linking to tasks or other notes. Autosave.
- **Daybook**: The default daily journal, with deep-linkable dates, carry-forward of incomplete tasks, quick capture, daily progress, and a weekly summary. Settings → Today Page can hide the journal or weekly goals card (per device).
- **Calendar**: 5-day view (2 days before + today + 2 days after) showing scheduled tasks.
- **Search**: Unified search across tasks and notes.
- **Workspaces**: Filter-based labels (Personal, Work, etc.) — seeded by default. Tasks can be grouped by workspace or tag and sorted by newest or due date.
- **Theme**: A single dim, warm-neutral Daybook theme with a muted sage accent; there is no light/dark toggle.

## iOS app

A native SwiftUI client lives in [`ios/`](ios/). It has the same features with a native iOS design:
Today (journal, weekly goals, the page's tasks, week summary), Tasks, Notes, a 5-day calendar, search
and Settings. It is **offline first**: it keeps a local copy of your data, saves every change on the
phone at once and syncs with the deployed API (address built in) in the background, within seconds
when online. Edits made offline merge by field (the newest edit wins); journal pages changed on two
devices are never overwritten, the phone's version is offered as a draft.
Templates, tag settings, the Today page switches and multi-select (with delete) work on the phone too;
templates and tag settings need a connection to edit, and using a template works offline.
Build, test and architecture notes: [`ios/HANDOFF.md`](ios/HANDOFF.md).

- **Requirements**: Xcode 27+, iOS 18+, `brew install xcodegen`.
- **Install on an iPhone**: open `ios/Daybook.xcodeproj`, select your iPhone, press Run. On the phone,
  trust the developer certificate under Settings → General → VPN & Device Management. Run installs the
  Release build (set in `ios/project.yml`): it talks to the production server over HTTPS only.
  Debug builds (used by the tests) can switch to a local dev server.
- **Tests**: `ios/scripts/test.sh` runs the DaybookKit unit tests and the end-to-end UI flows. They use
  a throwaway local server with an embedded database, never the real one.

## Project Structure

```
├── AGENTS.md            # Agent instructions and learnings
├── DEPLOY.md            # Supabase + Railway deployment and data migration
├── .bruin.yml           # Bruin config (database connection, gitignored)
├── ios/                 # Native SwiftUI app (see ios/HANDOFF.md)
├── pipeline/            # Bruin SQL assets
│   └── assets/          # Schema init, analytics
└── app/                 # Nuxt 4 application
    ├── .env             # DATABASE_URL, SESSION_SECRET (gitignored)
    ├── scripts/         # API smoke test, MotherDuck → Postgres migration
    ├── server/          # API endpoints (Nitro)
    ├── pages/           # Vue pages
    ├── components/      # Vue components
    └── composables/     # Vue composables
```

## Implementation references

- API routes: [`app/server/api/`](app/server/api/)
- Live schema and idempotent migrations: [`app/server/utils/schema.ts`](app/server/utils/schema.ts)
- Versioned schema dictionary: [`pipeline/assets/main/`](pipeline/assets/main/)
- Contributor conventions and data-safety rules: [`AGENTS.md`](AGENTS.md)

## Data

- **Postgres** on Supabase (production, via `DATABASE_URL`); row level security is on for every table
- **PGlite** embedded Postgres in `data/pglite` when `DATABASE_URL` is unset (local dev, tests)
- **MotherDuck** `rc_notes` is the read-only archive from before the move to Postgres
- **Bruin** keeps the versioned schema dictionary in `pipeline/`
- Multi-user: every row has an owner (`user_id`) and row level security keeps each account's data
  private; accounts can be deleted in Settings. Privacy policy at `/privacy`, support at `/support`
- Every content row records which device last wrote it and when (`updated_device_kind/id`,
  `client_updated_at`), and a per-field clock for offline sync (see `AGENTS.md` "Offline sync")
