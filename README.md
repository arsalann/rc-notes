# rc-notes

A mobile-first personal productivity app with **tasks**, **notes**, and a **5-day calendar view**. Items can be linked via @-mentions. Workspaces (Personal, Work, etc.) act as filters across all content.

## Tech Stack

- **Frontend**: Nuxt 3 (SPA), Vue 3, Tailwind CSS
- **API**: Nitro server routes
- **Database**: DuckDB via `@duckdb/node-api`
- **Pipelines**: Bruin CLI (SQL assets for schema + analytics)

## Quick Start

```bash
# Start the app
cd app && npm install && npm run dev -- --host

# Run Bruin pipelines (from project root)
bruin run pipeline/
```

The app runs at `http://localhost:3000` and is accessible on your LAN for phone access.

## Features

- **Tasks**: Create tasks with subtasks, due dates, tags. Quick-add with inline subtask/date picker (Today/Tomorrow/Next week shortcuts).
- **Notes**: Rich text notes with @-mention linking to tasks or other notes.
- **Calendar**: 5-day view (2 days before + today + 2 days after) showing scheduled tasks.
- **Search**: Unified search across tasks and notes.
- **Workspaces**: Filter-based labels (Personal, Work, etc.) — seeded by default, easily extendable.
- **Single dim theme**: Warm charcoal palette (zinc scale), color-blind safe teal accent, no light/dark toggle.

## Project Structure

```
├── PLAN.md              # Full requirements, schema, API reference
├── AGENTS.md            # Agent instructions and learnings
├── .bruin.yml           # Bruin config (DuckDB connection)
├── data/notes.db        # DuckDB file (gitignored)
├── pipeline/            # Bruin SQL assets
│   └── assets/          # Schema init, analytics
└── app/                 # Nuxt 3 application
    ├── server/          # API endpoints (Nitro)
    ├── pages/           # Vue pages
    ├── components/      # Vue components
    └── composables/     # Vue composables
```

## API

See [PLAN.md](PLAN.md) for full API endpoint reference.

## Data

- **DuckDB** embedded database at `data/notes.db` (auto-created on first run)
- **Bruin** manages schema and analytics pipelines
- **Motherduck** migration path pre-configured in `.bruin.yml`
