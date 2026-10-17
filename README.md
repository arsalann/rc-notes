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

The deployed app runs on Railway against Supabase. [`DEPLOY.md`](DEPLOY.md) covers setup, the data
migration from MotherDuck, and rollback.

## Features

- **Tasks**: Create tasks with subtasks, due dates, tags, priority. Quick-add with inline subtask/date picker (Today/Tomorrow/Next week shortcuts). Drag-and-drop reordering and workspace assignment.
- **Notes**: Markdown notes with @-mention linking to tasks or other notes. Autosave.
- **Daybook**: The default daily journal, with deep-linkable dates, carry-forward of incomplete tasks, quick capture, daily progress, and a weekly summary.
- **Calendar**: 5-day view (2 days before + today + 2 days after) showing scheduled tasks.
- **Search**: Unified search across tasks and notes.
- **Workspaces**: Filter-based labels (Personal, Work, etc.) — seeded by default. Tasks can be grouped by workspace or tag and sorted by newest or due date.
- **Theme**: A single dim, warm-neutral Daybook theme with a muted sage accent; there is no light/dark toggle.

## iOS app

A native SwiftUI client lives in [`ios/`](ios/). It talks to this server's API (enter the same address
you open in the phone browser) and has the same features with a native iOS design: Today (journal,
weekly goals, the page's tasks, week summary), Tasks, Notes, a 5-day calendar, search and Settings.
Build, test and architecture notes: [`ios/HANDOFF.md`](ios/HANDOFF.md).

- **Requirements**: Xcode 27+, iOS 18+, `brew install xcodegen`.
- **Install on an iPhone**: open `ios/Daybook.xcodeproj`, select your iPhone, press Run. On the phone,
  trust the developer certificate under Settings → General → VPN & Device Management. On first launch,
  enter the server address, e.g. `http://192.168.1.20:3000` on the LAN.
- **Tests**: `ios/scripts/test.sh` runs 49 unit tests and 11 end-to-end UI flows. They use a throwaway
  local server with an embedded database, never the real one.

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
- Schema includes `user_id`/`user_name` columns on all tables for future multi-user support
