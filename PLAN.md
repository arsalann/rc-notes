# rc-notes: Mobile-First Todo, Notes & Calendar App

## Overview
A personal productivity app with tasks (+ subtasks), notes, and a 5-day calendar view. Items can be linked together via @-mentions. Workspaces (Personal, Work, etc.) act as filters across all content. Optimized for phone browsers, backed by DuckDB.

## User Requirements & Preferences
- Mobile-first: primarily used in phone browser
- **Single dim theme** — zinc scale palette, color-blind friendly teal accent, no light/dark toggle
- **Two main sections**: Tasks (todos with subtasks + due dates) and Notes — linked via @-mentions
- **Workspaces**: filter-based labels (Personal, Work, etc.), easily switchable
- **Calendar**: 5-day view (2 days before + today + 2 days after) as its own tab
- **Task creation must be frictionless**: expandable quick-add with inline subtasks, due date shortcuts (Today/Tomorrow/Next week)
- DuckDB backend (Motherduck migration later)
- Runs on localhost, use Bruin CLI for data pipelines

## Tech Stack
- **Frontend**: Nuxt 3 (SPA mode, SSR disabled), Vue 3, Tailwind CSS
- **API**: Nitro server routes
- **Database**: DuckDB via `@duckdb/node-api`
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
- **workspaces**: id, name, emoji, position
- **tasks**: id, workspace_id, parent_id (subtasks), title, description, completed, completed_at, pinned, archived, due_at, tags[], position, timestamps
- **notes**: id, workspace_id, title, content, pinned, archived, tags[], timestamps
- **links**: id, source_type, source_id, target_type, target_id, created_at

## Navigation
- **Bottom nav**: Tasks, Notes, Calendar, Search (4 tabs)
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
- No drag-to-reorder for tasks/subtasks yet
- No recurring tasks
- No due date notifications
- DuckDB `@duckdb/node-api` requires explicit types for ALL params (VARCHAR, BOOLEAN, INTEGER, LIST)
- Workspace deletion/editing not implemented yet

## Prompts Log
1. "create a simple and elegant but powerful notes app. backend duckdb, later motherduck. localhost. optimized for phone. use bruin. nuxt is good."
2. "make it color blind friendly. single theme compatible for both light and dark mode"
3. "this is mainly a todo/reminder app not a note taking one. the key thing is the ability to create todo items and subtasks"
4. "lets have two separate tabs, one for notes and one for todos - linked like a ticketing system with @mentions. workspaces (personal, work). calendar 5-day view. better UX with dedicated buttons."
5. "UI/UX is shit — make it dynamic, clean, fluid. subtask + due date must be super easy when creating a task."
6. "the color should be something inbetween dark and light theme"
7. "the whole color theme is fucked, white text on white background. high contrast, clear divisions and boxes. modern standard universal UX."
