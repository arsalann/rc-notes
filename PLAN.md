# rc-notes: Mobile-First Todo, Notes & Calendar App

## Overview
A personal productivity app with tasks (+ subtasks), notes, diary, and a 5-day calendar view. Items can be linked together via @-mentions. Workspaces (Personal, Work, etc.) act as filters across all content. Optimized for phone browsers, backed by MotherDuck (cloud DuckDB).

## User Requirements & Preferences
- Mobile-first: primarily used in phone browser
- **Dark theme** — purple accent, color-blind friendly, no light/dark toggle
- **Four main sections**: Tasks, Notes, Diary, Calendar — linked via @-mentions
- **Workspaces**: filter-based labels (Personal, Work, etc.), easily switchable
- **Calendar**: 5-day view (2 days before + today + 2 days after) as its own tab
- **Task creation must be frictionless**: expandable quick-add with inline subtasks, due date shortcuts (Today/Tomorrow/Next week)
- **Home page**: independent group-by (workspace/tag/none) and order-by (newest/due date) controls, default view is group by workspace + order newest
- MotherDuck cloud database with local DuckDB fallback
- Runs on localhost, use Bruin CLI for data pipelines

## Tech Stack
- **Frontend**: Nuxt 4 (SPA mode, SSR disabled), Vue 3, Nuxt UI, Tailwind CSS
- **API**: Nitro server routes
- **Database**: MotherDuck (cloud DuckDB) via `@duckdb/node-api`, local DuckDB fallback
- **Pipelines**: Bruin CLI

## Color Palette (Single Dim Theme)
| Element | Color | Zinc |
|---------|-------|------|
| Body | #18181b | zinc-900 |
| Card | #27272a | zinc-800 |
| Input/surface | #3f3f46 | zinc-700 |
| Border (overlay) | #52525b | zinc-600 |
| Checkbox border | #71717a | zinc-500 |
| Text primary | #fafafa | zinc-50 |
| Text muted | #a1a1aa | zinc-400 |
| Text faint | #71717a | zinc-500 |
| Tags | #3f3f46 bg + #d4d4d8 text | |
| Accent | #2dd4bf / #0d9488 | teal-400/600 |
| Danger | #b91c1c | red-700 |

## Database Schema

All content tables include `user_id` and `user_name` columns for future multi-user support. The database is `rc_notes` on MotherDuck.

- **workspaces**: id, user_id, user_name, name, description, emoji, color, position, archived, created_at, updated_at
- **tasks**: id, display_id, user_id, user_name, workspace_id, parent_id (subtasks), title, description, status, priority, completed, completed_at, pinned, archived, deleted_at, due_at, reminder_at, tags[], position, created_at, updated_at
- **notes**: id, display_id, user_id, user_name, workspace_id, title, content, pinned, archived, deleted_at, tags[], created_at, updated_at
- **links**: id, user_id, source_type, source_id, target_type, target_id, created_at
- **diary_entries**: id, user_id, user_name, workspace_id, entry_date, content, deleted_at, created_at, updated_at
- **event_log**: id, user_id, user_name, event_type, method, path, entity_type, entity_id, workspace_id, metadata, user_agent, created_at

## Navigation
- **Bottom nav**: Tasks, Notes, Diary, Calendar (4 tabs) + global search
- **Header**: Workspace switcher dropdown
- Archive accessible from item detail views

## API Endpoints
### Tasks
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/tasks?workspace_id= | List top-level tasks (with subtask counts) |
| POST | /api/tasks | Create task/subtask (pass parent_id) |
| GET | /api/tasks/:id | Get task + subtasks |
| PUT | /api/tasks/:id | Update task |
| DELETE | /api/tasks/:id | Delete + subtasks |
| PATCH | /api/tasks/:id/complete | Toggle complete |
| PATCH | /api/tasks/:id/pin | Toggle pin |
| PATCH | /api/tasks/:id/archive | Toggle archive |

### Notes
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/notes?workspace_id= | List notes |
| POST | /api/notes | Create note |
| GET | /api/notes/:id | Get note + links |
| PUT | /api/notes/:id | Update note |
| DELETE | /api/notes/:id | Delete + links |
| PATCH | /api/notes/:id/pin | Toggle pin |

### Other
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/workspaces | List workspaces |
| POST | /api/workspaces | Create workspace |
| POST | /api/links | Create link (deduped) |
| GET | /api/calendar?workspace_id= | 5-day calendar data |
| GET | /api/search?q=&workspace_id= | Search tasks + notes |
| GET | /api/mention?q= | @-mention autocomplete |

## Known Issues / Next Steps
- Archive page was removed — needs a way to access archived items (could be a filter toggle on Tasks/Notes pages)
- @-mention dropdown positioning could be improved (currently fixed at top of textarea)
- No recurring tasks
- No due date notifications / reminders (schema has `reminder_at` column ready)
- DuckDB `@duckdb/node-api` requires explicit types for ALL params (VARCHAR, BOOLEAN, INTEGER, LIST)
- Workspace deletion/editing not implemented yet
- `user_id` / `user_name` columns exist but are not yet populated (no auth layer)
- `status` and `priority` columns on tasks exist but are not yet exposed in the UI
- `deleted_at` soft-delete columns exist but DELETE endpoints still hard-delete

## Prompts Log
1. "create a simple and elegant but powerful notes app. backend duckdb, later motherduck. localhost. optimized for phone. use bruin. nuxt is good."
2. "make it color blind friendly. single theme compatible for both light and dark mode"
3. "this is mainly a todo/reminder app not a note taking one. the key thing is the ability to create todo items and subtasks"
4. "lets have two separate tabs, one for notes and one for todos - linked like a ticketing system with @mentions. workspaces (personal, work). calendar 5-day view. better UX with dedicated buttons."
5. "UI/UX is shit — make it dynamic, clean, fluid. subtask + due date must be super easy when creating a task."
6. "the color should be something inbetween dark and light theme"
7. "the whole color theme is fucked, white text on white background. high contrast, clear divisions and boxes. modern standard universal UX."
