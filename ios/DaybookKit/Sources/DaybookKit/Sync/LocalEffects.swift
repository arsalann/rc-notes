import Foundation

/// What each queued change does to the local copy before the server has seen it: a port of the
/// write rules in the endpoints (`app/server/api/**`). It only has to look right until the next
/// pull, when the server's own rows replace it; ids are chosen on the phone, so they match.
extension LocalData {
    public mutating func apply(_ op: PendingOp) {
        let now = ServerTime.string(op.clientTime)
        switch op.mutation {
        case .createTask(let input):
            createTask(input, now: now, clientTime: op.clientTime)
        case .updateTask(let id, let patch):
            updateTask(id, patch, now: now, clientTime: op.clientTime)
        case .setTaskCompleted(let id, let completed):
            guard var task = tasks[id] else { return }
            setCompletion(&task, completed, now: now, reopenedStatus: "next")
            task.updatedAt = now
            tasks[id] = task
        case .setTaskPinned(let id, let pinned):
            tasks[id]?.pinned = pinned
            tasks[id]?.updatedAt = now
        case .archiveTask(let id):
            for (subId, sub) in tasks where sub.parentId == id {
                tasks[subId]?.archived = true
                tasks[subId]?.updatedAt = now
            }
            tasks[id]?.archived = true
            tasks[id]?.updatedAt = now
        case .setTaskPositions(let items):
            for item in items where tasks[item.id] != nil {
                tasks[item.id]!.position = item.position
                if let p = item.priority, (0...3).contains(p) { tasks[item.id]!.priority = p }
                tasks[item.id]!.updatedAt = now
            }
        case .deleteTasks(let ids):
            deleteTasks(ids)
        case .tasksFromChecklist(let items, let sourceType, let sourceId, let workspaceId, let dueDate):
            checklist(items, sourceType: sourceType, sourceId: sourceId, workspaceId: workspaceId, dueDate: dueDate, now: now)
        case .createNote(let id, let title, let content, let workspaceId):
            guard notes[id] == nil else { return }
            notes[id] = NoteRow(id: id, title: title.trimmingCharacters(in: .whitespacesAndNewlines), content: content,
                                workspaceId: workspaceId, createdAt: now)
        case .updateNote(let id, let patch):
            guard var note = notes[id] else { return }
            if let v = patch["title"]?.stringValue { note.title = v.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let v = patch["content"]?.stringValue { note.content = v }
            if let v = patch["tags"] { note.tags = v.stringArray ?? [] }
            if let v = patch["pinned"]?.boolValue { note.pinned = v }
            if let v = patch["archived"]?.boolValue { note.archived = v }
            if let v = patch["workspace_id"] { note.workspaceId = v.stringValue }
            note.updatedAt = now
            notes[id] = note
        case .createLink(let id, let sourceType, let sourceId, let targetType, let targetId):
            guard !hasLink(sourceType, sourceId, targetType, targetId, eitherDirection: true) else { return }
            links[id] = LinkRow(id: id, sourceType: sourceType, sourceId: sourceId, targetType: targetType, targetId: targetId, createdAt: now)
        case .createDiary(let date, let workspaceId):
            _ = createDiary(date: date, requestedWorkspaceId: workspaceId, now: now)
        case .saveDiary(let entryId, let date, let workspaceId, let content, _):
            guard var entry = diary[entryId], entry.entryDate == date, entry.workspaceId == workspaceId else { return }
            entry.content = content
            entry.updatedAt = now
            diary[entryId] = entry
        case .visitDiary:
            break
        case .saveGoals(let weekStart, let workspaceId, let content):
            let matching = goals.values.filter { $0.weekStart == weekStart && (workspaceId == nil || $0.workspaceId == workspaceId) }
            if matching.isEmpty {
                let ws = workspaceId ?? defaultWorkspaceId
                let id = "local-goals:\(weekStart):\(ws ?? "")"
                goals[id] = GoalsRow(id: id, workspaceId: ws, weekStart: weekStart, content: content, createdAt: now)
            } else {
                for row in matching {
                    goals[row.id]?.content = content
                    goals[row.id]?.updatedAt = now
                }
            }
        }
    }

    // MARK: Tasks

    private mutating func createTask(_ input: Mutation.NewTaskInput, now: String, clientTime: Date) {
        guard tasks[input.id] == nil else { return }
        let title = input.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        let parent = input.parentId.flatMap { tasks[$0] }
        let workspaceId = input.workspaceId ?? (input.parentId != nil ? parent?.workspaceId : defaultWorkspaceId)
        let priority = input.priority.flatMap { (0...3).contains($0) ? $0 : nil } ?? parent.map(\.priority) ?? 2
        let due = input.dueAt.flatMap(ServerTime.storedDue)
        let status: String
        if let s = input.status, ["next", "now", "done"].contains(s) {
            status = s
        } else {
            status = (input.dueAt.map { Self.isWithinNextDays($0, 7, from: clientTime) } ?? false) ? "now" : "next"
        }
        let position: Int
        if let parentId = input.parentId {
            position = (tasks.values.filter { $0.parentId == parentId }.map(\.position).max() ?? -1) + 1
        } else {
            position = (tasks.values.filter { $0.parentId == nil }.map(\.position).min() ?? 1) - 1
        }
        var row = TaskRow(id: input.id, title: title, workspaceId: workspaceId, parentId: input.parentId, status: status,
                          priority: priority, dueAt: due, tags: (input.tags ?? []).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty },
                          position: position, createdAt: now)
        row.description = input.description?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        tasks[input.id] = row
        if let due, input.parentId == nil {
            linkTaskToDiary(taskId: input.id, due: due, workspaceId: workspaceId, now: now)
        }
    }

