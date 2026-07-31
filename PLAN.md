# rc-notes: Mobile-First Todo, Notes & Calendar App

## Overview
A personal productivity app with tasks (+ subtasks), notes, diary, and a 5-day calendar view. Items can be linked together via @-mentions. Workspaces (Personal, Work, etc.) act as filters across all content. Optimized for phone browsers, backed by MotherDuck (cloud DuckDB).

## User Requirements & Preferences
- Mobile-first: primarily used in phone browser
- **Single dim theme** — warm-neutral ink canvas with a muted sage accent, color-blind friendly, no light/dark toggle
- **Four main sections**: Tasks, Notes, Diary, Calendar — linked via @-mentions
- **Notebook groups**: diary entries with written content appear as date-titled diary notes, separately from ordinary notes; both groups are collapsible
- **Diary navigation**: previous/next day buttons shift the seven-day selector and selected diary date, with exact dates deep-linkable through `?date=YYYY-MM-DD`
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

## Calm mobile redesign (2026-07)

The UI is being refactored toward a quiet editorial utility: one clear primary
action per screen, flatter list rows, a stable single-column hierarchy, and
progressive disclosure for sort/group/bulk tools. The diary is the primary
landing surface and keeps the date rail, journal editor, linked tasks, task
conversion, workspace filtering, search, and week summary behavior intact.

Research principles applied:

- Apple HIG: purpose and simplicity first; use typography, spacing, and direct
  language to establish hierarchy.
- Nielsen Norman Group: remove irrelevant information, but do not hide core
  affordances behind a “zen mode.”
- Material 3: use a consistent responsive scaffold rather than bespoke card
  compositions for each screen.
- WCAG 2.2: keep text contrast legible and interactive targets comfortably
  touchable on phone screens.

The redesign is visual and interaction-level only. MotherDuck, the database
schema, API routes, and data model are unchanged.

UX pass in progress (2026-08): the Daybook now has a persistent optional Focus
mode that removes secondary controls while keeping the active workspace visible,
a compact daily open/done progress cue, a carry-forward review banner when a
new page inherits unfinished threads, and visible save feedback after drag
reordering. Quick capture also previews the title and recognized hashtags,
priority, status, and due date before submission. These changes use local
preferences and existing task fields only; no database migration is required.
Focus mode defaults on. Diary writing now enters edit mode by tapping the
journal itself, saves after a short pause, and returns to preview automatically.
The journal header also provides a safe previous-page copy action with append or
replace confirmation when the current page already contains writing.

Brand direction: the app shell now uses a system editorial serif stack so it
feels closer to a personal journal while keeping monospace utility labels
readable. The current Daybook favicon is the selected flat geometric
pen/book/sun mark in `app/public/daybook-mark*.png`; the comparison set is
collected in `/logo-options` and `app/public/logo-options-v4/`.

Daybook task ordering uses the existing `tasks.position` field and update
endpoint. The `Custom order` preference is stored in the existing browser
preferences store; dragging writes the resulting positions without a migration.
Because `position` belongs to the task rather than a diary/date relationship,
the manual order is global wherever that task appears.

On wide screens, Daybook keeps the journal/list presentation on phones and
switches its open tasks to a priority kanban: Critical, Focus, Snack, and an
Unsorted overflow column. Moving a card between columns updates the existing
`tasks.priority` field and preserves the existing manual position ordering; no
schema or backend endpoint changes are required.

## Color Palette (Single Dim Theme)
| Element | Color | Role |
|---------|-------|------|
| Body | #171716 | warm graphite |
| Surface | #20201e | warm graphite raised |
| Raised surface | #282723 | warm stone |
| Border | #38362f | warm stone line |
| Text primary | #f1ede5 | warm ivory |
| Text muted | #b9b4aa | warm gray |
| Text faint | #989289 | accessible warm gray |
| Accent | #9fb9aa / #c0d9c9 | muted sage |
| Warm state | #d7b17a | muted amber |
| Danger | #d48f82 | muted rose |

## Database Schema

All content tables include `user_id` and `user_name` columns for future multi-user support. The database is `rc_notes` on MotherDuck.

- **workspaces**: id, user_id, user_name, name, description, emoji, color, position, archived, created_at, updated_at
- **tasks**: id, display_id, user_id, user_name, workspace_id, parent_id (subtasks), title, description, status, priority, completed, completed_at, pinned, archived, deleted_at, due_at, reminder_at, tags[], position, created_at, updated_at
- **notes**: id, display_id, user_id, user_name, workspace_id, title, content, pinned, archived, deleted_at, tags[], created_at, updated_at
- **links**: id, user_id, source_type, source_id, target_type, target_id, created_at
- **diary_entries**: id, user_id, user_name, workspace_id, entry_date, content, deleted_at, created_at, updated_at
- **event_log**: id, user_id, user_name, event_type, method, path, entity_type, entity_id, workspace_id, metadata, user_agent, created_at

## Navigation
- **Bottom nav**: Today, Tasks, Notes, Settings (4 labeled tabs)
- **Header**: Workspace switcher dropdown on list surfaces; Diary keeps a compact
  workspace rail for one-thumb filtering
- **Calendar**: reachable from the Tasks header and retains its 5-day view
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
| GET | /api/diary?workspace_id= | List diary entries with written content for the Notebook |

## Known Issues / Next Steps
- Tasks and Notes each have an archive-view toggle; archived items stay hidden by default and can be restored from their detail view.
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
