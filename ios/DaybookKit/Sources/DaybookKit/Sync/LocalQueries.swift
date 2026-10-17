import Foundation

// The read endpoints, answered from the local copy: each function returns what the matching
// `GET /api/...` returns, built from the same rules (see the SQL in `app/server/api/**`).

extension TaskItem {
    init(row: TaskRow, parentTitle: String?, subtaskCount: Int = 0, subtaskDone: Int = 0, subtasks: [TaskItem]? = nil) {
        id = row.id
        displayId = row.displayId
        workspaceId = row.workspaceId
        parentId = row.parentId
        title = row.title
        description = row.description
        completed = row.completed
        status = TaskStatus(rawValue: row.status) ?? (row.completed ? .done : .next)
        priority = row.priority
        completedAt = row.completedAt
        pinned = row.pinned
        archived = row.archived
        dueAt = row.dueAt
        tags = row.tags
        position = row.position
        createdAt = row.createdAt
        updatedAt = row.updatedAt
        self.subtaskCount = subtaskCount
        self.subtaskDone = subtaskDone
        let tagInfo = TaskTags.resolve(title: row.title, parentTitle: parentTitle, manualTags: row.tags)
        detectedTags = tagInfo.detected
        resolvedTags = tagInfo.resolved
        self.subtasks = subtasks
        self.parentTitle = parentTitle
        isOverdue = nil
    }
}

extension Note {
    init(row: NoteRow, links: [LinkItem] = []) {
        id = row.id
        displayId = row.displayId
        workspaceId = row.workspaceId
        title = row.title
        content = row.content
        preview = LocalData.preview(row.content, 200)
        pinned = row.pinned
        archived = row.archived
        tags = row.tags
        self.links = links
        createdAt = row.createdAt
        updatedAt = row.updatedAt
    }
}

extension GoalsEntry {
    init(id: String, weekStart: String, content: String, workspaceId: String?) {
        self.id = id
        self.weekStart = weekStart
        self.content = content
        self.workspaceId = workspaceId
    }
}

extension SearchResult {
    init(id: String, displayId: String, type: String, title: String, detail: String, completed: Bool, dueAt: String?) {
        self.id = id
        self.displayId = displayId
        self.type = type
        self.title = title
        self.detail = detail
        self.completed = completed
        self.dueAt = dueAt
    }
}

extension LocalData {
    /// SQL `CASE WHEN length(x) > n THEN substring(x, 1, n) || '...' ELSE x END`.
    static func preview(_ text: String, _ limit: Int) -> String {
        text.count > limit ? String(text.prefix(limit)) + "..." : text
    }

