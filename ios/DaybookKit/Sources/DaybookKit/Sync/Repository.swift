import Foundation

/// What the screens call for data. Same methods as the `APIClient` data calls, answered from the
/// local copy (`SyncStore.data`) and written through the queue, so every screen works offline and
/// nothing waits for the network. Auth, users and passwords stay on `APIClient` (online only).
@MainActor
public final class Repository {
    public let store: SyncStore
    let days: DayMath
    /// Journal revision tokens handed to the editor, with the text each stood for. The local
    /// compare-and-swap accepts a save when the page still holds that text, even if a sync has since
    /// re-stamped the revision (our own save coming back from the server).
    private var tokenContent: [String: [String: String]] = [:]
    /// Day pages opened in this session (each is visited on the server once).
    private var visited: Set<String> = []

    public init(store: SyncStore, days: DayMath = .current) {
        self.store = store
        self.days = days
    }

    private var data: LocalData { store.data }

    static func notFound(_ what: String) -> APIError { .http(status: 404, message: "\(what) not found") }

    // MARK: Workspaces

    public func workspaces() -> [Workspace] { data.workspaceList() }

    // MARK: Tasks

    public func tasks(workspaceId: String?, archived: Bool) async throws -> [TaskItem] {
        data.taskList(workspaceId: workspaceId, archived: archived)
    }

    public func task(id: String) async throws -> TaskItem {
        guard let task = data.hydratedTask(id) else { throw Self.notFound("Task") }
        return task
    }

    public func tasksBatch(ids: [String]) async throws -> [TaskItem] {
        ids.compactMap(data.hydratedTask)
    }

