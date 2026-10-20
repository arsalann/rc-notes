# daybook iOS — Handoff

Native SwiftUI client for daybook (rc-notes) over the Nuxt/Nitro API in `app/`. Since phase 12 it is
**local first**: every screen reads a local copy of the data and every change is saved on the phone,
queued, and synced in the background, so the app is instant and works offline. The server stays the
source of truth: queued changes replay through the same endpoints (display IDs, carry-forward, tag
detection, journal compare-and-swap all still happen there). The design is native iOS; the
**functionality** is 1:1 with the phone web app.

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Toolchain (Xcode 27.1, iOS 27.1 sim, XcodeGen), test server script, this doc | ✅ done |
| 1 | `DaybookKit`: models, API client, journal/draft/parsing ports, 49 unit tests | ✅ done |
| 2 | App shell, auth (server URL, setup, login, session expiry, Keychain-backed session) | ✅ done |
| 3 | Today (journal, goals, tasks, week summary, search) | ✅ done |
| 4 | Tasks list + task detail | ✅ done |
| 5 | Notes list + note editor | ✅ done |
| 6 | Calendar, Settings | ✅ done |
| 7 | XCUITest E2E suite (11 flows) + screenshots | ✅ done — all green |
| 8 | Install on a real iPhone | ✅ done via Xcode with a personal team (xtool not needed) |
| 9 | Used against the real (MotherDuck) server from the phone | ✅ confirmed working 2026-10-17 |
| 10 | Backend deployed: Railway + Supabase Postgres (see `DEPLOY.md`) | ✅ live 2026-10-17 at `https://rc-notes-production-a50f.up.railway.app` |
| 11 | v0 release on Arsalan's iPhone (developer mode), pointed at Railway | ✅ done 2026-10-17 (Release build) |
| 12 | Offline-first: local copy, change queue, background sync, device metadata on every row | ✅ built 2026-10-17 (see "Offline sync") |

Last full run (`ios/scripts/test.sh`, 2026-10-17, offline-first build): **71/71 unit tests,
12/12 UI tests passed** (incl. `OfflineE2ETests`); server `npm test` 33/33; `app/scripts/api-smoke.mjs`
and `app/scripts/sync-smoke.mjs` passing (also against a production build over the Postgres protocol).

The "Parity checklist" at the bottom is the contract; it separates what a UI test exercises end to end
from what is built but still worth a manual pass.

## Build, run, test

Prereqs: Xcode 27.1 at `/Applications/Xcode.app`, iOS 27.1 simulator runtime, `brew install xcodegen`, Node 20 (for the test server).

```bash
# xcode-select points at CommandLineTools on this Mac, so tell the tools where Xcode is:
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

# Unit tests for the non-UI core (runs on macOS, no simulator needed)
cd ios/DaybookKit && swift test

# Generate the Xcode project (re-run after adding/removing files)
cd ios && xcodegen generate

# Everything: unit tests + build + XCUITest E2E against an isolated local server
ios/scripts/test.sh                       # ~6 min; screenshots → .context/ios-screenshots/
ios/scripts/test.sh -only-testing:DaybookUITests/JournalE2ETests   # one suite
```

Run the app by hand: open `ios/Daybook.xcodeproj`, pick an iPhone simulator, Run. The production
server (`AppModel.builtInServer`, `https://rc-notes-production-a50f.up.railway.app`) is built in.
Debug builds can switch servers (Settings → Server → Change server), e.g. to a throwaway server:
`ios/scripts/test-server.sh start` → `http://127.0.0.1:3457`, user `master_tester` / `password123`.

**Release vs Debug** (the v0 on the phone is a Release build):

| | Release | Debug |
|---|---|---|
| Server | Built-in Railway address only; "Can't reach daybook / Try again" when offline | Built-in by default; can be changed (address form, `-serverURL` launch argument) |
| App Transport Security | HTTPS only (no exceptions) | Also plain HTTP on the local network (`NSAllowsLocalNetworking`) |

`Daybook/Info.plist` is hand-maintained and preprocessed (`INFOPLIST_PREPROCESS`); the Debug config
defines `DAYBOOK_DEBUG=1`, which is the only thing that adds the ATS exception. UI tests launch with
`-uiTesting`, which disables the production fallback so a test can never reach the real server.

## Layout

