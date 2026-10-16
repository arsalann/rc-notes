import Foundation
import Testing
@testable import DaybookKit

/// In-memory stand-in for the diary endpoints with the server's real semantics: get-or-create per
/// (date, workspace), and compare-and-swap PUT on the exact `updated_at` string.
actor FakeDiaryServer: DiaryBackend {
    struct Row { var entry: DiaryEntry }
    private var rows: [String: Row] = [:] // entry id → row
    private var clock = 0
    private(set) var saveLog: [(entryId: String, date: String, workspaceId: String?, content: String, expected: String)] = []
    var failNextSaveWith: APIError?
    /// Lets a test hold a save in flight to exercise ordering.
    var saveDelay: Duration = .zero

    private func stamp() -> String {
        clock += 1
        // Microsecond precision like DuckDB; a reformatted token would not match.
        return String(format: "2026-10-16 17:%02d:%02d.%06d", clock / 60 % 60, clock % 60, 100_000 + clock)
    }

    func seed(date: String, workspaceId: String?, content: String) -> DiaryEntry {
        let entry = DiaryEntry(id: UUID().uuidString, workspaceId: workspaceId, entryDate: date, content: content, updatedAt: stamp())
        rows[entry.id] = Row(entry: entry)
        return entry
    }

    func content(date: String, workspaceId: String?) -> String? {
        rows.values.first { $0.entry.entryDate == date && $0.entry.workspaceId == workspaceId }?.entry.content
    }

    func setFailure(_ error: APIError?) { failNextSaveWith = error }
    func setDelay(_ delay: Duration) { saveDelay = delay }

    /// Simulates another device editing the entry.
    func externalEdit(entryId: String, content: String) {
        rows[entryId]?.entry.content = content
        rows[entryId]?.entry.updatedAt = stamp()
    }

    nonisolated func diaryEntry(date: String, workspaceId: String?) async throws -> DiaryEntry? {
        await find(date: date, workspaceId: workspaceId)
    }

    private func find(date: String, workspaceId: String?) -> DiaryEntry? {
        rows.values.first { $0.entry.entryDate == date && $0.entry.workspaceId == workspaceId }?.entry
    }

    nonisolated func createDiaryEntry(date: String, workspaceId: String?) async throws -> DiaryEntry {
        await create(date: date, workspaceId: workspaceId)
    }

    private func create(date: String, workspaceId: String?) -> DiaryEntry {
        if let existing = find(date: date, workspaceId: workspaceId) { return existing }
        return seed(date: date, workspaceId: workspaceId, content: "")
    }

    nonisolated func saveDiaryEntry(date: String, entryId: String, workspaceId: String?, content: String, expectedUpdatedAt: String) async throws -> DiaryEntry {
        try await save(date: date, entryId: entryId, workspaceId: workspaceId, content: content, expected: expectedUpdatedAt)
    }

    private func save(date: String, entryId: String, workspaceId: String?, content: String, expected: String) async throws -> DiaryEntry {
        if saveDelay != .zero { try await Task.sleep(for: saveDelay) }
        saveLog.append((entryId, date, workspaceId, content, expected))
        if let error = failNextSaveWith {
            failNextSaveWith = nil
            throw error
        }
        guard var row = rows[entryId], row.entry.entryDate == date, row.entry.workspaceId == workspaceId else {
            throw APIError.http(status: 404, message: "Diary entry not found")
        }
        guard row.entry.updatedAt == expected else {
            throw APIError.http(status: 409, message: "Diary entry has changed; reload before saving")
        }
        row.entry.content = content
        row.entry.updatedAt = stamp()
        rows[entryId] = row
        return row.entry
    }
}

@MainActor
@Suite struct JournalSessionTests {
    let work = "ws-work"
    let personal = "ws-personal"

    func makeSession(_ server: FakeDiaryServer, store: InMemoryDraftStore = InMemoryDraftStore(), user: String = "u1") -> JournalSession {
        let session = JournalSession(backend: server, store: store, userId: user)
        session.debounce = .milliseconds(20)
        return session
    }

