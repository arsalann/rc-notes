import Foundation
import Observation

/// The three diary calls the journal needs; `APIClient` conforms, tests use a fake CAS server.
public protocol DiaryBackend: Sendable {
    func diaryEntry(date: String, workspaceId: String?) async throws -> DiaryEntry?
    func createDiaryEntry(date: String, workspaceId: String?) async throws -> DiaryEntry
    func saveDiaryEntry(date: String, entryId: String, workspaceId: String?, content: String, expectedUpdatedAt: String) async throws -> DiaryEntry
}

extension APIClient: DiaryBackend {}

/// The immutable identity of the entry on screen plus its last known server revision.
public struct LoadedJournalIdentity: Equatable, Sendable {
    public var draft: DiaryDraftIdentity
    public var updatedAt: String

    public var entryId: String { draft.entryId }
    public var date: String { draft.date }
    public var workspaceId: String? { draft.workspaceId }
}

/// Journal load/save engine, a port of the save path in `pages/diary.vue`.
///
/// Invariants (AGENTS.md "Daybook Journal Write Safety"):
/// - Every save targets the identity captured when the text was typed, never the current selection.
/// - Saves are serialized and use compare-and-swap on the exact `updated_at` string.
/// - A divergent local draft is only offered (Restore / Discard); it is never written automatically.
@MainActor
@Observable
public final class JournalSession {
    public private(set) var entry: DiaryEntry?
    public private(set) var identity: LoadedJournalIdentity?
    /// What the editor shows. Mutate through `edit(_:)`.
    public private(set) var text: String = ""
    public private(set) var recoveryDraft: DiaryDraft?
    public private(set) var isLoading = false
    public private(set) var isSaving = false
    /// Set when a background save fails; the UI shows it and clears it.
    public var saveError: String?
    /// Days that gained content through a save (keeps the day-rail dots current).
    public private(set) var savedNonEmptyDates: Set<String> = []

    public var debounce: Duration = .milliseconds(300)

    private let backend: any DiaryBackend
    private let store: any DraftKeyValueStore
    private var userId: String
    private var latestUpdatedAtByEntry: [String: String] = [:]
    private var saveChain: Task<Void, Never>?
    private var activeSaves = 0
    private var debounceTask: Task<Void, Never>?
    private var loadRequestId = 0

    public init(backend: any DiaryBackend, store: any DraftKeyValueStore, userId: String) {
        self.backend = backend
        self.store = store
        self.userId = userId
    }

    /// Editing is blocked while a recovered draft awaits Restore / Discard.
    public var canEdit: Bool { identity != nil && recoveryDraft == nil }
    public var hasUnsavedChanges: Bool { entry != nil && text != entry!.content }

    // MARK: Loading

    /// Loads (or creates) the page for a date + workspace filter. Returns false if superseded.
    /// Pending writing on the current page is flushed to *that* page first.
    @discardableResult
    public func load(date: String, workspaceId: String?) async throws -> Bool {
        loadRequestId += 1
        let requestId = loadRequestId
        await flush()
        guard requestId == loadRequestId else { return false }
        isLoading = true
        recoveryDraft = nil
        identity = nil
        entry = nil
        text = ""
        defer { if requestId == loadRequestId { isLoading = false } }

        var loaded = try await backend.diaryEntry(date: date, workspaceId: workspaceId)
        guard requestId == loadRequestId else { return false }
        if loaded == nil {
            loaded = try await backend.createDiaryEntry(date: date, workspaceId: workspaceId)
            guard requestId == loadRequestId else { return false }
        }
        guard let loaded else { return false }
        apply(loaded)
        return true
    }

    private func apply(_ loaded: DiaryEntry) {
        entry = loaded
        text = loaded.content
        let next = LoadedJournalIdentity(
            draft: DiaryDraftIdentity(userId: userId, entryId: loaded.id, date: String(loaded.entryDate.prefix(10)), workspaceId: loaded.workspaceId),
            updatedAt: loaded.updatedAt
        )
        identity = next
        latestUpdatedAtByEntry[next.entryId] = next.updatedAt
        offerDraft(for: next, serverContent: loaded.content)
    }

    /// Replaces links/tasks after a server-side change (checklist conversion, new links) without
    /// touching content or the revision the next save will be based on.
    public func refreshRelations(from fresh: DiaryEntry) {
        guard var current = entry, current.id == fresh.id else { return }
        current.links = fresh.links
        current.tasks = fresh.tasks
        entry = current
    }

    public func appendLocalLink(_ link: LinkItem) {
        guard var current = entry else { return }
        current.links = (current.links ?? []) + [link]
        entry = current
    }

    public func removeLocalLinks(targetId: String) {
        guard var current = entry else { return }
        current.links = (current.links ?? []).filter { $0.targetId != targetId }
        entry = current
    }

    // MARK: Editing & saving

    /// Updates the text, checkpoints a local draft and schedules a debounced save bound to the
    /// identity on screen right now.
    public func edit(_ newText: String) {
        guard canEdit else { return }
        text = newText
        scheduleSave()
    }

