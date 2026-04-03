# AGENTS.md — Agent Instructions & Context

## Project Context
- This is a mobile-first **todo/reminder + notes app** called **rc-notes**
- Core features: tasks with subtasks, notes with @-mention linking, workspaces, 5-day calendar
- Tech: Nuxt 3 (SPA) + Tailwind CSS + DuckDB + Bruin CLI
- Runs on localhost, no auth needed
- Primary use: phone browser

## Key File Locations
- `PLAN.md` — full requirements, schema, API reference, known issues
- `.bruin.yml` — Bruin pipeline config (root)
- `pipeline/` — Bruin SQL assets
- `app/` — Nuxt 3 application
- `app/server/utils/db.ts` — DuckDB singleton + schema init (critical file)
- `app/server/api/tasks/` — Task CRUD endpoints
- `app/server/api/notes/` — Notes CRUD endpoints
- `app/composables/useNotes.ts` — exports `useTasks()`, `useNotesCrud()`, `Task`, `Note` types
- `app/composables/useWorkspace.ts` — workspace state management
- `app/assets/css/main.css` — single dim theme, all CSS utility classes defined here
- `data/notes.db` — DuckDB database file (gitignored)

## Data Model
- **workspaces**: filter-based labels (Personal, Work seeded by default)
- **tasks**: parent_id for subtasks, workspace_id, completed/completed_at, due_at, position, tags[]
- **notes**: workspace_id, title/content, tags[]
- **links**: bidirectional links between tasks and notes (source_type/id ↔ target_type/id)

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
- DB path in `.bruin.yml`: `data/notes.db`
- Nuxt resolves: `resolve(process.cwd(), '..', 'data', 'notes.db')`
- `bruin validate pipeline/` then `bruin run pipeline/`

## User Preferences
- Keep things simple — this is a personal tool
- Document everything in PLAN.md
- Track agent learnings in this file
- Optimize for phone browser usage
- Color-blind friendly, high contrast
- Subtask + due date creation must be frictionless
