import Foundation
import Testing
@testable import DaybookKit

/// Scripted stand-in for `/api/sync/push` and `/api/sync/pull`.
actor FakeSyncServer: SyncTransport {
    private(set) var pushed: [[PushOp]] = []
    private var responder: @Sendable (PushOp) -> PushResult = { PushResult(id: $0.id, status: 200) }
    private var pages: [PullResponse] = []
    private var offline = false
    private(set) var pullSinces: [Int64] = []

    func respond(_ handler: @escaping @Sendable (PushOp) -> PushResult) { responder = handler }
    func queuePull(_ page: PullResponse) { pages.append(page) }
    func setOffline(_ value: Bool) { offline = value }

    func push(_ ops: [PushOp]) async throws -> PushResponse {
        if offline { throw APIError.transport("The Internet connection appears to be offline.") }
        pushed.append(ops)
        var results: [PushResult] = []
        for op in ops {
            let result = responder(op)
            results.append(result)
            if result.status >= 500 { return PushResponse(results: results, stopped: true) }
        }
        return PushResponse(results: results)
    }

    func pull(since: Int64, limit: Int) async throws -> PullResponse {
        if offline { throw APIError.transport("The Internet connection appears to be offline.") }
        pullSinces.append(since)
        return pages.isEmpty ? PullResponse(cursor: max(since, 1)) : pages.removeFirst()
    }
}

/// A row as the server sends it (snake_case JSON).
func serverJSON<T: Encodable>(_ row: T) -> JSONValue {
    let encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .convertToSnakeCase
    return try! JSONDecoder().decode(JSONValue.self, from: encoder.encode(row))
}

private let ws = "ws-work"
private let fixedNow = Date(timeIntervalSince1970: 1_792_224_000) // 2026-10-17 08:00 UTC

@MainActor
private func makeStore(_ server: FakeSyncServer, directory: URL? = nil, drafts: InMemoryDraftStore = InMemoryDraftStore()) -> SyncStore {
    SyncStore(transport: server, directory: directory, drafts: drafts, userId: "u1", now: { fixedNow })
}

private func seedPage(_ rows: PullResponse.Rows = PullResponse.Rows(), cursor: Int64 = 10) -> PullResponse {
    var rows = rows
    if rows.workspaces.isEmpty { rows.workspaces = [WorkspaceRow(id: ws, name: "Work", emoji: "💼", position: 1)] }
    return PullResponse(cursor: cursor, rows: rows)
}

private func diaryRow(_ id: String, date: String, content: String, updatedAt: String, seq: Int64 = 5) -> DiaryRow {
    var row = DiaryRow(id: id, workspaceId: ws, entryDate: date, content: content, createdAt: "2026-10-01 00:00:00")
    row.updatedAt = updatedAt
    row.syncSeq = seq
    return row
}

@Suite("Diary ids")
struct DiaryIdTests {
    @Test func matchesPostgres() {
        // Values from `md5('daybook-diary:' || date || ':' || COALESCE(ws, ''))::uuid::text` in Postgres.
        #expect(DiaryIds.entryId(date: "2031-03-04", workspaceId: "ws-1") == "be0a8c39-81af-3383-cbd4-6be3bcf974bf")
        #expect(DiaryIds.entryId(date: "2026-10-17", workspaceId: nil) == "cd16333c-e2ff-e721-6fc8-bc8e581c3459")
    }
}

@Suite("Local effects and queries")
struct LocalDataTests {
    func base() -> LocalData {
        var data = LocalData()
        data.workspaces[ws] = WorkspaceRow(id: ws, name: "Work", position: 1)
        data.workspaces["ws-home"] = WorkspaceRow(id: "ws-home", name: "Personal", position: 0)
        return data
    }

