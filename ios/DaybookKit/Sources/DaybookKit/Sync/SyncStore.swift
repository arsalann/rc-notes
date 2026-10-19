import Foundation
import Observation

/// The local copy of the user's data plus the queue of changes not yet on the server.
///
/// - `server`: rows as last pulled (or as returned by an acknowledged change).
/// - `outbox`: queued changes, oldest first, saved to disk on every change.
/// - `data`: what the screens read = `server` with every queued change applied on top. Rebuilt after
///   each change and each sync, so a pull never hides a change that has not been sent yet.
///
/// `sync()` sends the queue in batches (`POST /api/sync/push`), then pulls what changed since the
/// last cursor (`GET /api/sync/pull`). A journal save the server rejects as a conflict (someone else
/// changed the page meanwhile) is never forced: the writing becomes a recovery draft that the Today
/// screen offers with Restore / Discard (AGENTS.md "Daybook Journal Write Safety").
@MainActor
@Observable
public final class SyncStore {
    public struct Status: Equatable, Sendable {
        public var lastSyncedAt: Date?
        public var isSyncing = false
        /// Queued changes, not counting day-page visits.
        public var pendingCount = 0
        /// The last sync's failure (network, server), cleared by the next success.
        public var lastError: String?
    }

    public enum Event: Equatable, Sendable {
        /// A journal page changed elsewhere before this device's writing reached the server.
        case journalConflict(date: String)
        /// The server refused a change (e.g. validation); it was dropped.
        case rejected(summary: String, message: String)
    }

    public private(set) var data = LocalData()
    /// Increments whenever `data` changes; screens reload on it.
    public private(set) var revision = 0
    public private(set) var status = Status()
    /// False until there is a local copy (from disk or a first pull).
    public private(set) var hasData = false
    public var onEvent: ((Event) -> Void)?

    public private(set) var outbox: [PendingOp] = []
    private var server = LocalData()
    private var cursor: Int64 = 0
    private var lastFullSync: Date?
    private var inFlight: Set<String> = []
    private var conflicts: [PendingOp] = []

    private let transport: any SyncTransport
    private let files: SyncFiles?
    private let drafts: any DraftKeyValueStore
    private let userId: String
    private let now: @Sendable () -> Date

    private var running: Task<Void, Never>?
    private var rerun = false
    private var scheduled: Task<Void, Never>?
    private var snapshotWrite: Task<Void, Never>?

    static let batchSize = 25
    static let pullLimit = 2000
    static let fullResyncInterval: TimeInterval = 24 * 3600
    /// A journal save still waiting for its page to reach the server after this many syncs becomes a
    /// recovery draft instead of blocking the queue.
    static let maxBlockedAttempts = 5

    /// `directory` nil keeps everything in memory (tests).
    public init(transport: any SyncTransport, directory: URL?, drafts: any DraftKeyValueStore, userId: String,
                now: @escaping @Sendable () -> Date = { Date() }) {
        self.transport = transport
        files = directory.map(SyncFiles.init)
        self.drafts = drafts
        self.userId = userId
        self.now = now
        if let files {
            if let snapshot = files.loadSnapshot() {
                server = snapshot.server
                cursor = snapshot.cursor
                lastFullSync = snapshot.lastFullSync
                status.lastSyncedAt = snapshot.lastSyncedAt
                hasData = true
            }
            outbox = files.loadOutbox()
        }
        rebuild()
    }

    // MARK: Reading

    /// The server's copy of a page (nil while it only exists on this device).
    func serverDiary(_ id: String) -> DiaryRow? { server.diary[id] }

    public var pendingOps: [PendingOp] { outbox }

    // MARK: Changing

    /// Applies a change locally, queues it (saved to disk before this returns) and schedules a sync.
    @discardableResult
    public func enqueue(_ mutation: Mutation, at time: Date? = nil) -> PendingOp {
        let clientTime = time ?? now()
        let op: PendingOp
        if let index = coalesceIndex(for: mutation) {
            outbox[index].mutation = merged(outbox[index].mutation, mutation)
            outbox[index].clientTime = clientTime
            op = outbox[index]
        } else {
            op = PendingOp(clientTime: clientTime, mutation: mutation)
            outbox.append(op)
        }
        saveOutbox()
        rebuild()
        scheduleSync(after: .seconds(2))
        return op
    }

