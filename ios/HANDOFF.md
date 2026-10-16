# daybook iOS — Handoff

Native SwiftUI client for daybook (rc-notes). It talks to the existing Nuxt/Nitro API in `app/`;
the server stays the source of truth for data, carry-forward, display IDs, tag detection and
journal concurrency. The design is native iOS; the **functionality** is 1:1 with the phone web app.

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Toolchain (Xcode 27.1, iOS 27.1 sim, XcodeGen), test server script, this doc | ✅ done |
| 1 | `DaybookKit`: models, API client, journal/draft/parsing ports, 49 unit tests | ✅ done |
| 2 | App shell, auth (server URL, setup, login, signup, session expiry, Keychain-backed session) | ✅ done |
| 3 | Today (journal, goals, tasks, week summary, search) | ✅ done |
| 4 | Tasks list + task detail | ✅ done |
| 5 | Notes list + note editor | ✅ done |
| 6 | Calendar, Settings | ✅ done |
| 7 | XCUITest E2E suite (11 flows) + screenshots | ✅ done — all green |
| 8 | xtool sideload | ⏸ not started — needs your Apple ID (see "Next steps") |

Last full run (`ios/scripts/test.sh`, 2026-10-16): **49/49 unit tests, 11/11 UI tests passed**;
server `npm test` 18/18.

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

Run the app by hand: open `ios/Daybook.xcodeproj`, pick an iPhone simulator, Run. On first launch
enter the server address you use in the phone browser (e.g. `http://192.168.1.20:3000`). For a
throwaway server: `ios/scripts/test-server.sh start` → `http://127.0.0.1:3457`, user
`master_tester` / `password123`.

## Layout

```
ios/
  project.yml            XcodeGen spec → Daybook.xcodeproj
  DaybookKit/            Swift package: all non-UI logic (swift test on macOS)
    API/                 APIClient (URLSession + cookie session), JSONValue bodies, errors
    Models/              Codable models matching the JSON the server really returns
    Journal/             DiaryDraft (v2 keys, inspect, quarantine), JournalSession (save engine)
    Parsing/             Hashtags, checklist→tasks, mentions, tag catalog, markdown blocks
    Util/                ServerDate (naive timestamps), day/week math, due labels
  Daybook/               SwiftUI app
  DaybookUITests/        XCUITest E2E (drives the simulator against the test server)
  scripts/               test-server.sh (isolated API), test.sh (full pipeline)

Key app files: `Daybook/App/AppModel.swift` (server, auth, workspaces, prefs),
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
- Journal save: `PUT /api/diary/:date` with `{entry_id, content, workspace_id (always present, may be
  null), expected_updated_at}`. `expected_updated_at` is the **exact** `updated_at` string from the
  last response — never re-formatted. 409 = changed elsewhere, 404 = identity mismatch.
- `GET /api/diary/:date` 404s when there is no entry; the client then `POST /api/diary` (get-or-create,
  carries forward unfinished tasks).
- `POST /api/tasks` accepts a client UUID `id` (idempotent). Order writes go through
  `PATCH /api/tasks/positions`.

## Journal safety invariants (from AGENTS.md "Daybook Journal Write Safety")

1. Every draft and save is bound to the immutable loaded identity (user, entry ID, actual workspace ID,
   entry date) plus the server revision (`updated_at`). The save target is never derived from the
   currently selected date/workspace.
2. A recovered local draft never writes automatically: the journal shows Restore / Discard and editing
   is blocked until the user chooses.
3. Draft keys are versioned (`daybook:diary-draft:v2:{user}:{entry}:{ws|{none}}:{date}`); legacy keys are
   quarantined, not replayed.
4. Saves are serialized per app and use optimistic concurrency.
5. Tests: `JournalSessionTests` (unit, fake CAS server) and `JournalE2ETests` (XCUITest) prove contents
   cannot cross dates or workspaces.

## Test-data safety

- Tests only ever run against `ios/scripts/test-server.sh`: `MOTHERDUCK_NOTEBOOK_RC` is unset for the
  server process and the DB is a temp DuckDB file. The only user is `master_tester` / `password123`.
- Nothing in `ios/` reads `app/.env` or `.bruin.yml`.

## Decisions log

- **Toolchain**: Xcode + XcodeGen for build/test (simulator + XCTest). xtool cannot target the
  simulator or run XCTest, so it is only an optional path to sideload onto a physical iPhone.
- **`xcode-select` still points at CommandLineTools** on this Mac. Rather than `sudo xcode-select -s`,
  every script exports `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- **Simulator**: the installed iOS 27.1 runtime only supports the "iPhone Duo" device type (creating
  iPhone 16/17/18/Air devices fails with "Incompatible device"), so tests run there. On that device
  the tab bar renders as a side rail; the UI tests handle both layouts.
- **Server address**: entered on first launch (same address as the phone browser), stored in
  UserDefaults, changeable from Settings (signs out). ATS allows arbitrary loads because the server is
  self-hosted on LAN/VPN addresses the app cannot know ahead of time.
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
- **Confirmation added** before deleting a user in Settings (the web deletes immediately).

## Blocked / needs Arsalan

Nothing blocked the build. These need you:

1. **Installing on your iPhone** needs signing: either open `ios/Daybook.xcodeproj` in Xcode, pick your
   Personal Team under Signing & Capabilities and Run on the device, or use xtool (`xtool auth`, then
   `xtool dev`), which also needs your Apple ID. I did not touch any Apple account.
2. **Real server**: I only ever ran against the throwaway local server. The first time you point the
   app at your real daybook server, skim Today/Tasks/Notes to confirm the data looks right.
3. **Optional**: `sudo xcode-select -s /Applications/Xcode.app` would let plain `swift test` /
   `xcodebuild` work without `DEVELOPER_DIR`.

## Known gaps / not verified

- Session-expiry notice: implemented (401 from any data endpoint or a failed auth check on foreground
  → login screen with "Your session expired…"), but not covered by an E2E test (sealed cookies cannot be
  revoked server-side without restarting the server with a new secret).
- iPad layouts are the phone layout scaled up (no priority board).
- No offline mode beyond journal drafts (same as the web app). Reminders (`reminder_at`) are unused on
  the web too, so no notifications were added.

## Next steps

- Device install (above). For xtool specifically: it builds SwiftPM packages, so it would need a small
  `Package.swift` wrapper target around `Daybook/`; Xcode with a Personal Team is the faster route.
- Consider a home-screen widget for Today's open tasks and a share extension for quick capture.

## Parity checklist

Legend: ✅ built and exercised end-to-end by a UI test against the server · ☑️ built and compiling, logic
ported from the web code (pure logic unit-tested in DaybookKit) but **not yet driven by a UI test** —
worth a manual pass.

**Auth & app shell**
- ✅ Server address entry + validation · ✅ Sign in · ✅ Sign out · ✅ Session survives relaunch
- ☑️ First-run setup (create admin) · ☑️ Create account · ☑️ Session-expired notice · ☑️ Change server

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