```
ios/
  project.yml            XcodeGen spec → Daybook.xcodeproj
  DaybookKit/            Swift package: all non-UI logic (swift test on macOS)
    API/                 APIClient (URLSession + cookie session), JSONValue bodies, errors
    Models/              Codable models matching the JSON the server really returns
                         (TemplatesAndTags.swift: templates, tag settings, TagOverrides, their API calls)
    Sync/                Rows (raw table rows), LocalData (+ LocalEffects: write rules, LocalQueries:
                         read endpoints), Mutation/PendingOp (the queue), SyncStore (push/pull,
                         conflicts, files), Repository (what screens call), SyncTransport
    Journal/             DiaryDraft (v2 keys, inspect, quarantine), JournalSession (save engine)
    Parsing/             Hashtags, checklist→tasks, mentions, tag catalog, markdown blocks
    Util/                ServerDate (naive timestamps), day/week math, due labels
  Daybook/               SwiftUI app
  DaybookUITests/        XCUITest E2E (drives the simulator against the test server)
  scripts/               test-server.sh (isolated API), test.sh (full pipeline)

Key app files: `Daybook/App/AppModel.swift` (server, auth, local copy + sync triggers, prefs),
`Daybook/Features/Today/TodayModel.swift` (port of `pages/diary.vue`),
`DaybookKit/.../Journal/JournalSession.swift` (journal save engine).
```

## API contract notes (verified against a live local server)

- Session: cookie `rc-session` (HttpOnly, 30 days, `Secure` only in production). The app uses
  `HTTPCookieStorage.shared`, mirrored into the Keychain (`SessionCookieVault`) so it survives kills. No `Origin` header is sent, so the
  CSRF check passes.
- User-Agent `daybook-ios/<version>` → server classifies `client_kind=ios`,
  `updated_by=user_in_ios_app` in `event_log` (`app/server/utils/eventLog.ts`).
- Timestamps are naive strings like `2026-10-16 17:30:30.24154`. Matching the web app
  (`parseUTC` in `app/composables/useDate.ts`), they are interpreted as UTC. Due dates are sent as
  UTC ISO strings (`2026-10-16T06:00:00.000Z` for "09:00 local").
  Since the Postgres move the server writes `created_at`/`updated_at` in UTC too; rows from before
  2026-10-17 hold the old server Mac's local time (unchanged, same as the web app sees them).
- Journal save: `PUT /api/diary/:date` with `{entry_id, content, workspace_id (always present, may be
  null), expected_updated_at}`. `expected_updated_at` is the **exact** `updated_at` string from the
  last response — never re-formatted. 409 = changed elsewhere, 404 = identity mismatch.
- `GET /api/diary/:date` 404s when there is no entry; the client then `POST /api/diary` (get-or-create,
  carries forward unfinished tasks).
- `POST /api/tasks` accepts a client UUID `id` (idempotent). Order writes go through
  `PATCH /api/tasks/positions`.

## Offline sync

- **Local copy**: `SyncStore` keeps the rows of workspaces, tasks, notes, links, diary_entries and
  goals_weekly (`Application Support/Sync/<server>/<user id>/snapshot.json`) and the queue of changes
  (`outbox.json`, rewritten synchronously on every change). Screens read `store.data` = server rows with
  every queued change applied on top, through `Repository`, which has the same method names as
  `APIClient`. Each screen reloads when `store.revision` changes.
- **Changes**: a `Mutation` per write (`createTask`, `updateTask`, `saveDiary`, …). It is applied locally
  at once (`LocalEffects.swift` ports the endpoint's rules: default workspace, priority inheritance, status
  from due date, positions, diary links, carry-forward) and queued with its device time. Rapid edits of
  the same thing coalesce (journal and goals saves, adjacent note/task edits, reorders).
- **Sync**: ~2 s after a change, when the app comes to the foreground, when the network comes back,
  every 30 s while open, and when going to the background. `POST /api/sync/push` replays the queue in
  order (25 per batch, exactly once per op id), then `GET /api/sync/pull?since=<cursor>` brings rows
  written elsewhere; a full pull runs daily. A 4xx drops that change with a toast; a 5xx or no network
  keeps the queue for the next try.