    @Test func createTaskUsesServerDefaults() {
        var data = base()
        data.tasks["old"] = TaskRow(id: "old", title: "Old", workspaceId: ws, position: 3)
        data.apply(PendingOp(clientTime: fixedNow, mutation: .createTask(.init(id: "t1", title: "  Write report ", dueAt: "2026-10-18T07:00:00.000Z"))))
        let row = data.tasks["t1"]!
        #expect(row.title == "Write report")
        #expect(row.workspaceId == ws) // default "Work"
        #expect(row.priority == 2)
        #expect(row.status == "now") // due within 7 days
        #expect(row.position == 2) // above the top task
        #expect(row.dueAt == "2026-10-18 07:00:00.000")
        // Due date links it to that day's page (created like the server does, with a derived id).
        let page = DiaryIds.entryId(date: "2026-10-18", workspaceId: ws)
        #expect(data.diary[page] != nil)
        #expect(data.hasLink("diary", page, "task", "t1", eitherDirection: false))
    }

    @Test func subtaskInheritsParent() {
        var data = base()
        data.tasks["p"] = TaskRow(id: "p", title: "Parent", workspaceId: "ws-home", priority: 3)
        data.apply(PendingOp(clientTime: fixedNow, mutation: .createTask(.init(id: "s", title: "Child", parentId: "p"))))
        #expect(data.tasks["s"]?.workspaceId == "ws-home")
        #expect(data.tasks["s"]?.priority == 3)
        #expect(data.hydratedTask("p")?.subtasks?.map(\.id) == ["s"])
        #expect(data.taskList(workspaceId: nil, archived: false).first { $0.id == "p" }?.subtaskCount == 1)
    }

    @Test func statusAndCompletionMoveTogether() {
        var data = base()
        data.tasks["t"] = TaskRow(id: "t", title: "T", workspaceId: ws)
        data.apply(PendingOp(clientTime: fixedNow, mutation: .updateTask(id: "t", patch: ["status": "done"])))
        #expect(data.tasks["t"]?.completed == true)
        #expect(data.tasks["t"]?.completedAt != nil)
        data.apply(PendingOp(clientTime: fixedNow, mutation: .setTaskCompleted(id: "t", completed: false)))
        #expect(data.tasks["t"]?.status == "next")
        #expect(data.tasks["t"]?.completedAt == nil)
    }

    @Test func deleteTasksTakesSubtasksAndLinks() {
        var data = base()
        data.tasks["p"] = TaskRow(id: "p", title: "Parent", workspaceId: ws)
        data.tasks["c"] = TaskRow(id: "c", title: "Child", workspaceId: ws, parentId: "p")
        data.tasks["g"] = TaskRow(id: "g", title: "Grandchild", workspaceId: ws, parentId: "c")
        data.tasks["keep"] = TaskRow(id: "keep", title: "Keep", workspaceId: ws)
        data.links["l1"] = LinkRow(id: "l1", sourceType: "diary", sourceId: "d", targetType: "task", targetId: "p", createdAt: "x")
        data.links["l2"] = LinkRow(id: "l2", sourceType: "task", sourceId: "g", targetType: "note", targetId: "n", createdAt: "x")
        data.links["l3"] = LinkRow(id: "l3", sourceType: "diary", sourceId: "d", targetType: "task", targetId: "keep", createdAt: "x")
        let op = PendingOp(clientTime: fixedNow, mutation: .deleteTasks(ids: ["p", "missing"]))
        data.apply(op)
        #expect(Set(data.tasks.keys) == ["keep"])
        #expect(Set(data.links.keys) == ["l3"])
        #expect(op.mutation.request.path == "/api/tasks/bulk")
        #expect(op.mutation.request.body == .object(["ids": .strings(["p", "missing"]), "action": .string("delete")]))
    }

    @Test func clearingDueRemovesDayLinks() {
        var data = base()
        data.apply(PendingOp(clientTime: fixedNow, mutation: .createTask(.init(id: "t", title: "T", dueAt: "2026-10-18T07:00:00Z"))))
        data.apply(PendingOp(clientTime: fixedNow, mutation: .updateTask(id: "t", patch: ["due_at": .null])))
        #expect(!data.links.values.contains { $0.targetId == "t" })
    }

