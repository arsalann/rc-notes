import Foundation

/// One change made on the phone. It is applied to the local copy at once (`LocalData.apply`) and
/// queued; `POST /api/sync/push` later replays it through the same endpoint the app used to call
/// directly (`request`), so the server keeps its own rules.
public enum Mutation: Codable, Hashable, Sendable {
    case createTask(NewTaskInput)
    /// Partial update; `.null` clears (`due_at`, `workspace_id`, `parent_id`).
    case updateTask(id: String, patch: JSONObject)
    case setTaskCompleted(id: String, completed: Bool)
    case setTaskPinned(id: String, pinned: Bool)
    /// Archives the task and its subtasks.
    case archiveTask(id: String)
    case setTaskPositions([PositionInput])
    case tasksFromChecklist(items: [ChecklistInput], sourceType: String, sourceId: String, workspaceId: String?, dueDate: String?)
    case createNote(id: String, title: String, content: String, workspaceId: String?)
    case updateNote(id: String, patch: JSONObject)
    case createLink(id: String, sourceType: String, sourceId: String, targetType: String, targetId: String)
    /// Get-or-create a day page. `workspaceId` is the filter the person had (nil = All).
    case createDiary(date: String, workspaceId: String?)
    /// Journal save, compare-and-swap against `base` (the server revision the writing started from).
    /// `base` is nil while the page itself is still waiting to be created on the server.
    case saveDiary(entryId: String, date: String, workspaceId: String?, content: String, base: String?)
    /// Opening a day page: the server links the tasks due that day.
    case visitDiary(date: String, workspaceId: String?)
    case saveGoals(weekStart: String, workspaceId: String?, content: String)

    public struct NewTaskInput: Codable, Hashable, Sendable {
        public var id: String
        public var title: String
        public var description: String?
        public var parentId: String?
        public var workspaceId: String?
        public var tags: [String]?
        public var dueAt: String?
        public var priority: Int?
        public var status: String?
    }

    public struct PositionInput: Codable, Hashable, Sendable {
        public var id: String
        public var position: Int
        public var priority: Int?
    }

    public struct ChecklistInput: Codable, Hashable, Sendable {
        public var id: String
        public var title: String
        public var checked: Bool
        public var tags: [String]?
        public var priority: Int?
        public var status: String?
        public var dueAt: String?
        public var children: [ChecklistInput]
    }

    public struct Request: Equatable, Sendable {
        public var method: String
        public var path: String
        public var body: JSONValue?
    }