    private mutating func updateTask(_ id: String, _ patch: JSONObject, now: String, clientTime: Date) {
        guard var task = tasks[id] else { return }
        if let v = patch["title"]?.stringValue { task.title = v.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let v = patch["description"]?.stringValue { task.description = v }
        if let v = patch["tags"] { task.tags = v.stringArray ?? [] }
        if let v = patch["pinned"]?.boolValue { task.pinned = v }
        if let v = patch["archived"]?.boolValue { task.archived = v }
        if let v = patch["position"]?.intValue { task.position = v }
        if let due = patch["due_at"] {
            if due.isNull {
                task.dueAt = nil
            } else if let raw = due.stringValue, let stored = ServerTime.storedDue(raw) {
                task.dueAt = stored
                if patch["status"] == nil, Self.isWithinNextDays(raw, 7, from: clientTime), task.status != "done" {
                    task.status = "now"
                }
            }
        }
        if let v = patch["parent_id"] { task.parentId = v.stringValue }
        if let v = patch["workspace_id"] { task.workspaceId = v.stringValue }
        if let v = patch["priority"] {
            let p = v.intValue ?? 0
            task.priority = (0...3).contains(p) ? p : 0
        }
        if let s = patch["status"]?.stringValue, ["next", "now", "done"].contains(s) {
            task.status = s
            task.completed = s == "done"
            task.completedAt = s == "done" ? (task.completedAt ?? now) : nil
        }
        task.updatedAt = now
        tasks[id] = task

        if let due = patch["due_at"] {
            if !due.isNull, let stored = task.dueAt {
                linkTaskToDiary(taskId: id, due: stored, workspaceId: task.workspaceId, now: now)
            } else if due.isNull {
                for (linkId, link) in links where link.sourceType == "diary" && link.targetType == "task" && link.targetId == id {
                    links[linkId] = nil
                }
            }
        }
    }

    /// Port of the `delete` action of `POST /api/tasks/bulk`: the tasks, their subtasks at any depth,
    /// and every link from or to any of them.
    mutating func deleteTasks(_ ids: [String]) {
        var doomed = Set(ids.filter { tasks[$0] != nil })
        var frontier = doomed
        while !frontier.isEmpty {
            let children = Set(tasks.values.filter { $0.parentId.map(frontier.contains) ?? false }.map(\.id)).subtracting(doomed)
            doomed.formUnion(children)
            frontier = children
        }
        guard !doomed.isEmpty else { return }
        for id in doomed { tasks[id] = nil }
        for (linkId, link) in links where (link.sourceType == "task" && doomed.contains(link.sourceId))
            || (link.targetType == "task" && doomed.contains(link.targetId)) {
            links[linkId] = nil
        }
    }

    private func setCompletion(_ task: inout TaskRow, _ completed: Bool, now: String, reopenedStatus: String) {
        task.completed = completed
        task.completedAt = completed ? (task.completedAt ?? now) : nil
        task.status = completed ? "done" : reopenedStatus
    }

    /// Port of `isWithinNextDays`: due no later than `days` days from now (past dates count).
    static func isWithinNextDays(_ raw: String, _ days: Int, from now: Date) -> Bool {
        guard let due = DayMath.parseServerTimestamp(raw) else { return false }
        return due.timeIntervalSince(now) <= Double(days) * 86_400
    }

    /// Port of `linkTaskToDiary` (db.ts): the task shows on the page of its due day (UTC date, as the
    /// server computes it), in its workspace; links to other days' pages are removed.
    mutating func linkTaskToDiary(taskId: String, due: String, workspaceId: String?, now: String) {
        guard let date = ServerTime.utcDay(due) else { return }
        var entry = diary.values.filter { $0.entryDate == date && $0.workspaceId == workspaceId }.min { $0.createdAt < $1.createdAt }
        if entry == nil {
            let ws = workspaceId ?? defaultWorkspaceId
            let id = DiaryIds.entryId(date: date, workspaceId: ws)
            if diary[id] == nil { diary[id] = DiaryRow(id: id, workspaceId: ws, entryDate: date, createdAt: now) }
            entry = diary[id]
        }
        guard let entry else { return }
        for (linkId, link) in links where link.sourceType == "diary" && link.targetType == "task" && link.targetId == taskId
            && link.sourceId != entry.id && diary[link.sourceId].map({ $0.entryDate != date }) ?? false {
            links[linkId] = nil
        }
        if !hasLink("diary", entry.id, "task", taskId, eitherDirection: false) {
            let id = "local-link:\(entry.id):\(taskId)"
            links[id] = LinkRow(id: id, sourceType: "diary", sourceId: entry.id, targetType: "task", targetId: taskId, createdAt: now)
        }
    }

    private mutating func checklist(_ items: [Mutation.ChecklistInput], sourceType: String, sourceId: String,
                                    workspaceId: String?, dueDate: String?, now: String) {
        let ws = workspaceId ?? defaultWorkspaceId
        for item in items where tasks[item.id] == nil {
            let position = (tasks.values.filter { $0.parentId == nil }.map(\.position).max() ?? -1) + 1
            let status = item.status.flatMap { ["next", "now", "done"].contains($0) ? $0 : nil }
                ?? (item.checked ? "done" : (dueDate != nil || item.dueAt != nil ? "now" : "next"))
            let due = item.dueAt.flatMap(ServerTime.storedDue) ?? dueDate.flatMap { ServerTime.storedDue("\($0)T12:00:00") }
            var row = TaskRow(id: item.id, title: item.title, workspaceId: ws, status: status,
                              priority: item.priority.flatMap { (0...3).contains($0) ? $0 : nil } ?? 2,
                              dueAt: due, tags: item.tags ?? [], position: position, createdAt: now)
            row.completed = item.checked
            row.completedAt = item.checked ? now : nil
            tasks[item.id] = row
            if !hasLink(sourceType, sourceId, "task", item.id, eitherDirection: false) {
                let id = "local-link:\(sourceId):\(item.id)"
                links[id] = LinkRow(id: id, sourceType: sourceType, sourceId: sourceId, targetType: "task", targetId: item.id, createdAt: now)
            }
            for (index, child) in item.children.enumerated() where tasks[child.id] == nil {
                let childStatus = child.status.flatMap { ["next", "now", "done"].contains($0) ? $0 : nil } ?? (child.checked ? "done" : "next")
                var sub = TaskRow(id: child.id, title: child.title, workspaceId: ws, parentId: item.id, status: childStatus,
                                  priority: child.priority.flatMap { (0...3).contains($0) ? $0 : nil } ?? 2,
                                  tags: child.tags ?? [], position: index, createdAt: now)
                sub.completed = child.checked
                sub.completedAt = child.checked ? now : nil
                tasks[child.id] = sub
            }
        }
    }

    // MARK: Links & diary

    func hasLink(_ sourceType: String, _ sourceId: String, _ targetType: String, _ targetId: String, eitherDirection: Bool) -> Bool {
        links.values.contains { l in
            (l.sourceType == sourceType && l.sourceId == sourceId && l.targetType == targetType && l.targetId == targetId)
                || (eitherDirection && l.sourceType == targetType && l.sourceId == targetId && l.targetType == sourceType && l.targetId == sourceId)
        }
    }

    /// The page shown for a date and workspace filter (nil = All), like `GET /api/diary/:date`.
    /// With All, prefer the default workspace's page so the choice is stable.
    public func diaryEntry(date: String, workspaceId: String?) -> DiaryRow? {
        let candidates = diary.values.filter { $0.entryDate == date && (workspaceId == nil || $0.workspaceId == workspaceId) }
        if workspaceId == nil, let preferred = candidates.first(where: { $0.workspaceId == defaultWorkspaceId }) { return preferred }
        return candidates.min { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
    }

    /// Port of `POST /api/diary`: get-or-create, carrying unfinished tasks forward from the latest
    /// earlier page of the same workspace. Returns the page and the carried tasks.
    @discardableResult
    mutating func createDiary(date: String, requestedWorkspaceId: String?, now: String) -> (DiaryRow, [TaskRow])? {
        if let existing = diaryEntry(date: date, workspaceId: requestedWorkspaceId) { return (existing, []) }
        let ws = requestedWorkspaceId ?? defaultWorkspaceId
        let id = DiaryIds.entryId(date: date, workspaceId: ws)
        if let existing = diary[id] { return (existing, []) }
        let entry = DiaryRow(id: id, workspaceId: ws, entryDate: date, createdAt: now)
        diary[id] = entry

        let previous = diary.values
            .filter { $0.entryDate < date && (ws == nil || $0.workspaceId == ws) }
            .max { ($0.entryDate, $0.createdAt) < ($1.entryDate, $1.createdAt) }
        var carried: [TaskRow] = []
        if let previous {
            for link in links.values where link.sourceType == "diary" && link.sourceId == previous.id && link.targetType == "task" {
                guard let task = tasks[link.targetId], !task.completed,
                      requestedWorkspaceId == nil || task.workspaceId == requestedWorkspaceId else { continue }
                if !hasLink("diary", id, "task", task.id, eitherDirection: false) {
                    let linkId = "local-link:\(id):\(task.id)"
                    links[linkId] = LinkRow(id: linkId, sourceType: "diary", sourceId: id, targetType: "task", targetId: task.id, createdAt: now)
                    carried.append(task)
                }
            }
        }
        return (entry, carried)
    }
}