    @Test func pendingSaveTargetsTheDayItWasTypedOn() async throws {
        let server = FakeDiaryServer()
        let session = makeSession(server)
        try await session.load(date: "2026-10-16", workspaceId: work)
        session.edit("Friday thoughts")
        // Navigate before the debounce fires (the save is still pending).
        try await session.load(date: "2026-10-17", workspaceId: work)
        try await Task.sleep(for: .milliseconds(100))
        await session.flush()

        #expect(await server.content(date: "2026-10-16", workspaceId: work) == "Friday thoughts")
        #expect(await server.content(date: "2026-10-17", workspaceId: work) == "")
        #expect(session.text == "")
    }

    @Test func flushBeforeNavigationAcrossWorkspaces() async throws {
        let server = FakeDiaryServer()
        let session = makeSession(server)
        try await session.load(date: "2026-10-16", workspaceId: work)
        session.edit("work notes")
        await session.flush()
        try await session.load(date: "2026-10-16", workspaceId: personal)
        session.edit("personal notes")
        await session.flush()
        try await session.load(date: "2026-10-16", workspaceId: work)

        #expect(session.text == "work notes")
        #expect(await server.content(date: "2026-10-16", workspaceId: personal) == "personal notes")
        let log = await server.saveLog
        #expect(log.map(\.workspaceId) == [work, personal])
    }

    @Test func nullWorkspaceIsAnExactValue() async throws {
        let server = FakeDiaryServer()
        _ = await server.seed(date: "2026-10-16", workspaceId: nil, content: "unfiled")
        let session = makeSession(server)
        try await session.load(date: "2026-10-16", workspaceId: nil)
        session.edit("unfiled, edited")
        await session.flush()
        #expect(await server.saveLog.last?.workspaceId == nil)
        #expect(await server.content(date: "2026-10-16", workspaceId: nil) == "unfiled, edited")
    }

    @Test func consecutiveSavesEchoExactRevisions() async throws {
        let server = FakeDiaryServer()
        let session = makeSession(server)
        try await session.load(date: "2026-10-16", workspaceId: work)
        await server.setDelay(.milliseconds(30))
        session.edit("a")
        await session.flush()
        session.edit("ab")
        session.edit("abc")
        await session.flush()
        await server.setDelay(.zero)

        let log = await server.saveLog
        #expect(log.map(\.content) == ["a", "abc"])
        #expect(session.saveError == nil)
        #expect(session.entry?.content == "abc")
        #expect(session.identity?.updatedAt == session.entry?.updatedAt)
    }

    @Test func overlappingSavesAreSerialized() async throws {
        let server = FakeDiaryServer()
        let session = makeSession(server)
        try await session.load(date: "2026-10-16", workspaceId: work)
        let identity = try #require(session.identity)
        await server.setDelay(.milliseconds(40))
        async let first: Void = session.persist(identity, content: "one")
        async let second: Void = session.persist(identity, content: "two")
        _ = try await (first, second)
        // The second save must use the revision produced by the first (no false 409).
        #expect(await server.content(date: "2026-10-16", workspaceId: work) == "two")
    }

    @Test func divergentDraftIsOfferedNotWritten() async throws {
        let server = FakeDiaryServer()
        let store = InMemoryDraftStore()
        let entry = await server.seed(date: "2026-10-16", workspaceId: work, content: "server copy")
        let identity = DiaryDraftIdentity(userId: "u1", entryId: entry.id, date: "2026-10-16", workspaceId: work)
        store.set(DiaryDrafts.encode(DiaryDraft(identity: identity, content: "unsaved local", baseUpdatedAt: entry.updatedAt))!,
                  forKey: DiaryDrafts.storageKey(identity))

        let session = makeSession(server, store: store)
        try await session.load(date: "2026-10-16", workspaceId: work)
        #expect(session.recoveryDraft?.content == "unsaved local")
        #expect(session.text == "server copy")
        #expect(!session.canEdit)
        session.edit("typing is blocked")
        #expect(session.text == "server copy")
        try await Task.sleep(for: .milliseconds(60))
        #expect(await server.saveLog.isEmpty)

        try await session.restoreDraft()
        #expect(await server.content(date: "2026-10-16", workspaceId: work) == "unsaved local")
        #expect(store.values.isEmpty)
        #expect(session.canEdit)
    }