    public var request: Request {
        switch self {
        case .createTask(let t):
            var body: JSONObject = ["id": .string(t.id), "title": .string(t.title)]
            if let v = t.description { body["description"] = .string(v) }
            if let v = t.parentId { body["parent_id"] = .string(v) }
            if let v = t.workspaceId { body["workspace_id"] = .string(v) }
            if let v = t.tags, !v.isEmpty { body["tags"] = .strings(v) }
            if let v = t.dueAt { body["due_at"] = .string(v) }
            if let v = t.priority { body["priority"] = .int(v) }
            if let v = t.status { body["status"] = .string(v) }
            return Request(method: "POST", path: "/api/tasks", body: .object(body))
        case .updateTask(let id, let patch):
            return Request(method: "PUT", path: "/api/tasks/\(id)", body: .object(patch))
        case .setTaskCompleted(let id, let completed):
            return Request(method: "PATCH", path: "/api/tasks/\(id)/complete", body: .object(["completed": .bool(completed)]))
        case .setTaskPinned(let id, let pinned):
            return Request(method: "PATCH", path: "/api/tasks/\(id)/pin", body: .object(["pinned": .bool(pinned)]))
        case .archiveTask(let id):
            return Request(method: "DELETE", path: "/api/tasks/\(id)", body: nil)
        case .setTaskPositions(let items):
            let array: [JSONValue] = items.map { item in
                var object: JSONObject = ["id": .string(item.id), "position": .int(item.position)]
                if let p = item.priority { object["priority"] = .int(p) }
                return .object(object)
            }
            return Request(method: "PATCH", path: "/api/tasks/positions", body: .object(["items": .array(array)]))
        case .tasksFromChecklist(let items, let sourceType, let sourceId, let workspaceId, let dueDate):
            var body: JSONObject = [
                "items": .array(items.map(\.json)),
                "source_type": .string(sourceType),
                "source_id": .string(sourceId),
                "workspace_id": .optional(workspaceId),
            ]
            if let dueDate { body["due_date"] = .string(dueDate) }
            return Request(method: "POST", path: "/api/tasks/from-checklist", body: .object(body))
        case .createNote(let id, let title, let content, let workspaceId):
            var body: JSONObject = ["id": .string(id), "title": .string(title), "content": .string(content)]
            if let workspaceId { body["workspace_id"] = .string(workspaceId) }
            return Request(method: "POST", path: "/api/notes", body: .object(body))
        case .updateNote(let id, let patch):
            return Request(method: "PUT", path: "/api/notes/\(id)", body: .object(patch))
        case .createLink(let id, let sourceType, let sourceId, let targetType, let targetId):
            return Request(method: "POST", path: "/api/links", body: .object([
                "id": .string(id), "source_type": .string(sourceType), "source_id": .string(sourceId),
                "target_type": .string(targetType), "target_id": .string(targetId),
            ]))
        case .createDiary(let date, let workspaceId):
            return Request(method: "POST", path: "/api/diary", body: .object(["entry_date": .string(date), "workspace_id": .optional(workspaceId)]))
        case .saveDiary(let entryId, let date, let workspaceId, let content, let base):
            return Request(method: "PUT", path: "/api/diary/\(date)", body: .object([
                "entry_id": .string(entryId),
                "content": .string(content),
                "workspace_id": .optional(workspaceId),
                "expected_updated_at": .optional(base),
            ]))
        case .visitDiary(let date, let workspaceId):
            let query = workspaceId.map { "?workspace_id=\($0)" } ?? ""
            return Request(method: "GET", path: "/api/diary/\(date)\(query)", body: nil)
        case .saveGoals(let weekStart, let workspaceId, let content):
            return Request(method: "PUT", path: "/api/goals/\(weekStart)", body: .object(["content": .string(content), "workspace_id": .optional(workspaceId)]))
        }
    }

    /// Short description for the sync status screen and error messages.
    public var summary: String {
        switch self {
        case .createTask(let t): "New task “\(t.title)”"
        case .updateTask: "Task edit"
        case .setTaskCompleted(_, let done): done ? "Task completed" : "Task reopened"
        case .setTaskPinned: "Task pin"
        case .archiveTask: "Task archived"
        case .setTaskPositions: "Task order"
        case .tasksFromChecklist: "Checklist to tasks"
        case .createNote(_, let title, _, _): "New note “\(title)”"
        case .updateNote: "Note edit"
        case .createLink: "Link"
        case .createDiary(let date, _): "Day page \(date)"
        case .saveDiary(_, let date, _, _, _): "Journal \(date)"
        case .visitDiary: "Day page visit"
        case .saveGoals: "Weekly goals"
        }
    }
}

extension Mutation.ChecklistInput {
    var json: JSONValue {
        var object: JSONObject = ["id": .string(id), "title": .string(title), "checked": .bool(checked), "children": .array(children.map(\.json))]
        if let tags { object["tags"] = .strings(tags) }
        if let priority { object["priority"] = .int(priority) }
        if let status { object["status"] = .string(status) }
        if let dueAt { object["due_at"] = .string(dueAt) }
        return .object(object)
    }
}

/// A queued change. `clientTime` is when it was made: it orders the edit against edits from other
/// devices (the server keeps the newest per field) and stamps the local copy.
public struct PendingOp: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var clientTime: Date
    public var mutation: Mutation
    /// Delivery attempts that failed with a server or network error.
    public var attempts: Int

    public init(id: String = UUID().uuidString.lowercased(), clientTime: Date, mutation: Mutation) {
        self.id = id
        self.clientTime = clientTime
        self.mutation = mutation
        attempts = 0
    }
}
