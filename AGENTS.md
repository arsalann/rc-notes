# AGENTS.md — Agent Instructions & Context

## Project Context
- This is a mobile-first **todo/reminder + notes app** called **rc-notes**
- Core features: tasks with subtasks, notes with @-mention linking, diary, workspaces, 5-day calendar
- Tech: Nuxt 4 (SPA) + Nuxt UI + Tailwind CSS + MotherDuck (cloud DuckDB) + Bruin CLI
- Runs on localhost, no auth needed (yet — schema has user_id/user_name columns ready)
- Primary use: phone browser

## Key File Locations
- `PLAN.md` — full requirements, schema, API reference, known issues
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
The app uses a **single dim theme** with NO light/dark mode toggle. All colors are defined in `app/assets/css/main.css` as CSS utility classes.

**Palette** (Tailwind zinc scale):
- Body: #18181b (zinc-900)
- Card: #27272a (zinc-800) — `.surface-card`
- Input: #3f3f46 (zinc-700) — `.surface-input`
- Overlay: #27272a with #52525b border — `.surface-overlay`
- Text: #fafafa primary, #a1a1aa `.text-muted`, #71717a `.text-faint`
- Accent: teal-400/#2dd4bf `.accent-text`, teal-600/#0d9488 `.accent-bg`

**Reusable classes** defined in CSS:
- `.surface-card`, `.surface-input`, `.surface-overlay` — background surfaces
- `.text-muted`, `.text-faint` — text hierarchy
- `.accent-text`, `.accent-bg` — teal accent
- `.btn-primary`, `.btn-secondary`, `.btn-danger` — buttons
- `.btn-tap` — press feedback (scale 0.97)
- `.touch-target` — 44px min touch area
- `.section-label` — uppercase section headers
- `.checkbox-unchecked`, `.checkbox-checked` — checkbox states
- `.tag` — tag pill styling
- `.badge-task`, `.badge-note` — type badges with proper contrast
- `.divider` — horizontal rule

**DO NOT use Tailwind `dark:` prefix** — there is no dark mode toggle. DO NOT use `bg-white`, `bg-zinc-50`, `bg-zinc-100`, `text-zinc-900`, or any light-mode Tailwind classes. These will render as white/light on the dark body and look broken.

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

## Home Page (Tasks) UI
- Two independent toolbar controls: **order-by** (newest / due date) and **group-by** (none / workspace / tag)
- Default view: group by workspace + order newest
- Workspace groups use drag-and-drop (via `vuedraggable` with `@change` event, NOT `@end`) to move tasks between workspaces
- Flat list uses drag handles for reordering
- Empty workspace groups are hidden

## User Preferences
- Keep things simple — this is a personal tool
- Document everything in PLAN.md
- Track agent learnings in this file
- Optimize for phone browser usage
- Color-blind friendly, high contrast
- Subtask + due date creation must be frictionless