    /// Rapid edits of one thing become one queued change: journal and goals saves anywhere in the
    /// queue (their content replaces the earlier one), note/task edits and reorders when they are the
    /// latest queued change. Never a change that is being sent right now.
    private func coalesceIndex(for mutation: Mutation) -> Int? {
        func editable(_ i: Int) -> Bool { !inFlight.contains(outbox[i].id) }
        switch mutation {
        case .saveDiary(let entryId, _, _, _, _):
            return outbox.indices.last { i in
                guard editable(i), case .saveDiary(let other, _, _, _, _) = outbox[i].mutation else { return false }
                return other == entryId
            }
        case .saveGoals(let week, let ws, _):
            return outbox.indices.last { i in
                guard editable(i), case .saveGoals(let w, let s, _) = outbox[i].mutation else { return false }
                return w == week && s == ws
            }
        case .updateNote(let id, _):
            guard let i = outbox.indices.last, editable(i), case .updateNote(let other, _) = outbox[i].mutation, other == id else { return nil }
            return i
        case .updateTask(let id, _):
            guard let i = outbox.indices.last, editable(i), case .updateTask(let other, _) = outbox[i].mutation, other == id else { return nil }
            return i
        case .setTaskPositions:
            guard let i = outbox.indices.last, editable(i), case .setTaskPositions = outbox[i].mutation else { return nil }
            return i
        default:
            return nil
        }
    }

    private func merged(_ old: Mutation, _ new: Mutation) -> Mutation {
        switch (old, new) {
        case (.saveDiary(let id, let date, let ws, _, let base), .saveDiary(_, _, _, let content, _)):
            // Keep the revision the first edit started from: that is what the server must still have.
            return .saveDiary(entryId: id, date: date, workspaceId: ws, content: content, base: base)
        case (.updateNote(let id, let a), .updateNote(_, let b)):
            return .updateNote(id: id, patch: a.merging(b) { _, latest in latest })
        case (.updateTask(let id, let a), .updateTask(_, let b)):
            return .updateTask(id: id, patch: a.merging(b) { _, latest in latest })
        case (.setTaskPositions(let a), .setTaskPositions(let b)):
            let replaced = Set(b.map(\.id))
            return .setTaskPositions(a.filter { !replaced.contains($0.id) } + b)
        default:
            return new
        }
    }

    private func rebuild() {
        var next = server
        for op in outbox { next.apply(op) }
        // Screens reload on `revision`; a sync that brought nothing new leaves it alone.
        if next != data {
            data = next
            revision += 1
        }
        status.pendingCount = outbox.filter { if case .visitDiary = $0.mutation { false } else { true } }.count
    }

    // MARK: Syncing

