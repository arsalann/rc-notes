# rc-notes

A mobile-first personal productivity app with **tasks**, **notes**, **diary**, and a **5-day calendar view**. Items can be linked via @-mentions. Workspaces (Personal, Work, etc.) act as filters across all content.

## Tech Stack

- **Frontend**: Nuxt 4 (SPA), Vue 3, Nuxt UI, Tailwind CSS
- **API**: Nitro server routes
- **Database**: MotherDuck (cloud DuckDB) via `@duckdb/node-api`, with local DuckDB fallback
- **Pipelines**: Bruin CLI (SQL assets for schema + analytics)

## Quick Start

```bash
# Set the MotherDuck token (required for cloud mode)
export MOTHERDUCK_NOTEBOOK_RC="your_motherduck_token"

# Start the app
cd app && npm install && npm run dev -- --host

# Run Bruin pipelines (from project root)
bruin run pipeline/
```

The app runs at `http://localhost:3000` and is accessible on your LAN for phone access. Without `MOTHERDUCK_NOTEBOOK_RC`, the app falls back to a local DuckDB file at `data/notes.db`.

## Features

- **Tasks**: Create tasks with subtasks, due dates, tags, priority. Quick-add with inline subtask/date picker (Today/Tomorrow/Next week shortcuts). Drag-and-drop reordering and workspace assignment.
- **Notes**: Markdown notes with @-mention linking to tasks or other notes. Autosave.
- **Diary**: Daily journal entries with carry-forward of incomplete tasks.
- **Calendar**: 5-day view (2 days before + today + 2 days after) showing scheduled tasks.
- **Search**: Unified search across tasks and notes.
- **Workspaces**: Filter-based labels (Personal, Work, etc.) — seeded by default. Independent group-by (workspace, tag) and order-by (newest, due date) controls on the home page.
- **Dark theme**: Purple accent, color-blind safe, no light/dark toggle.

## Project Structure

```
├── PLAN.md              # Full requirements, schema, API reference
├── AGENTS.md            # Agent instructions and learnings
├── .bruin.yml           # Bruin config (MotherDuck connection, gitignored)
├── pipeline/            # Bruin SQL assets
│   └── assets/          # Schema init, analytics
└── app/                 # Nuxt 4 application
    ├── .env             # MOTHERDUCK_NOTEBOOK_RC token (gitignored)
    ├── server/          # API endpoints (Nitro)
    ├── pages/           # Vue pages
    ├── components/      # Vue components
    └── composables/     # Vue composables
```

## API

See [PLAN.md](PLAN.md) for full API endpoint reference.

## Data

- **MotherDuck** cloud database `rc_notes` (primary, via `MOTHERDUCK_NOTEBOOK_RC` env var)
- **DuckDB** local fallback at `data/notes.db` when no token is set
- **Bruin** manages schema and analytics pipelines
- Schema includes `user_id`/`user_name` columns on all tables for future multi-user support