    private func scheduleSave() {
        guard let identity, let entry, text != entry.content else { return }
        checkpoint(identity, content: text)
        debounceTask?.cancel()
        let content = text
        let delay = debounce
        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let self else { return }
            do {
                try await self.persist(identity, content: content)
            } catch {
                self.saveError = Self.message(for: error)
            }
        }
    }

    /// Saves pending writing immediately (before navigation, backgrounding, leaving edit mode).
    public func flush() async {
        debounceTask?.cancel()
        debounceTask = nil
        guard let identity, let entry, text != entry.content else {
            await saveChain?.value
            return
        }
        let content = text
        checkpoint(identity, content: content)
        do {
            try await persist(identity, content: content)
        } catch {
            saveError = Self.message(for: error)
        }
    }

    /// Writes a draft for the current page if it diverges from the server copy (app backgrounding).
    public func checkpointCurrent() {
        guard let identity, let entry, recoveryDraft?.identity.entryId != identity.entryId, text != entry.content else { return }
        checkpoint(identity, content: text)
    }

    private func checkpoint(_ identity: LoadedJournalIdentity, content: String) {
        guard !identity.draft.userId.isEmpty else { return }
        let draft = DiaryDraft(identity: identity.draft, content: content,
                               baseUpdatedAt: latestUpdatedAtByEntry[identity.entryId] ?? identity.updatedAt)
        if let raw = DiaryDrafts.encode(draft) { store.set(raw, forKey: DiaryDrafts.storageKey(identity.draft)) }
    }

    private func clearDraft(_ identity: DiaryDraftIdentity, ifContent content: String? = nil) {
        let key = DiaryDrafts.storageKey(identity)
        if let content {
            guard let raw = store.string(forKey: key), let data = raw.data(using: .utf8),
                  let stored = try? JSONDecoder().decode(DiaryDraft.self, from: data), stored.content == content else { return }
        }
        store.remove(forKey: key)
    }

    /// Serialized compare-and-swap save of `content` into exactly `identity`'s entry.
    func persist(_ identity: LoadedJournalIdentity, content: String) async throws {
        let previous = saveChain
        // Runs on the main actor (inherited), so reading and recording the revision cannot interleave
        // with the next queued save: each save starts only after the previous one stored its result.
        let operation = Task<Result<DiaryEntry, Error>, Never> { [backend] in
            await previous?.value
            let expected = self.latestUpdatedAtByEntry[identity.entryId] ?? identity.updatedAt
            do {
                let saved = try await backend.saveDiaryEntry(date: identity.date, entryId: identity.entryId,
                                                             workspaceId: identity.workspaceId, content: content,
                                                             expectedUpdatedAt: expected)
                self.latestUpdatedAtByEntry[identity.entryId] = saved.updatedAt
                return .success(saved)
            } catch {
                return .failure(error)
            }
        }
        let chained = Task<Void, Never> { _ = await operation.value }
        saveChain = chained
        activeSaves += 1
        isSaving = true
        defer {
            activeSaves -= 1
            isSaving = activeSaves > 0
        }

        switch await operation.value {
        case .success(let saved):
            clearDraft(identity.draft, ifContent: content)
            if self.identity?.entryId == identity.entryId {
                self.identity?.updatedAt = saved.updatedAt
                if var current = entry, current.id == identity.entryId {
                    current.content = content
                    current.updatedAt = saved.updatedAt
                    entry = current
                }
            }
            if !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                savedNonEmptyDates.insert(identity.date)
            }
        case .failure(let error):
            throw error
        }
    }

    // MARK: Draft recovery

    private func readDraft(for identity: LoadedJournalIdentity) -> DiaryDraft? {
        guard !identity.draft.userId.isEmpty else { return nil }
        let raw = store.string(forKey: DiaryDrafts.storageKey(identity.draft))
        switch DiaryDrafts.inspect(raw, expected: identity.draft, serverUpdatedAt: identity.updatedAt) {
        case .accepted(let draft), .staleBase(let draft): return draft
        default: return nil
        }
    }

    private func offerDraft(for identity: LoadedJournalIdentity, serverContent: String) {
        guard let draft = readDraft(for: identity) else { return }
        if draft.content == serverContent {
            clearDraft(identity.draft, ifContent: draft.content)
            return
        }
        recoveryDraft = draft
    }

    /// Explicit user choice: rebase the recovered draft onto the current revision and save it.
    public func restoreDraft() async throws {
        guard let draft = recoveryDraft, let identity, draft.identity.entryId == identity.entryId else { return }
        let rebased = DiaryDraft(identity: identity.draft, content: draft.content, baseUpdatedAt: identity.updatedAt, savedAt: draft.savedAt)
        guard DiaryDrafts.canPersist(rebased, identity: identity.draft, serverUpdatedAt: identity.updatedAt) else { return }
        text = draft.content
        recoveryDraft = nil
        do {
            try await persist(identity, content: draft.content)
        } catch {
            recoveryDraft = draft
            if let entry { text = entry.content }
            throw error
        }
    }

    public func discardDraft() {
        guard let draft = recoveryDraft else { return }
        clearDraft(draft.identity)
        recoveryDraft = nil
    }

    /// Moves unversioned drafts aside (`…:quarantine:<ts>`) so they are never replayed.
    public func quarantineLegacyDrafts(now: Date = Date()) {
        guard !userId.isEmpty else { return }
        let userPrefix = "\(DiaryDraftFormat.legacyKeyPrefix)\(userId):"
        let stamp = DayMath.isoString(now)
        for key in store.allKeys() where key.hasPrefix(userPrefix) && !key.contains(":quarantine:") && DiaryDrafts.isLegacyKey(key) {
            if let value = store.string(forKey: key) { store.set(value, forKey: DiaryDrafts.quarantineKey(key, at: stamp)) }
            store.remove(forKey: key)
        }
    }

    static func message(for error: Error) -> String {
        if let api = error as? APIError, api.status == 409 {
            return "This page changed elsewhere. Your writing is kept on this device; reopen the day to continue."
        }
        return "Diary could not be saved. Your writing is still here; try again in a moment."
    }
}