    /// Runs a sync soon (debounced: a burst of changes goes in one batch).
    public func scheduleSync(after delay: Duration) {
        scheduled?.cancel()
        scheduled = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.sync()
        }
    }

    /// Push queued changes, then pull. One at a time; a call during a sync runs another afterwards.
    public func sync(full: Bool = false) async {
        if let running {
            rerun = true
            await running.value
            return
        }
        let task = Task { await self.runSync(full: full) }
        running = task
        await task.value
        running = nil
        if rerun {
            rerun = false
            await sync()
        }
    }

    private func runSync(full: Bool) async {
        status.isSyncing = true
        defer { status.isSyncing = false }
        do {
            try await pushQueued()
            let needsFull = full || cursor == 0 || lastFullSync.map { now().timeIntervalSince($0) > Self.fullResyncInterval } ?? true
            try await pull(full: needsFull)
            resolveConflicts()
            resolveJournalBases()
            ageBlockedSaves()
            status.lastSyncedAt = now()
            status.lastError = nil
            hasData = true
            // Saves that were waiting for their page can go now; or they age out into drafts.
            if !outbox.isEmpty { scheduleSync(after: .seconds(5)) }
        } catch is CancellationError {
        } catch {
            status.lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        rebuild()
        saveSnapshot()
    }

    private func pushQueued() async throws {
        for _ in 0..<40 {
            resolveJournalBases()
            let batch = nextBatch()
            guard !batch.isEmpty else { return }
            inFlight = Set(batch.map(\.id))
            let response: PushResponse
            do {
                response = try await transport.push(batch.map(PushOp.init))
            } catch {
                inFlight = []
                throw error
            }
            inFlight = []
            var stop = response.stopped
            for result in response.results {
                guard let index = outbox.firstIndex(where: { $0.id == result.id }) else { continue }
                let op = outbox[index]
                switch result.status {
                case 200..<300:
                    outbox.remove(at: index)
                    acknowledge(op, result)
                case 401:
                    stop = true
                case 409:
                    outbox.remove(at: index)
                    if case .saveDiary = op.mutation {
                        conflicts.append(op)
                    } else {
                        onEvent?(.rejected(summary: op.mutation.summary, message: result.message))
                    }
                case 404:
                    // The thing it edits is gone (deleted elsewhere): nothing left to do.
                    outbox.remove(at: index)
                case 400..<500:
                    outbox.remove(at: index)
                    onEvent?(.rejected(summary: op.mutation.summary, message: result.message))
                default:
                    outbox[index].attempts += 1
                    stop = true
                }
                if stop { break }
            }
            saveOutbox()
            if stop || response.results.count < batch.count {
                if response.results.contains(where: { $0.status == 401 }) { throw APIError.http(status: 401, message: "Not authenticated") }
                if stop { throw APIError.http(status: response.results.last?.status ?? 500, message: "The server could not apply a change; it will be retried") }
                return
            }
        }
    }

    /// Queued changes in order, up to a journal save that cannot be sent yet (its page is not on
    /// the server, so there is no revision to compare against): everything after it waits too.
    private func nextBatch() -> [PendingOp] {
        var batch: [PendingOp] = []
        for op in outbox {
            if case .saveDiary(_, _, _, _, nil) = op.mutation { break }
            batch.append(op)
            if batch.count == Self.batchSize { break }
        }
        return batch
    }

    private func acknowledge(_ op: PendingOp, _ result: PushResult) {
        switch op.mutation {
        case .createTask, .updateTask, .setTaskCompleted, .setTaskPinned, .archiveTask:
            if let row = result.row(TaskRow.self) { server.upsert(row, into: \.tasks) }
        case .createNote, .updateNote:
            if let row = result.row(NoteRow.self) { server.upsert(row, into: \.notes) }
        case .createLink:
            if let row = result.row(LinkRow.self) { server.upsert(row, into: \.links) }
        case .saveGoals:
            if let row = result.row(GoalsRow.self) { server.upsert(row, into: \.goals) }
        case .createDiary(let date, let ws):
            guard let row = result.row(DiaryRow.self) else { return }
            server.upsert(row, into: \.diary)
            let localId = DiaryIds.entryId(date: date, workspaceId: ws ?? data.defaultWorkspaceId)
            if row.id != localId { adopt(page: row, replacing: localId) }
            settleUnsentSaves(for: row)
        case .saveDiary(let entryId, _, _, _, let base):
            guard let row = result.row(DiaryRow.self) else { return }
            server.upsert(row, into: \.diary)
            // Saves queued while this one was in flight started from the same revision (or none):
            // they continue from the one just written.
            for i in outbox.indices {
                guard case .saveDiary(let id, let d, let w, let content, let b) = outbox[i].mutation, id == entryId, b == base || b == nil else { continue }
                outbox[i].mutation = .saveDiary(entryId: id, date: d, workspaceId: w, content: content, base: row.updatedAt)
            }
        case .setTaskPositions, .tasksFromChecklist, .visitDiary:
            break
        }
    }

    /// The server already had a page for that day under another id (created before ids were derived
    /// from the date). Links and checklists made against the local page move to it; journal writing
    /// becomes a recovery draft there, since that page may already have writing of its own.
    private func adopt(page: DiaryRow, replacing localId: String) {
        var kept: [PendingOp] = []
        for var op in outbox {
            switch op.mutation {
            case .saveDiary(let id, _, _, let content, _) where id == localId:
                writeDraft(entryId: page.id, date: page.entryDate, workspaceId: page.workspaceId, content: content, base: "offline-page")
                continue
            case .createLink(let id, let st, let si, let tt, let ti) where si == localId || ti == localId:
                op.mutation = .createLink(id: id, sourceType: st, sourceId: si == localId ? page.id : si, targetType: tt, targetId: ti == localId ? page.id : ti)
            case .tasksFromChecklist(let items, let st, let si, let ws, let due) where si == localId:
                op.mutation = .tasksFromChecklist(items: items, sourceType: st, sourceId: page.id, workspaceId: ws, dueDate: due)
            default:
                break
            }
            kept.append(op)
        }
        outbox = kept
    }

    /// Journal saves typed before their page reached the server get the page's revision now. If the
    /// page already had writing from elsewhere, the save becomes a recovery draft instead.
    private func settleUnsentSaves(for page: DiaryRow) {
        var kept: [PendingOp] = []
        for var op in outbox {
            if case .saveDiary(let id, let date, let ws, let content, nil) = op.mutation, id == page.id {
                if page.content.isEmpty || page.content == content {
                    op.mutation = .saveDiary(entryId: id, date: date, workspaceId: ws, content: content, base: page.updatedAt)
                } else {
                    writeDraft(entryId: id, date: page.entryDate, workspaceId: page.workspaceId, content: content, base: "offline-page")
                    onEvent?(.journalConflict(date: page.entryDate))
                    continue
                }
            }
            kept.append(op)
        }
        outbox = kept
    }

    /// Saves whose page is on the server but which still have no revision (the page arrived by a
    /// pull, e.g. created by a task's due date) settle here.
    private func resolveJournalBases() {
        for op in outbox {
            guard case .saveDiary(let id, _, _, _, nil) = op.mutation else { continue }
            if let page = server.diary[id] { settleUnsentSaves(for: page) }
        }
        saveOutbox()
    }

    /// After each successful sync: a save still waiting for its page (the server has no such page)
    /// ages; past the limit its writing becomes a recovery draft so the rest of the queue can move.
    /// Failed syncs (offline) never age anything.
    private func ageBlockedSaves() {
        var kept: [PendingOp] = []
        var blockedSeen = false
        for var op in outbox {
            if case .saveDiary(let id, let date, let ws, let content, nil) = op.mutation, !blockedSeen {
                blockedSeen = true
                op.attempts += 1
                if op.attempts > Self.maxBlockedAttempts {
                    writeDraft(entryId: id, date: date, workspaceId: ws, content: content, base: "offline-page")
                    onEvent?(.journalConflict(date: date))
                    continue
                }
            }
            kept.append(op)
        }
        outbox = kept
    }

    private func pull(full: Bool) async throws {
        var since: Int64 = full ? 0 : cursor
        var next = full ? LocalData() : server
        while true {
            let page = try await transport.pull(since: since, limit: Self.pullLimit)
            for row in page.rows.workspaces { next.upsert(row, into: \.workspaces) }
            for row in page.rows.tasks { next.upsert(row, into: \.tasks) }
            for row in page.rows.notes { next.upsert(row, into: \.notes) }
            for row in page.rows.links { next.upsert(row, into: \.links) }
            for row in page.rows.diaryEntries { next.upsert(row, into: \.diary) }
            for row in page.rows.goalsWeekly { next.upsert(row, into: \.goals) }
            for tomb in page.tombstones { next.remove(table: tomb.tableName, id: tomb.rowId) }
            since = max(since, page.cursor)
            if !page.more { break }
        }
        server = next
        cursor = since
        if full { lastFullSync = now() }
    }

    /// A journal save the server refused because the page changed elsewhere: unless the page now
    /// holds the same writing, keep it as a recovery draft and tell the person.
    private func resolveConflicts() {
        for op in conflicts {
            guard case .saveDiary(let id, let date, let ws, let content, let base) = op.mutation else { continue }
            if server.diary[id]?.content == content { continue }
            writeDraft(entryId: id, date: date, workspaceId: ws, content: content, base: base ?? "offline-page")
            onEvent?(.journalConflict(date: date))
        }
        conflicts = []
    }

    private func writeDraft(entryId: String, date: String, workspaceId: String?, content: String, base: String) {
        guard !userId.isEmpty else { return }
        let identity = DiaryDraftIdentity(userId: userId, entryId: entryId, date: date, workspaceId: workspaceId)
        let draft = DiaryDraft(identity: identity, content: content, baseUpdatedAt: base)
        if let raw = DiaryDrafts.encode(draft) { drafts.set(raw, forKey: DiaryDrafts.storageKey(identity)) }
    }

    // MARK: Persistence

    private func saveOutbox() {
        files?.saveOutbox(outbox)
    }

    private func saveSnapshot() {
        guard let files else { return }
        let snapshot = SyncFiles.Snapshot(server: server, cursor: cursor, lastFullSync: lastFullSync, lastSyncedAt: status.lastSyncedAt)
        // Chained, so an older snapshot can never land after a newer one.
        let previous = snapshotWrite
        snapshotWrite = Task.detached(priority: .utility) {
            await previous?.value
            files.saveSnapshot(snapshot)
        }
    }

    /// Deletes the local copy and the queue (sign out).
    public func erase() {
        scheduled?.cancel()
        outbox = []
        server = LocalData()
        cursor = 0
        lastFullSync = nil
        status = Status()
        hasData = false
        files?.erase()
        rebuild()
    }
}

