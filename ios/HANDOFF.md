# daybook iOS — Handoff

Native SwiftUI client for daybook (rc-notes). It talks to the existing Nuxt/Nitro API in `app/`;
the server stays the source of truth for data, carry-forward, display IDs, tag detection and
journal concurrency. The design is native iOS; the **functionality** is 1:1 with the phone web app.

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Toolchain (Xcode 27.1, iOS 27.1 sim, XcodeGen), test server script, this doc | done |
| 1 | `DaybookKit`: models, API client, journal/draft/parsing ports, unit tests | see below |
| 2 | App shell, auth (server URL, setup, login, signup, session expiry) | see below |
| 3 | Today (journal, goals, tasks, week summary, search) | see below |
| 4 | Tasks list + task detail | see below |
| 5 | Notes list + note editor | see below |
| 6 | Calendar, Settings | see below |
| 7 | XCUITest E2E suite + screenshots | see below |
| 8 | xtool sideload (optional) | see below |

The "Parity checklist" section at the bottom is the contract; each item is ticked only when it is
built **and** exercised by a test or a manual simulator run.

## Build, run, test

Prereqs: Xcode 27.1 selected (`xcode-select -p` → `/Applications/Xcode.app/...`), iOS 27.1
simulator runtime, `brew install xcodegen`, Node 20 (for the test server).

```bash
# Unit tests for the non-UI core (runs on macOS, no simulator needed)
cd ios/DaybookKit && swift test

# Generate the Xcode project (re-run after adding/removing files)
cd ios && xcodegen generate

# Everything: unit tests + build + XCUITest E2E against an isolated local server
ios/scripts/test.sh
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
```

## API contract notes (verified against a live local server)

- Session: cookie `rc-session` (HttpOnly, 30 days, `Secure` only in production). The app uses
  `HTTPCookieStorage.shared`, so the session survives relaunch. No `Origin` header is sent, so the
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
- **Server address**: entered on first launch (same address as the phone browser), stored in
  UserDefaults, changeable from Settings (signs out). ATS allows arbitrary loads because the server is
  self-hosted on LAN/VPN addresses the app cannot know ahead of time.
- **Timestamps**: mirror the web app's UTC interpretation exactly (see API notes), even though
  `created_at` is written in server-local time — parity beats a divergent "fix" on one client.
- **Theme**: native system styling with a sage tint; an Appearance setting (System/Light/Dark) replaces
  the web theme toggle.
- **Desktop-only layouts** (≥900px priority board, side-by-side journal/goals) are not ported; on the
  phone the same actions are available via grouping by priority + context menus.
- **Vestigial "Bottom Nav workspaces" setting** on the web does nothing (`BottomNav.vue` ignores it), so
  it is not ported.
- **Server fix**: `GET /api/tasks` did not return `priority`, so "Group by priority" on the Tasks page put
  every task in "No priority" (web and iOS). Added `priority` and `parent_id` to the SELECT.

## Blocked / needs Arsalan

(none yet)

## Parity checklist

Filled in per phase below.