    @Test func newPageCarriesUnfinishedTasks() {
        var data = base()
        data.diary["d1"] = diaryRow("d1", date: "2026-10-15", content: "", updatedAt: "x")
        data.tasks["open"] = TaskRow(id: "open", title: "Open", workspaceId: ws)
        var done = TaskRow(id: "done", title: "Done", workspaceId: ws)
        done.completed = true
        data.tasks["done"] = done
        data.links["l1"] = LinkRow(id: "l1", sourceType: "diary", sourceId: "d1", targetType: "task", targetId: "open")
        data.links["l2"] = LinkRow(id: "l2", sourceType: "diary", sourceId: "d1", targetType: "task", targetId: "done")
        let (entry, carried) = data.createDiary(date: "2026-10-17", requestedWorkspaceId: ws, now: "2026-10-17 08:00:00")!
        #expect(entry.id == DiaryIds.entryId(date: "2026-10-17", workspaceId: ws))
        #expect(carried.map(\.id) == ["open"])
        #expect(data.diaryPage(date: "2026-10-17", workspaceId: ws)?.tasks?.map(\.id) == ["open"])
    }

    @Test func pageShowsTasksDueThatDay() {
        var data = base()
        data.diary["d"] = diaryRow("d", date: "2026-10-17", content: "", updatedAt: "x")
        data.tasks["due"] = TaskRow(id: "due", title: "Due", workspaceId: ws, dueAt: "2026-10-17 09:00:00")
        data.tasks["other"] = TaskRow(id: "other", title: "Other ws", workspaceId: "ws-home", dueAt: "2026-10-17 09:00:00")
        #expect(data.diaryPage(date: "2026-10-17", workspaceId: ws)?.tasks?.map(\.id) == ["due"])
    }

    @Test func searchAndMention() {
        var data = base()
        data.tasks["t"] = TaskRow(id: "t", title: "Quarterly REPORT", workspaceId: ws)
        data.notes["n"] = NoteRow(id: "n", title: "Report notes", content: "body", workspaceId: ws)
        #expect(Set(data.search("report", workspaceId: nil).map(\.id)) == ["t", "n"])
        #expect(data.mention("report", type: "task").map(\.id) == ["t"])
    }
}

@Suite("Sync store")
@MainActor
struct SyncStoreTests {
    @Test func changesApplyAtOnceAndSurviveARestart() async throws {
        let server = FakeSyncServer()
        await server.queuePull(seedPage())
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sync-\(UUID().uuidString)")
        let store = makeStore(server, directory: dir)
        await store.sync()
        await server.setOffline(true)
        store.enqueue(.createTask(.init(id: "t1", title: "Offline task")))
        #expect(store.data.tasks["t1"]?.title == "Offline task")
        await store.sync()
        #expect(store.status.lastError != nil)
        #expect(store.outbox.count == 1)

        // Relaunch: the queue and the local copy come back from disk.
        try await Task.sleep(for: .milliseconds(200))
        let reopened = makeStore(server, directory: dir)
        #expect(reopened.outbox.map(\.mutation) == store.outbox.map(\.mutation))
        #expect(reopened.data.tasks["t1"]?.title == "Offline task")
        #expect(reopened.data.workspaces[ws] != nil)
    }

    @Test func acknowledgedChangesLeaveTheQueue() async {
        let server = FakeSyncServer()
        await server.queuePull(seedPage())
        let store = makeStore(server)
        await store.sync()
        await server.respond { op in
            var row = TaskRow(id: "t1", title: "From server", workspaceId: ws)
            row.displayId = "frosx000"
            row.syncSeq = 20
            return PushResult(id: op.id, status: 201, body: serverJSON(row))
        }
        store.enqueue(.createTask(.init(id: "t1", title: "From server")))
        await store.sync()
        #expect(store.outbox.isEmpty)
        #expect(store.data.tasks["t1"]?.displayId == "frosx000")
        let pushed = await server.pushed
        #expect(pushed.last?.first?.path == "/api/tasks")
        #expect(pushed.last?.first?.clientTime == DayMath.isoString(fixedNow))
    }

    @Test func serverErrorsKeepTheChangeForLater() async {
        let server = FakeSyncServer()
        await server.queuePull(seedPage())
        let store = makeStore(server)
        await store.sync()
        await server.respond { PushResult(id: $0.id, status: 500) }
        store.enqueue(.createNote(id: "n1", title: "Kept", content: "", workspaceId: ws))
        await store.sync()
        #expect(store.outbox.count == 1)
        #expect(store.status.lastError != nil)
        #expect(store.data.notes["n1"] != nil)
    }