    @Test func discardClearsDraftWithoutWriting() async throws {
        let server = FakeDiaryServer()
        let store = InMemoryDraftStore()
        let entry = await server.seed(date: "2026-10-16", workspaceId: work, content: "server copy")
        let identity = DiaryDraftIdentity(userId: "u1", entryId: entry.id, date: "2026-10-16", workspaceId: work)
        store.set(DiaryDrafts.encode(DiaryDraft(identity: identity, content: "local", baseUpdatedAt: "older revision"))!,
                  forKey: DiaryDrafts.storageKey(identity))

        let session = makeSession(server, store: store)
        try await session.load(date: "2026-10-16", workspaceId: work)
        #expect(session.recoveryDraft != nil) // stale-base drafts are still offered
        session.discardDraft()
        #expect(store.values.isEmpty)
        #expect(await server.saveLog.isEmpty)
    }

    @Test func draftForAnotherDayOrWorkspaceIsIgnored() async throws {
        let server = FakeDiaryServer()
        let store = InMemoryDraftStore()
        let friday = await server.seed(date: "2026-10-16", workspaceId: work, content: "")
        let other = DiaryDraftIdentity(userId: "u1", entryId: friday.id, date: "2026-10-16", workspaceId: work)
        store.set(DiaryDrafts.encode(DiaryDraft(identity: other, content: "friday draft", baseUpdatedAt: friday.updatedAt))!,
                  forKey: DiaryDrafts.storageKey(other))

        let session = makeSession(server, store: store)
        try await session.load(date: "2026-10-17", workspaceId: work)
        #expect(session.recoveryDraft == nil)
        try await session.load(date: "2026-10-16", workspaceId: personal)
        #expect(session.recoveryDraft == nil)
        try await session.load(date: "2026-10-16", workspaceId: work)
        #expect(session.recoveryDraft?.content == "friday draft")
    }

    @Test func identicalDraftIsCleared() async throws {
        let server = FakeDiaryServer()
        let store = InMemoryDraftStore()
        let entry = await server.seed(date: "2026-10-16", workspaceId: work, content: "same")
        let identity = DiaryDraftIdentity(userId: "u1", entryId: entry.id, date: "2026-10-16", workspaceId: work)
        store.set(DiaryDrafts.encode(DiaryDraft(identity: identity, content: "same", baseUpdatedAt: entry.updatedAt))!,
                  forKey: DiaryDrafts.storageKey(identity))
        let session = makeSession(server, store: store)
        try await session.load(date: "2026-10-16", workspaceId: work)
        #expect(session.recoveryDraft == nil)
        #expect(store.values.isEmpty)
    }

    @Test func conflictKeepsLocalDraft() async throws {
        let server = FakeDiaryServer()
        let store = InMemoryDraftStore()
        let session = makeSession(server, store: store)
        try await session.load(date: "2026-10-16", workspaceId: work)
        let entryId = try #require(session.entry?.id)
        await server.externalEdit(entryId: entryId, content: "from the laptop")
        session.edit("from the phone")
        await session.flush()

        #expect(session.saveError?.contains("changed elsewhere") == true)
        #expect(await server.content(date: "2026-10-16", workspaceId: work) == "from the laptop")
        let key = try #require(store.values.keys.first)
        #expect(store.values[key]?.contains("from the phone") == true)

        // Reopening the day offers the phone copy instead of silently overwriting either side.
        try await session.load(date: "2026-10-16", workspaceId: work)
        #expect(session.text == "from the laptop")
        #expect(session.recoveryDraft?.content == "from the phone")
    }

    @Test func transportFailureKeepsDraftAndText() async throws {
        let server = FakeDiaryServer()
        let store = InMemoryDraftStore()
        let session = makeSession(server, store: store)
        try await session.load(date: "2026-10-16", workspaceId: work)
        await server.setFailure(.transport("offline"))
        session.edit("written offline")
        await session.flush()
        #expect(session.text == "written offline")
        #expect(store.values.count == 1)
        #expect(session.saveError != nil)
        // Next flush retries against the same identity and succeeds.
        await session.flush()
        #expect(await server.content(date: "2026-10-16", workspaceId: work) == "written offline")
        #expect(store.values.isEmpty)
    }

    @Test func draftKeysAreScopedPerUser() async throws {
        let server = FakeDiaryServer()
        let store = InMemoryDraftStore()
        let entry = await server.seed(date: "2026-10-16", workspaceId: work, content: "")
        let other = DiaryDraftIdentity(userId: "someone-else", entryId: entry.id, date: "2026-10-16", workspaceId: work)
        store.set(DiaryDrafts.encode(DiaryDraft(identity: other, content: "not mine", baseUpdatedAt: entry.updatedAt))!,
                  forKey: DiaryDrafts.storageKey(other))
        let session = makeSession(server, store: store)
        try await session.load(date: "2026-10-16", workspaceId: work)
        #expect(session.recoveryDraft == nil)
    }

