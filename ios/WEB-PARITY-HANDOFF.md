# iOS ← web parity (templates, tags, Today options, bulk select) — Handoff

Branch: `arsalann/ios-web-parity` (from `main` at `321c58b`, PR #53 merged + deployed 2026-10-20).
Update this file after every task, so work can resume from here if a session ends mid-way.

## Already done on the web (PR #53, live in production)

- **Templates**: table `task_templates` (not synced). `GET/POST /api/templates`, `PUT/DELETE /api/templates/:id`
  (soft delete). Subtasks are a JSON array `{title, description, priority|null, tags}`. Using a template = create
  the task, then each subtask, with client ids (`app/composables/useTemplates.ts`).
- **Multi-select**: `POST /api/tasks/bulk` `{ids, action: archive|unarchive|delete|status|priority, value}`.
  Delete hard-deletes tasks + subtasks (any depth) + their links; tombstones (with `row_data`) tell the app.
- **Tags**: table `tag_settings` (not synced): per tag key (catalog key or `manual:<normalized>`) `label`/`emoji`
  overrides and `archived`. `GET /api/tags` (list with counts), `PUT /api/tags` (overrides),
  `POST /api/tags/rename` (custom tags only; rewrites `tasks.tags`/`notes.tags`).
- **Today page**: per-device switches to hide the Journal / Weekly Goals cards. Web hides archived tasks on Today.

## Plan for iOS (decisions)

- Templates + tag settings are online-only on iOS (like users/workspaces): `APIClient` calls, no sync table.
  Creating tasks from a template goes through `Repository.createTask` (works offline, queued).
- Tag display overrides: fetched on launch/foreground, cached (in memory + UserDefaults), applied wherever tag
  labels/emoji render; archived tags hidden from the tag picker.
- Bulk delete needs a queued mutation → server `POST /api/tasks/bulk` must be in the push `ALLOWED` list
  (server change in this branch; delete is an absolute action, so replay is safe).
- Today section switches: `UserDefaults` (`@AppStorage`), per device like the web.

## Tasks

| # | Task | Status |
|---|------|--------|
| 0 | Survey iOS code, write this file | ✅ done |
| 1 | Server: allow `POST /api/tasks/bulk` in sync push; smoke test | ✅ done (`push.post.ts` ALLOWED, `sync-smoke.mjs` bulk delete + replay + tombstones) |
| 2 | DaybookKit: bulk delete mutation (`deleteTasks`) + local effect (tasks, subtasks, links) + tests | ✅ done (`Mutation.deleteTasks`, `LocalData.deleteTasks`, `Repository.deleteTasks(ids:)`, ack drops rows from the server copy; test `deleteTasksTakesSubtasksAndLinks`) |
| 3 | DaybookKit: API models + `APIClient` calls for templates and tags; decoding tests | ✅ done (`Models/TemplatesAndTags.swift`: `TaskTemplate`, `TemplateSubtask`, `TagSummary`, `TagOverrides` (present/isArchived/pickerOptions), `TaskTags.manualKey`, `APIClient.templates/createTemplate/updateTemplate/deleteTemplate/tags/updateTag/renameTag`, `Repository.createTasks(from:)`; fixtures `templates.json`, `tags.json`; `TemplatesAndTagsTests.swift`) |
| 4 | Today: hide archived tasks; Settings switches to hide Journal / Goals | ✅ done (`Preferences.todayShowJournal/todayShowGoals`, Settings "Today page" section, `TodayView` hides the cards, `TodayModel.allTaskIds` drops archived) |
| 5 | Today: select mode + bulk bar (mark as, priority, archive, delete) | ✅ done (toolbar `today.select` button; `selectSection` flat list; shared `Shared/BulkBar.swift` + `bulkDeleteConfirmation`; `TodayModel.bulkUpdate/bulkArchive/bulkDelete`, `deletedIds` hides deleted rows until links refresh). Not yet UI-tested — see task 10 |
| 6 | Tasks: add Delete to the existing multi-select bar | ✅ done (Tasks uses `BulkBar`; `TasksModel.bulkDelete`; select button `tasks.select` in the top bar next to view menu / add; "Select tasks" stays in the view menu too) |
| 7 | Task detail: Save as template; Quick add: create from template | ✅ done (AppModel `templates` + `tagOverrides`, cached in UserDefaults, refreshed by `refreshTemplatesAndTags()` after each sync; QuickAddSheet "From template" section (`onTemplate`); `TodayModel.addFromTemplate` (due on the page's day), `TasksModel.addFromTemplate`; `TaskDetailView` "Save as template" (`detail.saveTemplate`, online only)) |
| 8 | Settings: Templates section (list, edit, delete, use) | ✅ done (`Features/Settings/TemplatesSettings.swift`: `TemplatesSection` + `TemplateEditor` (name, title, details, priority, workspace, tags, subtasks add/delete/reorder, Save, Delete, Create task); Settings refreshes templates/tags on open) |
| 9 | Settings: Tags section (overrides, rename with warning, archive); apply overrides + hide archived in picker | ✅ done (`Features/Settings/TagsSettings.swift`: `TagsSection` → `TagsSettingsView` (active/archived, swipe archive/restore) → `TagEditSheet` (emoji, name; custom rename shows warning + confirm, built-in = display only + Reset). Overrides applied in `TagEmojis`, Tasks group-by-tag, detail Detected tags, QuickAdd capture summary; `TagPicker` uses `tagOverrides.pickerOptions`) |
| 10 | Tests (swift test, ios/scripts/test.sh, api/sync smoke), docs (HANDOFF.md parity list, AGENTS/README), PR | 🚧 `DaybookUITests/ParityE2ETests.swift` added, 4/4 pass (Today select/mark/archive/delete, save + use template, Today switch, tag rename warning). Left: full `ios/scripts/test.sh`, api/sync smoke, docs, PR |

## Log

- 2026-10-20: branch created, plan written.
- Task 1: push accepts `POST /api/tasks/bulk`. NOTE: this server change must deploy BEFORE an iOS build that
  queues bulk deletes, or those ops get a 400 (final) and the delete is lost on the server side.
  Test server for this work: `DAYBOOK_TEST_PORT=3461 ios/scripts/test-server.sh start`.
- Task 2: `swift test` 72/72 (run with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`).
- Task 3: `swift test` 78/78.
- Task 4: app builds (`xcodebuild ... -destination 'platform=iOS Simulator,name=iPhone Duo' -derivedDataPath build/DerivedData build`).
- Task 5: builds after `xcodegen generate` (new file `Daybook/Shared/BulkBar.swift`).
- Task 7: builds, `swift test` 78/78.
- Task 8: builds after `xcodegen generate` (new file `TemplatesSettings.swift`).
- Task 9: builds after `xcodegen generate` (new file `TagsSettings.swift`). Next: task 10 (UI test + full suite + docs + PR).
- Task 10 (part): UI tests pass. Today now scrolls to the task list when select mode turns on. Gotchas: SwiftUI alert text fields drop their identifier (use `app.alerts.textFields.firstMatch`); a tap lands mid-text, so tests tap the field's right edge before deleting (`replaceText`).
- Task 10 (part): docs updated (ios/HANDOFF.md, AGENTS.md, README.md, DEPLOY.md deploy order). api-smoke, sync-smoke, vitest 42 all pass. Waiting on full `ios/scripts/test.sh`, then PR.