    @Test func rejectedChangesAreDroppedAndReported() async {
        let server = FakeSyncServer()
        await server.queuePull(seedPage())
        let store = makeStore(server)
        await store.sync()
        var events: [SyncStore.Event] = []
        store.onEvent = { events.append($0) }
        await server.respond { PushResult(id: $0.id, status: 400, body: .object(["statusMessage": "Title is required"])) }
        store.enqueue(.createNote(id: "n1", title: "x", content: "", workspaceId: ws))
        await store.sync()
        #expect(store.outbox.isEmpty)
        #expect(events == [.rejected(summary: "New note “x”", message: "Title is required")])
    }

    @Test func journalSavesCoalesceAndKeepTheirBase() async {
        let server = FakeSyncServer()
        var rows = PullResponse.Rows()
        rows.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "a", updatedAt: "rev1")]
        await server.queuePull(seedPage(rows))
        let store = makeStore(server)
        await store.sync()
        store.enqueue(.saveDiary(entryId: "d", date: "2026-10-17", workspaceId: ws, content: "ab", base: "rev1"))
        store.enqueue(.saveDiary(entryId: "d", date: "2026-10-17", workspaceId: ws, content: "abc", base: "local"))
        #expect(store.outbox.count == 1)
        #expect(store.outbox[0].mutation == .saveDiary(entryId: "d", date: "2026-10-17", workspaceId: ws, content: "abc", base: "rev1"))
        #expect(store.data.diary["d"]?.content == "abc")
    }

    @Test func journalConflictBecomesADraft() async throws {
        let server = FakeSyncServer()
        var rows = PullResponse.Rows()
        rows.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "start", updatedAt: "rev1")]
        await server.queuePull(seedPage(rows))
        let drafts = InMemoryDraftStore()
        let store = makeStore(server, drafts: drafts)
        await store.sync()
        var events: [SyncStore.Event] = []
        store.onEvent = { events.append($0) }

        store.enqueue(.saveDiary(entryId: "d", date: "2026-10-17", workspaceId: ws, content: "phone writing", base: "rev1"))
        await server.respond { PushResult(id: $0.id, status: 409) }
        var changed = PullResponse.Rows()
        changed.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "browser writing", updatedAt: "rev2", seq: 30)]
        await server.queuePull(PullResponse(cursor: 30, rows: changed))
        await store.sync()

        #expect(store.outbox.isEmpty)
        #expect(store.data.diary["d"]?.content == "browser writing") // never overwritten
        let identity = DiaryDraftIdentity(userId: "u1", entryId: "d", date: "2026-10-17", workspaceId: ws)
        let raw = try #require(drafts.string(forKey: DiaryDrafts.storageKey(identity)))
        guard case .staleBase(let draft) = DiaryDrafts.inspect(raw, expected: identity, serverUpdatedAt: "rev2") else {
            Issue.record("expected an offered draft")
            return
        }
        #expect(draft.content == "phone writing")
        #expect(events == [.journalConflict(date: "2026-10-17")])
    }

    @Test func conflictWithIdenticalWritingIsNotADraft() async {
        let server = FakeSyncServer()
        var rows = PullResponse.Rows()
        rows.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "start", updatedAt: "rev1")]
        await server.queuePull(seedPage(rows))
        let drafts = InMemoryDraftStore()
        let store = makeStore(server, drafts: drafts)
        await store.sync()
        store.enqueue(.saveDiary(entryId: "d", date: "2026-10-17", workspaceId: ws, content: "same", base: "rev1"))
        await server.respond { PushResult(id: $0.id, status: 409) }
        var changed = PullResponse.Rows()
        changed.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "same", updatedAt: "rev2", seq: 30)]
        await server.queuePull(PullResponse(cursor: 30, rows: changed))
        await store.sync()
        #expect(drafts.values.isEmpty)
    }

    @Test func offlinePageWaitsForItsCreateThenSaves() async {
        let server = FakeSyncServer()
        await server.queuePull(seedPage())
        let store = makeStore(server)
        await store.sync()
        let repo = Repository(store: store, days: DayMath(timeZone: TimeZone(identifier: "UTC")!, now: { fixedNow }))
        let page = repo.createDiaryPage(date: "2026-10-17", workspaceId: ws)
        _ = try? repo.saveDiaryPage(date: "2026-10-17", entryId: page.id, workspaceId: ws, content: "written offline", expectedUpdatedAt: page.updatedAt)
        #expect(store.outbox.contains { if case .saveDiary(_, _, _, _, nil) = $0.mutation { true } else { false } })

        await server.respond { op in
            if op.path == "/api/diary" {
                return PushResult(id: op.id, status: 201, body: serverJSON(diaryRow(page.id, date: "2026-10-17", content: "", updatedAt: "srv1", seq: 40)))
            }
            if op.path == "/api/diary/2026-10-17" {
                guard case .object(let body)? = op.body, body["expected_updated_at"] == "srv1" else { return PushResult(id: op.id, status: 409) }
                return PushResult(id: op.id, status: 200, body: serverJSON(diaryRow(page.id, date: "2026-10-17", content: "written offline", updatedAt: "srv2", seq: 41)))
            }
            return PushResult(id: op.id, status: 200)
        }
        await store.sync()
        #expect(store.outbox.isEmpty)
        #expect(store.data.diary[page.id]?.content == "written offline")
        let paths = await server.pushed.flatMap { $0.map(\.path) }
        #expect(paths.firstIndex(of: "/api/diary")! < paths.firstIndex(of: "/api/diary/2026-10-17")!)
    }

    @Test func offlinePageThatExistsWithWritingKeepsBothAsADraft() async throws {
        let server = FakeSyncServer()
        await server.queuePull(seedPage())
        let drafts = InMemoryDraftStore()
        let store = makeStore(server, drafts: drafts)
        await store.sync()
        let repo = Repository(store: store, days: DayMath(timeZone: TimeZone(identifier: "UTC")!, now: { fixedNow }))
        let page = repo.createDiaryPage(date: "2026-10-17", workspaceId: ws)
        _ = try repo.saveDiaryPage(date: "2026-10-17", entryId: page.id, workspaceId: ws, content: "phone", expectedUpdatedAt: page.updatedAt)
        await server.respond { op in
            // The browser made the same page meanwhile (same derived id) and wrote on it.
            PushResult(id: op.id, status: 200, body: serverJSON(diaryRow(page.id, date: "2026-10-17", content: "browser", updatedAt: "srv1", seq: 40)))
        }
        await store.sync()
        #expect(store.outbox.allSatisfy { if case .saveDiary = $0.mutation { false } else { true } })
        let identity = DiaryDraftIdentity(userId: "u1", entryId: page.id, date: "2026-10-17", workspaceId: ws)
        #expect(drafts.string(forKey: DiaryDrafts.storageKey(identity))?.contains("phone") == true)
    }

    @Test func tombstonesAndFullResyncRemoveRows() async {
        let server = FakeSyncServer()
        var rows = PullResponse.Rows()
        rows.links = [LinkRow(id: "l1", sourceType: "task", sourceId: "a", targetType: "note", targetId: "b")]
        rows.notes = [NoteRow(id: "gone", title: "Gone")]
        await server.queuePull(seedPage(rows))
        let store = makeStore(server)
        await store.sync()
        #expect(store.data.links["l1"] != nil)
        await server.queuePull(PullResponse(cursor: 20, tombstones: [.init(tableName: "links", rowId: "l1")]))
        await store.sync()
        #expect(store.data.links["l1"] == nil)
        // A full resync keeps only what the server returns.
        await server.queuePull(seedPage(cursor: 21))
        await store.sync(full: true)
        #expect(store.data.notes["gone"] == nil)
        #expect(await server.pullSinces.last == 0)
    }

    @Test func queuedChangesStayOnTopOfPulledRows() async {
        let server = FakeSyncServer()
        var rows = PullResponse.Rows()
        rows.tasks = [TaskRow(id: "t", title: "Old title", workspaceId: ws)]
        await server.queuePull(seedPage(rows))
        let store = makeStore(server)
        await store.sync()
        await server.setOffline(true)
        store.enqueue(.updateTask(id: "t", patch: ["title": "Phone title"]))
        await server.setOffline(false)
        await server.respond { PushResult(id: $0.id, status: 500) }
        var changed = PullResponse.Rows()
        var browser = TaskRow(id: "t", title: "Browser title", workspaceId: ws, priority: 3)
        browser.syncSeq = 50
        changed.tasks = [browser]
        await server.queuePull(PullResponse(cursor: 50, rows: changed))
        await store.sync()
        // The push failed, so the pull is skipped; the phone keeps showing its own edit.
        #expect(store.data.tasks["t"]?.title == "Phone title")
    }
}