    /// `ILIKE '%term%'`.
    static func matches(_ value: String, _ term: String) -> Bool {
        value.range(of: term, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }

    // MARK: Tasks

    func taskItem(_ row: TaskRow) -> TaskItem {
        TaskItem(row: row, parentTitle: row.parentId.flatMap { tasks[$0]?.title })
    }

    /// `GET /api/tasks/:id` and `/api/tasks/batch`: the row, its parent's title and its subtasks.
    public func hydratedTask(_ id: String) -> TaskItem? {
        guard let row = tasks[id] else { return nil }
        let subs = subtasks(of: id).map { TaskItem(row: $0, parentTitle: row.title) }
        var item = taskItem(row)
        item.subtasks = subs
        return item
    }

    func subtasks(of id: String) -> [TaskRow] {
        tasks.values.filter { $0.parentId == id }.sorted { a, b in
            if a.completed != b.completed { return !a.completed }
            if a.position != b.position { return a.position < b.position }
            return a.id < b.id
        }
    }

    /// `GET /api/tasks?workspace_id=&archived=`: top-level tasks with subtask counts.
    public func taskList(workspaceId: String?, archived: Bool) -> [TaskItem] {
        var counts: [String: (Int, Int)] = [:]
        for row in tasks.values {
            guard let parent = row.parentId else { continue }
            let current = counts[parent] ?? (0, 0)
            counts[parent] = (current.0 + 1, current.1 + (row.completed ? 1 : 0))
        }
        return tasks.values
            .filter { $0.parentId == nil && $0.archived == archived && (workspaceId == nil || $0.workspaceId == workspaceId) }
            .sorted { a, b in
                if a.completed != b.completed { return !a.completed }
                if a.pinned != b.pinned { return a.pinned }
                if a.position != b.position { return a.position < b.position }
                if a.createdAt != b.createdAt { return a.createdAt > b.createdAt }
                return a.id < b.id
            }
            .map { row in
                let c = counts[row.id] ?? (0, 0)
                return TaskItem(row: row, parentTitle: nil, subtaskCount: c.0, subtaskDone: c.1)
            }
    }

    /// `GET /api/tasks/outstanding`: unfinished top-level tasks that are Now or overdue.
    public func outstandingTasks(workspaceId: String?, now: Date) -> [TaskItem] {
        let nowStamp = ServerTime.string(now)
        func overdue(_ row: TaskRow) -> Bool { row.dueAt.map { $0 < nowStamp } ?? false }
        return tasks.values
            .filter { $0.parentId == nil && !$0.archived && !$0.completed && ($0.status == "now" || overdue($0))
                && (workspaceId == nil || $0.workspaceId == workspaceId) }
            .sorted { a, b in
                if overdue(a) != overdue(b) { return overdue(a) }
                switch (a.dueAt, b.dueAt) {
                case let (x?, y?) where x != y: return x < y
                case (.some, nil): return true
                case (nil, .some): return false
                default: break
                }
                if a.priority != b.priority { return a.priority > b.priority }
                return a.createdAt > b.createdAt
            }
            .map { row in
                var item = TaskItem(row: row, parentTitle: nil)
                item.isOverdue = overdue(row)
                return item
            }
    }

    /// `GET /api/tasks/completed?from=&to=`: completed in [from - 1 day, to + 2 days) (UTC days).
    public func completedTasks(from: String, to: String, workspaceId: String?, days: DayMath) -> [CompletedTask] {
        let lower = days.addDays(from, -1), upper = days.addDays(to, 2)
        return tasks.values
            .filter { row in
                guard row.completed, let at = row.completedAt else { return false }
                return at >= lower && at < upper && (workspaceId == nil || row.workspaceId == workspaceId)
            }
            .sorted { ($0.completedAt ?? "") > ($1.completedAt ?? "") }
            .map { row in
                let parent = row.parentId.flatMap { tasks[$0] }
                return CompletedTask(id: row.id, displayId: row.displayId, title: row.title, completedAt: row.completedAt ?? "",
                                     parentId: row.parentId, parentTaskId: parent?.id, parentDisplayId: parent?.displayId,
                                     parentTitle: parent?.title)
            }
    }

    /// `GET /api/calendar`: tasks due in the five local days around today.
    public func calendar(workspaceId: String?, days: DayMath) -> [CalendarDay] {
        let window = (-2...2).map { days.offsetFromToday($0) }
        var byDay: [String: [TaskItem]] = Dictionary(uniqueKeysWithValues: window.map { ($0, []) })
        let rows = tasks.values
            .filter { $0.dueAt != nil && !$0.archived && (workspaceId == nil || $0.workspaceId == workspaceId) }
            .sorted { ($0.dueAt ?? "", $0.id) < ($1.dueAt ?? "", $1.id) }
        for row in rows {
            guard let day = days.localDay(ofServerTimestamp: row.dueAt), byDay[day] != nil else { continue }
            byDay[day]!.append(taskItem(row))
        }
        return window.map { CalendarDay(date: $0, tasks: byDay[$0] ?? []) }
    }

    // MARK: Links

    func title(of type: String, _ id: String) -> String {
        switch type {
        case "task": tasks[id]?.title ?? ""
        case "note": notes[id]?.title ?? ""
        default: ""
        }
    }

    /// Links from and to an item, each shown as "the other side" (`GET /api/task-links/:id`, note links).
    public func linkItems(type: String, id: String) -> [LinkItem] {
        let rows = links.values.sorted { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
        let outgoing = rows.filter { $0.sourceType == type && $0.sourceId == id }
            .map { LinkItem(linkId: $0.id, targetType: $0.targetType, targetId: $0.targetId, targetTitle: title(of: $0.targetType, $0.targetId)) }
        let incoming = rows.filter { $0.targetType == type && $0.targetId == id }
            .map { LinkItem(linkId: $0.id, targetType: $0.sourceType, targetId: $0.sourceId, targetTitle: title(of: $0.sourceType, $0.sourceId)) }
        return outgoing + incoming
    }

    // MARK: Diary

    /// `GET /api/diary/:date`: the page, its links and hydrated tasks. Like the server, tasks due that
    /// day (UTC date, unfinished, same workspace) are on the page even before a link row exists.
    public func diaryPage(date: String, workspaceId: String?) -> DiaryEntry? {
        guard let entry = diaryEntry(date: date, workspaceId: workspaceId) else { return nil }
        return page(entry, workspaceId: workspaceId, carried: nil)
    }

    func page(_ entry: DiaryRow, workspaceId: String?, carried: [TaskRow]?) -> DiaryEntry {
        let sources: Set<String> = workspaceId != nil
            ? [entry.id]
            : Set(diary.values.filter { $0.entryDate == entry.entryDate }.map(\.id))
        func inWorkspace(_ link: LinkRow) -> Bool {
            guard let workspaceId else { return true }
            switch link.targetType {
            case "task": return tasks[link.targetId]?.workspaceId == workspaceId
            case "note": return notes[link.targetId]?.workspaceId == workspaceId
            default: return false
            }
        }
        var items = links.values
            .filter { $0.sourceType == "diary" && sources.contains($0.sourceId) && inWorkspace($0) }
            .sorted { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
            .map { LinkItem(linkId: $0.id, targetType: $0.targetType, targetId: $0.targetId, targetTitle: title(of: $0.targetType, $0.targetId)) }
        var linked = Set(items.filter { $0.targetType == "task" }.map(\.targetId))
        let due = tasks.values
            .filter { $0.dueAt.flatMap(ServerTime.utcDay) == entry.entryDate && !$0.completed && $0.deletedAt == nil
                && (workspaceId == nil || $0.workspaceId == workspaceId) }
            .sorted { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
        for task in due where !linked.contains(task.id) {
            linked.insert(task.id)
            items.append(LinkItem(linkId: "due:\(task.id)", targetType: "task", targetId: task.id, targetTitle: task.title))
        }
        var seen = Set<String>()
        let taskIds = items.filter { $0.targetType == "task" && seen.insert($0.targetId).inserted }.map(\.targetId)
        var result = DiaryEntry(id: entry.id, workspaceId: entry.workspaceId, entryDate: entry.entryDate, content: entry.content,
                                updatedAt: entry.updatedAt, links: items, tasks: taskIds.compactMap(hydratedTask),
                                carriedTasks: carried.map { $0.map { CarriedTask(id: $0.id, title: $0.title) } })
        result.preview = nil
        return result
    }

    /// `GET /api/diary`: pages with writing, newest first.
    public func diaryList(workspaceId: String?) -> [DiaryEntry] {
        diary.values
            .filter { $0.deletedAt == nil && !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && (workspaceId == nil || $0.workspaceId == workspaceId) }
            .sorted { ($0.entryDate, $0.updatedAt) > ($1.entryDate, $1.updatedAt) }
            .map { row in
                var entry = DiaryEntry(id: row.id, workspaceId: row.workspaceId, entryDate: row.entryDate, content: row.content, updatedAt: row.updatedAt)
                entry.preview = LocalData.preview(row.content, 200)
                return entry
            }
    }

    /// `GET /api/diary/dates`: days in [from, to] whose page has writing.
    public func diaryDates(from: String, to: String, workspaceId: String?) -> [String] {
        Array(Set(diary.values
            .filter { $0.entryDate >= from && $0.entryDate <= to && !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && (workspaceId == nil || $0.workspaceId == workspaceId) }
            .map(\.entryDate))).sorted()
    }

    /// `GET /api/goals/:week`. Unlike the server it does not create a row on read; an empty entry is
    /// returned until something is written.
    public func goals(weekStart: String, workspaceId: String?) -> GoalsEntry {
        if let row = goals.values.filter({ $0.weekStart == weekStart && (workspaceId == nil || $0.workspaceId == workspaceId) })
            .min(by: { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }) {
            return GoalsEntry(id: row.id, weekStart: row.weekStart, content: row.content, workspaceId: row.workspaceId)
        }
        return GoalsEntry(id: "", weekStart: weekStart, content: "", workspaceId: workspaceId ?? defaultWorkspaceId)
    }

    // MARK: Notes & search

    /// `GET /api/notes?workspace_id=&archived=`.
    public func noteList(workspaceId: String?, archived: Bool) -> [Note] {
        notes.values
            .filter { $0.archived == archived && (workspaceId == nil || $0.workspaceId == workspaceId) }
            .sorted { a, b in
                if a.pinned != b.pinned { return a.pinned }
                return (a.updatedAt, a.id) > (b.updatedAt, b.id)
            }
            .map { Note(row: $0) }
    }

    /// `GET /api/notes/:id` with its links.
    public func note(_ id: String) -> Note? {
        notes[id].map { Note(row: $0, links: linkItems(type: "note", id: id)) }
    }

    /// `GET /api/search`: unarchived top-level tasks and notes matching the text, newest first, 30 max.
    public func search(_ query: String, workspaceId: String?) -> [SearchResult] {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return [] }
        let taskHits = tasks.values
            .filter { !$0.archived && $0.parentId == nil && (workspaceId == nil || $0.workspaceId == workspaceId)
                && (Self.matches($0.title, term) || Self.matches($0.description, term) || Self.matches($0.displayId, term)) }
            .map { (updated: $0.updatedAt, result: SearchResult(id: $0.id, displayId: $0.displayId, type: "task", title: $0.title,
                                                                detail: $0.description, completed: $0.completed, dueAt: $0.dueAt)) }
        let noteHits = notes.values
            .filter { !$0.archived && (workspaceId == nil || $0.workspaceId == workspaceId)
                && (Self.matches($0.title, term) || Self.matches($0.content, term) || Self.matches($0.displayId, term)) }
            .map { (updated: $0.updatedAt, result: SearchResult(id: $0.id, displayId: $0.displayId, type: "note", title: $0.title,
                                                                detail: Self.preview($0.content, 100), completed: false, dueAt: nil)) }
        return (taskHits + noteHits).sorted { $0.updated > $1.updated }.prefix(30).map(\.result)
    }

    /// `GET /api/mention?q=&type=`: unarchived tasks (any level) and notes by title or display id.
    public func mention(_ query: String, type: String?) -> [MentionResult] {
        let term = query.trimmingCharacters(in: .whitespaces)
        var hits: [(String, MentionResult)] = []
        if type == nil || type == "task" {
            hits += tasks.values.filter { !$0.archived && (Self.matches($0.title, term) || Self.matches($0.displayId, term) || term.isEmpty) }
                .map { ($0.updatedAt, MentionResult(id: $0.id, displayId: $0.displayId, type: "task", title: $0.title, completed: $0.completed)) }
        }
        if type == nil || type == "note" {
            hits += notes.values.filter { !$0.archived && (Self.matches($0.title, term) || Self.matches($0.displayId, term) || term.isEmpty) }
                .map { ($0.updatedAt, MentionResult(id: $0.id, displayId: $0.displayId, type: "note", title: $0.title)) }
        }
        return hits.sorted { $0.0 > $1.0 }.prefix(10).map(\.1)
    }

    public func workspaceList() -> [Workspace] {
        workspaces.values.sorted { ($0.position, $0.id) < ($1.position, $1.id) }
            .map { Workspace(id: $0.id, name: $0.name, emoji: $0.emoji, position: $0.position) }
    }
}