- **Conflicts**: the server keeps the newest edit per field (device time vs. each field's clock), so an
  older offline edit never overwrites a newer one from the browser. The journal never merges: a save
  whose page changed elsewhere (409) becomes a recovery draft (Restore / Discard on that page) and a
  toast. Locally the journal's compare-and-swap is content based, so the server re-stamping the revision
  of our own save does not block the next one.
- **Offline pages**: a new day page gets an id derived from date + workspace (`DiaryIds.entryId`, same
  as the server's `diaryIdSql`), so a page made offline and the same page made in the browser are one
  row. Journal writing on a page that only exists locally is sent after the page is created; if the
  server's page already has writing, ours becomes a recovery draft.
- **What stays online**: sign-in, password change, users (admin), creating a workspace. With a known
  account and no network the app opens straight to the local copy.
- **Device metadata**: requests carry `X-Daybook-Device` (identifierForVendor) and a User-Agent with
  model and iOS version; rows record `created/updated_device_kind/id`, `client_updated_at` and
  `sync_op_id` (see AGENTS.md "Offline sync").
- **Status**: Settings → Sync (waiting changes, last sync, Sync now); an `icloud.slash` button on Today
  when changes are waiting and the server can't be reached.

## Journal safety invariants (from AGENTS.md "Daybook Journal Write Safety")

1. Every draft and save is bound to the immutable loaded identity (user, entry ID, actual workspace ID,
   entry date) plus the server revision (`updated_at`). The save target is never derived from the
   currently selected date/workspace.
2. A recovered local draft never writes automatically: the journal shows Restore / Discard and editing
   is blocked until the user chooses.
3. Draft keys are versioned (`daybook:diary-draft:v2:{user}:{entry}:{ws|{none}}:{date}`); legacy keys are
   quarantined, not replayed.
4. Saves are serialized per app and use optimistic concurrency, locally (content based) and on the
   server (exact `updated_at`) when the queued save is replayed. A server-side conflict becomes a
   recovery draft, never an overwrite.
5. Tests: `JournalSessionTests` (unit, fake CAS server) and `JournalE2ETests` (XCUITest) prove contents
   cannot cross dates or workspaces.

## Test-data safety

- Tests only ever run against `ios/scripts/test-server.sh`: `DATABASE_URL` and `MOTHERDUCK_NOTEBOOK_RC`
  are unset for the server process, `app/.env` is not loaded, and the DB is a throwaway PGlite
  (embedded Postgres) directory. The script aborts unless the server log confirms PGlite. The only user
  is `master_tester` / `password123`.
- Nothing in `ios/` reads `app/.env` or `.bruin.yml`.

## Decisions log

- **Toolchain**: Xcode + XcodeGen for build/test (simulator + XCTest). xtool cannot target the
  simulator or run XCTest, so it is only an optional path to sideload onto a physical iPhone.
- **`xcode-select` still points at CommandLineTools** on this Mac. Rather than `sudo xcode-select -s`,
  every script exports `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- **Simulator**: the installed iOS 27.1 runtime only supports the "iPhone Duo" device type (creating
  iPhone 16/17/18/Air devices fails with "Incompatible device"), so tests run there. On that device
  the tab bar renders as a side rail; the UI tests handle both layouts.
- **Server address**: built in (`AppModel.builtInServer`) since the backend moved to Railway; there is
  one server, so asking for it only added a setup step. Debug builds keep an override for local dev and
  UI tests. Earlier builds asked for the address and allowed arbitrary HTTP loads for LAN servers;
  release builds now drop any stored address and allow HTTPS only.
- **Session persistence**: the `rc-session` cookie is mirrored into the Keychain after every sign-in /
  auth check and restored at launch. `HTTPCookieStorage` writes asynchronously, and a UI test proved
  a kill right after sign-in lost the session.
- **Journal drafts are files, not UserDefaults**: one atomic file per draft in Application Support
  (`FileDraftStore`), same versioned key format as the web. Synchronous writes mean a draft survives
  the app being killed mid-sentence.
- **Timestamps**: mirror the web app's UTC interpretation exactly (see API notes), even though
  `created_at` is written in server-local time — parity beats a divergent "fix" on one client.
- **Design**: native iOS (inset-grouped lists, toolbars/menus, sheets, swipe actions, context menus,
  SF Symbols, system light/dark with a sage tint and the warm accent from the web palette). An
  Appearance setting (System/Light/Dark) replaces the web theme toggle.
- **Journal edit mode** ends with an explicit **Done** (or navigation / backgrounding, which flush)
  instead of the web's "return to preview 6 s after blur", which is awkward with an on-screen keyboard.
- **Desktop-only layouts** (≥900px priority board / status kanban, side-by-side journal/goals) are not
  ported; on the phone the same actions are available via grouping + context menus (set priority /
  status) and drag reorder.
- **Vestigial "Bottom Nav workspaces" setting** on the web does nothing (`BottomNav.vue` ignores it), so
  it is not ported.
- **Quick add** shows Subtasks and Due right under the title (AGENTS.md: subtask + due date creation
  must be frictionless); hashtags still drive priority/status/due as on the web.
- **Server fix**: `GET /api/tasks` did not return `priority`, so "Group by priority" on the Tasks page put
  every task in "No priority" (web and iOS). Added `priority` and `parent_id` to the SELECT.
- **Server change**: User-Agent `daybook-ios/*` → `client_kind=ios`, `updated_by=user_in_ios_app` in
  `event_log` (documented in AGENTS.md; unit-tested in `app/server/utils/eventLog.test.ts`). No schema
  change, so no Bruin refresh was needed.
- **No self sign-up**: the sign-in screen has no Create account option (the server turns sign-up off in
  production); admins add users in Settings → Users. First-run setup on an empty server still exists.
- **Confirmation added** before deleting a user in Settings (the web deletes immediately).
- **Backend moved to Postgres** (2026-10-17): Supabase in production, embedded PGlite for tests and
  offline dev. API responses stayed byte-identical (timestamps as the same naive text, same fixture
  shapes), so the app needed no change. The iOS test server refuses to run unless it is on PGlite.
- **Monorepo kept**: the app, API and iOS client share one contract and the iOS E2E suite runs against
  this server; splitting repos would only add sync work.
- **Offline first, iOS only** (2026-10-17): local copy + queue + background sync instead of calling the
  API from each screen. Built in-house (an outbox replayed through the existing endpoints, a pull by
  sequence number) rather than a sync service such as PowerSync, which would add another service, auth
  system and bill for one person's data (~600 tasks, ~3k links). The web app stays online-only.
- **Last writer wins per field, by device time**: a trigger keeps a clock per field; device times are
  capped at the server's receive time so a phone with a fast clock can't win forever. Journal content
  keeps compare-and-swap on top (a conflict becomes a draft), per AGENTS.md journal rules.
- **Deterministic diary page ids** for new pages (md5 of date + workspace), so offline and online page
  creation converge without remapping. Existing pages keep their random ids.

## Blocked / needs Arsalan

Nothing is blocked. The backend is live on Railway and built into the app.

- Free personal-team builds expire after 7 days. To renew, re-run from Xcode with the phone plugged in.
- **Legacy Railway project `exemplary-vitality`** (`https://rc-notes-production.up.railway.app`) still
  serves the old DuckDB-era app against MotherDuck. Don't point the app at it: writes there never reach
  Supabase. Kept for now at Arsalan's request; to be stopped/deleted later (`DEPLOY.md` "Status").
- Bruin still points at MotherDuck; switching it to Supabase is `DEPLOY.md` runbook step 6.
- A local dev server (LAN IP) still works for testing; see AGENTS.md "iOS app" for the pitfalls.

## Known gaps / not verified

- Session-expiry notice: implemented (401 from any data endpoint or a failed auth check on foreground
  → login screen with "Your session expired…"), but not covered by an E2E test (sealed cookies cannot be
  revoked server-side without restarting the server with a new secret).
- iPad layouts are the phone layout scaled up (no priority board).
- The web app is online only (it gets no local copy). Reminders (`reminder_at`) are unused on the web
  too, so no notifications were added.
- Offline the phone shows a day page's tasks from its links plus tasks due that day; the server's rarer
  page repairs (re-carrying into an empty page) and display IDs (`#xyz001`) appear after the next sync.
- Signing out keeps the local copy on the device (per account) so queued changes are not lost.
- Templates and tag settings (2026-10-20, web parity — see `WEB-PARITY-HANDOFF.md`) are online-only on the
  phone: listed from `GET /api/templates` / `GET /api/tags` after every sync and cached in UserDefaults, edited
  through `APIClient`. Creating tasks from a template is queued like any new task (works offline). Bulk delete
  is a queued `deleteTasks` mutation → `POST /api/tasks/bulk` (in the push `ALLOWED` list). Built-in tag label /
  emoji overrides are applied in every tag view; archived tags leave the picker. Today hides archived tasks.

## Next steps

- **Conflict chooser for the journal** (future improvement): today a conflicting offline save shows
  Restore / Discard on the page, with the server's version on screen. Next: a clear "Not uploaded:
  conflicts with a newer version" banner that opens a side-by-side (or diff) view of both versions,
  with Keep mine / Keep theirs / Keep both (append). Could extend to task and note fields where an
  offline edit lost to a newer one (today those are dropped silently, by design).
- Consider a home-screen widget for Today's open tasks and a share extension for quick capture.
- TestFlight would need a paid Apple Developer account, but it would remove the 7-day re-signing.

## Parity checklist

Legend: ✅ built and exercised end-to-end by a UI test against the server · ☑️ built and compiling, logic
ported from the web code (pure logic unit-tested in DaybookKit) but **not yet driven by a UI test** —
worth a manual pass.

**Auth & app shell**
- ✅ Built-in server (release) · ✅ Server address entry + validation (debug) · ✅ Sign in · ✅ Sign out · ✅ Session survives relaunch
- ☑️ First-run setup (create admin) · ☑️ Session-expired notice · ☑️ Change server

**Today (daybook)**
- ✅ Workspace chips filter the page · ✅ 7-day rail, prev/next, content dots · ☑️ Jump to today
- ✅ Journal preview ⇄ edit, 300 ms autosave, flush on day/workspace change
- ✅ Restore / Discard recovered drafts; never auto-written · ✅ 409 conflict keeps the local copy
- ✅ Checklist lines → tasks + subtasks on leaving the editor, replaced by `@[Title]`
- ☑️ @-mentions in the journal (link created) · ☑️ Copy from previous day (append / replace)
- ☑️ Weekly goals (shared per Sunday-start week, autosave) · ☑️ Collapsible journal/goals (remembered)
- ✅ Add task (due on the page's day, linked + mentioned) · ✅ Complete task from the page
- ☑️ Carried-forward banner + Review · ☑️ Sort (custom / newest / priority) and group (none / created / priority)
- ☑️ Drag to reorder (custom order, one bulk request) · ☑️ Hide done · ☑️ Expand/collapse all subtasks
- ☑️ Per-priority quick add with optimistic row · ☑️ Set priority from the context menu
- ✅ Week summary (completed per day, grouped under parents, outstanding list) · ✅ Search

**Tasks**
- ✅ Quick add with live hashtag capture, priority, status, due shortcuts / picker, tags, subtasks
- ✅ Complete / reopen · ✅ Swipe to archive · ✅ Inline subtask expansion + toggle
- ☑️ Order by newest / due · ☑️ Group by none / status / priority / tag · ☑️ Show done · ☑️ Archived view + restore
- ☑️ Multi-select bulk status / priority / archive / restore · ☑️ Pin (swipe) · ☑️ Drag reorder (no grouping)
- ✅ Calendar (5-day window, dots, toggle)

**Task detail**
- ✅ Status · ✅ Add subtask · ☑️ Title edit with hashtag parsing · ☑️ Priority + clear · ☑️ Workspace (incl. none)
- ☑️ Description · ☑️ Due shortcuts / pick / clear · ☑️ Detected tags with reasons, manual tags, catalog picker
- ☑️ Subtask toggle / archive / attach existing task via `@` · ☑️ Linked note preview / open / create
- ☑️ Copy as markdown · ☑️ Pin · ☑️ Archive (with confirmation)

**Notes**
- ✅ New note · ✅ @-mention creates a link and embeds the task in preview · ✅ Notebook list
- ☑️ Diary notes section opens that day on Today · ☑️ Pinned / other / archived · ☑️ Pin / archive / restore
- ☑️ Checklist → tasks when leaving the editor · ☑️ Autosave title + content

**Settings**
- ✅ Account info · ☑️ Change password · ☑️ Users (admin: list / add / delete) · ☑️ Workspaces (list / create)
- ☑️ Default workspace, task grouping / ordering, show done · ☑️ Appearance
- ✅ Today page switches (journal / weekly goals) · ✅ Tags (rename with overwrite warning) · ☑️ Tags (emoji, archive, built-in relabel / reset)
- ☑️ Templates (edit name, title, priority, workspace, tags, subtasks; delete; create from template)

**Web parity (2026-10-20)**
- ✅ Today: select mode → Mark as / Archive / Delete · ☑️ Today: Priority from the bulk bar
- ☑️ Tasks: Delete in the bulk bar, top-bar Select button
- ✅ Save as template (task page) · ✅ New task → From template (Tasks) · ☑️ From template on Today (due that day)