@Suite("Repository journal")
@MainActor
struct RepositoryJournalTests {
    @Test func saveSurvivesTheServerRestampingTheRevision() async throws {
        let server = FakeSyncServer()
        var rows = PullResponse.Rows()
        rows.workspaces = [WorkspaceRow(id: ws, name: "Work")]
        rows.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "a", updatedAt: "rev1")]
        await server.queuePull(PullResponse(cursor: 10, rows: rows))
        let store = makeStore(server)
        await store.sync()
        let repo = Repository(store: store)
        let journal = JournalSession(backend: repo, store: InMemoryDraftStore(), userId: "u1")
        journal.debounce = .zero
        try await journal.load(date: "2026-10-17", workspaceId: ws)
        journal.edit("ab")
        await journal.flush()
        // Our save reaches the server and comes back with the server's revision.
        await server.respond { op in
            PushResult(id: op.id, status: 200, body: serverJSON(diaryRow("d", date: "2026-10-17", content: "ab", updatedAt: "rev2", seq: 20)))
        }
        await store.sync()
        #expect(store.data.diary["d"]?.updatedAt == "rev2")
        // The editor still holds the older token; the page holds the same text, so the next save is fine.
        journal.edit("abc")
        await journal.flush()
        #expect(journal.saveError == nil)
        #expect(store.data.diary["d"]?.content == "abc")
    }

    @Test func pageChangedElsewhereRefusesAStaleSave() async throws {
        let server = FakeSyncServer()
        var rows = PullResponse.Rows()
        rows.workspaces = [WorkspaceRow(id: ws, name: "Work")]
        rows.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "a", updatedAt: "rev1")]
        await server.queuePull(PullResponse(cursor: 10, rows: rows))
        let store = makeStore(server)
        await store.sync()
        let repo = Repository(store: store)
        let page = try #require(repo.diaryPage(date: "2026-10-17", workspaceId: ws))
        var changed = PullResponse.Rows()
        changed.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "browser", updatedAt: "rev9", seq: 30)]
        await server.queuePull(PullResponse(cursor: 30, rows: changed))
        await store.sync()
        #expect(throws: APIError.http(status: 409, message: "Diary entry has changed; reload before saving")) {
            try repo.saveDiaryPage(date: "2026-10-17", entryId: "d", workspaceId: ws, content: "phone", expectedUpdatedAt: page.updatedAt)
        }
        #expect(store.data.diary["d"]?.content == "browser")
    }

    @Test func refreshAdoptsAPageChangedElsewhereWhenNothingIsUnsaved() async throws {
        let server = FakeSyncServer()
        var rows = PullResponse.Rows()
        rows.workspaces = [WorkspaceRow(id: ws, name: "Work")]
        rows.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "a", updatedAt: "rev1")]
        await server.queuePull(PullResponse(cursor: 10, rows: rows))
        let store = makeStore(server)
        await store.sync()
        let repo = Repository(store: store)
        let journal = JournalSession(backend: repo, store: InMemoryDraftStore(), userId: "u1")
        try await journal.load(date: "2026-10-17", workspaceId: ws)
        var changed = PullResponse.Rows()
        changed.diaryEntries = [diaryRow("d", date: "2026-10-17", content: "from browser", updatedAt: "rev2", seq: 30)]
        await server.queuePull(PullResponse(cursor: 30, rows: changed))
        await store.sync()
        journal.refresh(from: try #require(repo.diaryPage(date: "2026-10-17", workspaceId: ws)))
        #expect(journal.text == "from browser")
        #expect(journal.identity?.updatedAt == "rev2")
    }
}