    @Test func legacyDraftsAreQuarantined() {
        let store = InMemoryDraftStore([
            "daybook:diary-draft:u1:2026-10-16": "old",
            "daybook:diary-draft:u2:2026-10-16": "other user",
            "daybook:diary-draft:v2:u1:e:%7Bnone%7D:2026-10-16": "{}",
        ])
        let session = JournalSession(backend: FakeDiaryServer(), store: store, userId: "u1")
        session.quarantineLegacyDrafts(now: Date(timeIntervalSince1970: 0))
        #expect(store.values["daybook:diary-draft:u1:2026-10-16"] == nil)
        #expect(store.values["daybook:diary-draft:u1:2026-10-16:quarantine:1970-01-01T00%3A00%3A00.000Z"] == "old")
        #expect(store.values["daybook:diary-draft:u2:2026-10-16"] == "other user")
        #expect(store.values["daybook:diary-draft:v2:u1:e:%7Bnone%7D:2026-10-16"] == "{}")
    }
}

@Suite struct FileDraftStoreTests {
    @Test func roundTripsKeysAndValues() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileDraftStore(directory: dir)
        let key = "daybook:diary-draft:v2:u%201:e%2F1:%7Bnone%7D:2026-10-16"
        store.set("draft ✍️", forKey: key)
        store.set("legacy", forKey: "daybook:diary-draft:u1:x")
        // A fresh instance (relaunch) sees what was written synchronously.
        let reopened = FileDraftStore(directory: dir)
        #expect(reopened.string(forKey: key) == "draft ✍️")
        #expect(Set(reopened.allKeys()) == [key, "daybook:diary-draft:u1:x"])
        reopened.remove(forKey: key)
        #expect(reopened.string(forKey: key) == nil)
        reopened.removeAll()
        #expect(reopened.allKeys().isEmpty)
    }
}

@Suite struct DiaryDraftTests {
    let identity = DiaryDraftIdentity(userId: "u 1", entryId: "e/1", date: "2026-10-16", workspaceId: nil)

    @Test func storageKeyMatchesWebFormat() {
        #expect(DiaryDrafts.storageKey(identity) == "daybook:diary-draft:v2:u%201:e%2F1:%7Bnone%7D:2026-10-16")
        #expect(!DiaryDrafts.isLegacyKey(DiaryDrafts.storageKey(identity)))
        #expect(DiaryDrafts.isLegacyKey("daybook:diary-draft:u1:x"))
    }

    @Test func inspectStates() {
        let draft = DiaryDraft(identity: identity, content: "x", baseUpdatedAt: "rev1", savedAt: "2026-10-16T00:00:00.000Z")
        let raw = DiaryDrafts.encode(draft)
        #expect(DiaryDrafts.inspect(nil, expected: identity, serverUpdatedAt: "rev1") == .missing)
        #expect(DiaryDrafts.inspect("{nope", expected: identity, serverUpdatedAt: "rev1") == .invalid)
        #expect(DiaryDrafts.inspect(#"{"version":1}"#, expected: identity, serverUpdatedAt: "rev1") == .legacy)
        #expect(DiaryDrafts.inspect(raw, expected: identity, serverUpdatedAt: "rev1") == .accepted(draft))
        #expect(DiaryDrafts.inspect(raw, expected: identity, serverUpdatedAt: "rev2") == .staleBase(draft))
        var other = identity
        other.workspaceId = "w"
        #expect(DiaryDrafts.inspect(raw, expected: other, serverUpdatedAt: "rev1") == .contextMismatch)
        #expect(raw?.contains(#""workspaceId":null"#) == true)
    }

    @Test func readsDraftWrittenByWebFormat() {
        let web = #"{"version":2,"identity":{"userId":"u 1","entryId":"e/1","date":"2026-10-16","workspaceId":null},"content":"hi","savedAt":"2026-10-16T08:00:00.000Z","baseUpdatedAt":"rev1"}"#
        if case .accepted(let draft) = DiaryDrafts.inspect(web, expected: identity, serverUpdatedAt: "rev1") {
            #expect(draft.content == "hi")
        } else {
            Issue.record("web-format draft was not accepted")
        }
    }
}