    @discardableResult
    public func createTask(_ task: NewTask) async throws -> TaskItem {
        let title = task.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw APIError.http(status: 400, message: "Title is required") }
        let id = task.id ?? UUID().uuidString.lowercased()
        store.enqueue(.createTask(.init(id: id, title: title, description: task.description, parentId: task.parentId,
                                        workspaceId: task.workspaceId, tags: task.tags, dueAt: task.dueAt,
                                        priority: task.priority, status: task.status?.rawValue)))
        return try await self.task(id: id)
    }

    /// Partial update. Pass `.null` to clear (`due_at`, `workspace_id`, `parent_id`).
    @discardableResult
    public func updateTask(id: String, _ patch: JSONObject) async throws -> TaskItem {
        guard data.tasks[id] != nil else { throw Self.notFound("Task") }
        guard !patch.isEmpty else { throw APIError.http(status: 400, message: "No fields to update") }
        store.enqueue(.updateTask(id: id, patch: patch))
        return try await task(id: id)
    }

    /// Archives the task and its subtasks.
    @discardableResult
    public func archiveTask(id: String) async throws -> TaskItem {
        guard data.tasks[id] != nil else { throw Self.notFound("Task") }
        store.enqueue(.archiveTask(id: id))
        return try await task(id: id)
    }

    @discardableResult
    public func setTaskCompleted(id: String, _ completed: Bool) async throws -> TaskItem {
        guard data.tasks[id] != nil else { throw Self.notFound("Task") }
        store.enqueue(.setTaskCompleted(id: id, completed: completed))
        return try await task(id: id)
    }

    @discardableResult
    public func setTaskPinned(id: String, _ pinned: Bool) async throws -> TaskItem {
        guard data.tasks[id] != nil else { throw Self.notFound("Task") }
        store.enqueue(.setTaskPinned(id: id, pinned: pinned))
        return try await task(id: id)
    }

    /// Deletes tasks for good, with their subtasks and links (the multi-select bar's Delete).
    public func deleteTasks(ids: [String]) async throws {
        let existing = ids.filter { data.tasks[$0] != nil }
        guard !existing.isEmpty else { throw Self.notFound("Task") }
        store.enqueue(.deleteTasks(ids: existing))
    }

    /// Restore from (or move to) the archive: an explicit target, so a repeated change cannot flip twice.
    @discardableResult
    public func toggleTaskArchived(id: String) async throws -> TaskItem {
        guard let current = data.tasks[id] else { throw Self.notFound("Task") }
        return try await updateTask(id: id, ["archived": .bool(!current.archived)])
    }

    @discardableResult
    public func updateTaskPositions(_ items: [APIClient.PositionItem]) async throws -> PositionsResult {
        guard !items.isEmpty else { throw APIError.http(status: 400, message: "items must be a non-empty array") }
        store.enqueue(.setTaskPositions(items.map { .init(id: $0.id, position: $0.position, priority: $0.priority) }))
        let updated = items.filter { data.tasks[$0.id] != nil }.count
        return PositionsResult(requested: items.count, updated: updated)
    }

    public func completedTasks(from: String, to: String, workspaceId: String?) async throws -> [CompletedTask] {
        data.completedTasks(from: from, to: to, workspaceId: workspaceId, days: days)
    }

    public func outstandingTasks(workspaceId: String?) async throws -> [TaskItem] {
        data.outstandingTasks(workspaceId: workspaceId, now: days.now())
    }

    /// Creates tasks (with subtasks) from checklist lines, linked to the note or day page.
    @discardableResult
    public func tasksFromChecklist(items: [ChecklistTaskInput], sourceType: String, sourceId: String, workspaceId: String?, dueDate: String?) async throws -> [TaskItem] {
        guard !items.isEmpty else { throw APIError.http(status: 400, message: "No checklist items") }
        func input(_ item: ChecklistTaskInput) -> Mutation.ChecklistInput {
            .init(id: UUID().uuidString.lowercased(), title: item.title, checked: item.checked, tags: item.tags,
                  priority: item.priority, status: item.status?.rawValue, dueAt: item.dueAt, children: item.children.map(input))
        }
        let inputs = items.map(input)
        store.enqueue(.tasksFromChecklist(items: inputs, sourceType: sourceType, sourceId: sourceId, workspaceId: workspaceId, dueDate: dueDate))
        return inputs.compactMap { data.tasks[$0.id].map(data.taskItem) }
    }

    public func taskLinks(id: String) async throws -> [LinkItem] { data.linkItems(type: "task", id: id) }

    public func calendar(workspaceId: String?) async throws -> [CalendarDay] {
        data.calendar(workspaceId: workspaceId, days: days)
    }

    // MARK: Diary & goals

    /// nil when the date has no page yet.
    public func diaryPage(date: String, workspaceId: String?) -> DiaryEntry? {
        guard let page = data.diaryPage(date: date, workspaceId: workspaceId) else { return nil }
        remember(page)
        visit(date: date, workspaceId: workspaceId)
        return page
    }

    /// Get-or-create; a new page carries unfinished tasks forward from the latest earlier page.
    public func createDiaryPage(date: String, workspaceId: String?) -> DiaryEntry {
        if let existing = diaryPage(date: date, workspaceId: workspaceId) { return existing }
        var preview = data
        let carried = preview.createDiary(date: date, requestedWorkspaceId: workspaceId, now: ServerTime.string(days.now()))?.1 ?? []
        store.enqueue(.createDiary(date: date, workspaceId: workspaceId))
        guard let entry = data.diaryEntry(date: date, workspaceId: workspaceId) else {
            // Cannot happen: the change above created it.
            return DiaryEntry(id: DiaryIds.entryId(date: date, workspaceId: workspaceId), workspaceId: workspaceId, entryDate: date, content: "", updatedAt: "")
        }
        let page = data.page(entry, workspaceId: workspaceId, carried: carried)
        remember(page)
        return page
    }

    /// Compare-and-swap save bound to an exact page identity, like `PUT /api/diary/:date`: 404 when
    /// the identity does not match, 409 when the page changed since the editor loaded it.
    public func saveDiaryPage(date: String, entryId: String, workspaceId: String?, content: String, expectedUpdatedAt: String) throws -> DiaryEntry {
        guard let entry = data.diary[entryId], entry.entryDate == date, entry.workspaceId == workspaceId else {
            throw Self.notFound("Entry")
        }
        let basedOn = tokenContent[entryId]?[expectedUpdatedAt]
        guard expectedUpdatedAt == entry.updatedAt || basedOn == entry.content else {
            throw APIError.http(status: 409, message: "Diary entry has changed; reload before saving")
        }
        store.enqueue(.saveDiary(entryId: entryId, date: date, workspaceId: workspaceId, content: content,
                                 base: store.serverDiary(entryId)?.updatedAt))
        guard let saved = data.diary[entryId] else { throw Self.notFound("Entry") }
        let result = DiaryEntry(id: saved.id, workspaceId: saved.workspaceId, entryDate: saved.entryDate, content: saved.content, updatedAt: saved.updatedAt)
        remember(result)
        return result
    }

    private func remember(_ page: DiaryEntry) {
        var tokens = tokenContent[page.id] ?? [:]
        tokens[page.updatedAt] = page.content
        if tokens.count > 50 { tokens = [page.updatedAt: page.content] }
        tokenContent[page.id] = tokens
    }

    /// The server links tasks due on a page when the page is opened; queue that once per session.
    private func visit(date: String, workspaceId: String?) {
        let key = "\(date)|\(workspaceId ?? "")"
        guard visited.insert(key).inserted else { return }
        store.enqueue(.visitDiary(date: date, workspaceId: workspaceId))
    }

    public func diaryList(workspaceId: String?) async throws -> [DiaryEntry] { data.diaryList(workspaceId: workspaceId) }

    public func diaryDates(from: String, to: String, workspaceId: String?) async throws -> [String] {
        data.diaryDates(from: from, to: to, workspaceId: workspaceId)
    }

    public func goals(weekStart: String, workspaceId: String?) async throws -> GoalsEntry {
        data.goals(weekStart: weekStart, workspaceId: workspaceId)
    }

    public func saveGoals(weekStart: String, content: String, workspaceId: String?) async throws {
        store.enqueue(.saveGoals(weekStart: weekStart, workspaceId: workspaceId, content: content))
    }

    // MARK: Notes, links, search

    public func notes(workspaceId: String?, archived: Bool) async throws -> [Note] {
        data.noteList(workspaceId: workspaceId, archived: archived)
    }

    public func note(id: String) async throws -> Note {
        guard let note = data.note(id) else { throw Self.notFound("Note") }
        return note
    }

    public func createNote(title: String, workspaceId: String?, content: String = "") async throws -> Note {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw APIError.http(status: 400, message: "Title is required") }
        let id = UUID().uuidString.lowercased()
        store.enqueue(.createNote(id: id, title: trimmed, content: content, workspaceId: workspaceId))
        return try await note(id: id)
    }

    @discardableResult
    public func updateNote(id: String, _ patch: JSONObject) async throws -> Note {
        guard data.notes[id] != nil else { throw Self.notFound("Note") }
        guard !patch.isEmpty else { throw APIError.http(status: 400, message: "No fields to update") }
        store.enqueue(.updateNote(id: id, patch: patch))
        return try await note(id: id)
    }

    public func createLink(sourceType: String, sourceId: String, targetType: String, targetId: String) async throws {
        let types = ["task", "note", "diary"]
        guard types.contains(sourceType), types.contains(targetType) else { throw APIError.http(status: 400, message: "Invalid type") }
        guard !data.hasLink(sourceType, sourceId, targetType, targetId, eitherDirection: true) else { return }
        store.enqueue(.createLink(id: UUID().uuidString.lowercased(), sourceType: sourceType, sourceId: sourceId,
                                  targetType: targetType, targetId: targetId))
    }

    public func search(_ q: String, workspaceId: String?) async throws -> [SearchResult] { data.search(q, workspaceId: workspaceId) }

    public func mention(_ q: String, type: String? = nil) async throws -> [MentionResult] { data.mention(q, type: type) }
}

/// The journal reads and saves through the local copy.
extension Repository: DiaryBackend {
    public nonisolated func diaryEntry(date: String, workspaceId: String?) async throws -> DiaryEntry? {
        await MainActor.run { self.diaryPage(date: date, workspaceId: workspaceId) }
    }

    public nonisolated func createDiaryEntry(date: String, workspaceId: String?) async throws -> DiaryEntry {
        await MainActor.run { self.createDiaryPage(date: date, workspaceId: workspaceId) }
    }

    public nonisolated func saveDiaryEntry(date: String, entryId: String, workspaceId: String?, content: String, expectedUpdatedAt: String) async throws -> DiaryEntry {
        try await MainActor.run {
            try self.saveDiaryPage(date: date, entryId: entryId, workspaceId: workspaceId, content: content, expectedUpdatedAt: expectedUpdatedAt)
        }
    }
}