/// `snapshot.json` (the server copy and cursor; rewritten after each sync) and `outbox.json` (the
/// queue; rewritten synchronously on every change, so a queued change survives the app being killed).
public struct SyncFiles: Sendable {
    struct Snapshot: Codable, Sendable {
        var version = 1
        var server: LocalData
        var cursor: Int64
        var lastFullSync: Date?
        var lastSyncedAt: Date?
    }

    let directory: URL

    init(directory: URL) {
        self.directory = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private var snapshotURL: URL { directory.appendingPathComponent("snapshot.json") }
    private var outboxURL: URL { directory.appendingPathComponent("outbox.json") }

    func loadSnapshot() -> Snapshot? {
        guard let data = try? Data(contentsOf: snapshotURL),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data), snapshot.version == 1 else { return nil }
        return snapshot
    }

    func saveSnapshot(_ snapshot: Snapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: snapshotURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func loadOutbox() -> [PendingOp] {
        guard let data = try? Data(contentsOf: outboxURL) else { return [] }
        return (try? JSONDecoder().decode([PendingOp].self, from: data)) ?? []
    }

    func saveOutbox(_ ops: [PendingOp]) {
        guard let data = try? JSONEncoder().encode(ops) else { return }
        try? data.write(to: outboxURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func erase() {
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
}
