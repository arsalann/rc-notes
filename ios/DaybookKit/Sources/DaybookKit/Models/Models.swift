import Foundation

// Models mirror the JSON the Nitro API actually returns (see Tests/DaybookKitTests/Fixtures).
// Decoding uses `.convertFromSnakeCase` and is lenient: list endpoints return narrower rows than
// detail endpoints, so every non-identity field falls back to a default instead of failing.

extension KeyedDecodingContainer {
    func value<T: Decodable>(_ key: Key, default fallback: T) -> T {
        ((try? decodeIfPresent(T.self, forKey: key)) ?? nil) ?? fallback
    }

    func optional<T: Decodable>(_ key: Key) -> T? {
        (try? decodeIfPresent(T.self, forKey: key)) ?? nil
    }
}

public struct SessionUser: Codable, Equatable, Sendable {
    public var id: String
    public var username: String
    public var isAdmin: Bool

    public init(id: String, username: String, isAdmin: Bool) {
        self.id = id
        self.username = username
        self.isAdmin = isAdmin
    }
}

public struct AuthCheck: Decodable, Equatable, Sendable {
    public var configured: Bool
    public var user: SessionUser?
}

public struct AuthResponse: Decodable, Sendable {
    public var ok: Bool
    public var user: SessionUser
}

public struct Workspace: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var emoji: String
    public var position: Int

    public init(id: String, name: String, emoji: String, position: Int = 0) {
        self.id = id
        self.name = name
        self.emoji = emoji
        self.position = position
    }

    enum CodingKeys: String, CodingKey { case id, name, emoji, position }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = c.value(.name, default: "")
        emoji = c.value(.emoji, default: "")
        position = c.value(.position, default: 0)
    }

    /// "🏠 Personal"
    public var label: String { emoji.isEmpty ? name : "\(emoji) \(name)" }
}

public enum TagSource: String, Codable, Sendable { case manual, title, parent }

public struct ResolvedTag: Codable, Hashable, Sendable {
    public var key: String
    public var label: String
    public var emoji: String?
    public var sources: [TagSource]
    public var matchedTerms: [String]

    public init(key: String, label: String, emoji: String?, sources: [TagSource], matchedTerms: [String]) {
        self.key = key
        self.label = label
        self.emoji = emoji
        self.sources = sources
        self.matchedTerms = matchedTerms
    }
}

public enum TaskStatus: String, Codable, CaseIterable, Sendable {
    case next, now, done

    public var label: String {
        switch self {
        case .next: "Next"
        case .now: "Now"
        case .done: "Done"
        }
    }
}

public struct TaskItem: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var displayId: String
    public var workspaceId: String?
    public var parentId: String?
    public var title: String
    public var description: String
    public var status: TaskStatus
    public var priority: Int
    public var completed: Bool
    public var completedAt: String?
    public var pinned: Bool
    public var archived: Bool
    public var dueAt: String?
    public var tags: [String]
    public var position: Int
    public var createdAt: String
    public var updatedAt: String
    public var subtaskCount: Int
    public var subtaskDone: Int
    public var detectedTags: [ResolvedTag]
    public var resolvedTags: [ResolvedTag]
    public var subtasks: [TaskItem]?
    public var parentTitle: String?
    /// Set only by GET /api/tasks/outstanding.
    public var isOverdue: Bool?
    /// Client-only: an optimistic row whose create has not been confirmed yet.
    public var isPending: Bool = false

    enum CodingKeys: String, CodingKey {
        case id, displayId, workspaceId, parentId, title, description, status, priority, completed,
             completedAt, pinned, archived, dueAt, tags, position, createdAt, updatedAt, subtaskCount,
             subtaskDone, detectedTags, resolvedTags, subtasks, parentTitle, isOverdue
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayId = c.value(.displayId, default: "")
        workspaceId = c.optional(.workspaceId)
        parentId = c.optional(.parentId)
        title = c.value(.title, default: "")
        description = c.value(.description, default: "")
        completed = c.value(.completed, default: false)
        status = c.optional(.status) ?? (completed ? .done : .next)
        priority = c.value(.priority, default: 0)
        completedAt = c.optional(.completedAt)
        pinned = c.value(.pinned, default: false)
        archived = c.value(.archived, default: false)
        dueAt = c.optional(.dueAt)
        tags = c.value(.tags, default: [])
        position = c.value(.position, default: 0)
        createdAt = c.value(.createdAt, default: "")
        updatedAt = c.value(.updatedAt, default: "")
        subtaskCount = c.value(.subtaskCount, default: 0)
        subtaskDone = c.value(.subtaskDone, default: 0)
        detectedTags = c.value(.detectedTags, default: [])
        resolvedTags = c.value(.resolvedTags, default: [])
        subtasks = c.optional(.subtasks)
        parentTitle = c.optional(.parentTitle)
        isOverdue = c.optional(.isOverdue)
    }

    /// Optimistic placeholder painted before the server confirms a create.
    public init(pendingId id: String, title: String, priority: Int, status: TaskStatus, dueAt: String?, workspaceId: String?) {
        self.id = id
        displayId = ""
        self.workspaceId = workspaceId
        parentId = nil
        self.title = title
        description = ""
        self.status = status
        self.priority = priority
        completed = status == .done
        completedAt = nil
        pinned = false
        archived = false
        self.dueAt = dueAt
        tags = []
        position = Int.min
        createdAt = ""
        updatedAt = ""
        subtaskCount = 0
        subtaskDone = 0
        detectedTags = []
        resolvedTags = []
        subtasks = []
        parentTitle = nil
        isOverdue = nil
        isPending = true
    }

    /// Catalog tags that render as emoji (web `emojiTaskTags`).
    public var emojiTags: [ResolvedTag] { resolvedTags.filter { $0.emoji != nil } }

    /// Merge the fields a mutation endpoint returns without dropping hydrated extras
    /// (`subtasks`, counts) that the bare task row does not include.
    public func merged(with update: TaskItem) -> TaskItem {
        var next = update
        if next.subtasks == nil { next.subtasks = subtasks }
        if update.subtaskCount == 0 && update.subtaskDone == 0 {
            next.subtaskCount = subtaskCount
            next.subtaskDone = subtaskDone
        }
        if next.parentTitle == nil { next.parentTitle = parentTitle }
        return next
    }
}

public struct LinkItem: Decodable, Hashable, Sendable {
    public var linkId: String
    public var targetType: String
    public var targetId: String
    public var targetTitle: String

    public init(linkId: String = "", targetType: String, targetId: String, targetTitle: String) {
        self.linkId = linkId
        self.targetType = targetType
        self.targetId = targetId
        self.targetTitle = targetTitle
    }

    enum CodingKeys: String, CodingKey { case linkId, targetType, targetId, targetTitle }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        linkId = c.value(.linkId, default: "")
        targetType = c.value(.targetType, default: "")
        targetId = c.value(.targetId, default: "")
        targetTitle = c.value(.targetTitle, default: "")
    }
}

public struct CarriedTask: Decodable, Hashable, Sendable {
    public var id: String
    public var title: String
}

public struct DiaryEntry: Decodable, Identifiable, Equatable, Sendable {
    public var id: String
    public var workspaceId: String?
    /// YYYY-MM-DD
    public var entryDate: String
    public var content: String
    /// Concurrency token. Kept as the exact server string; never re-formatted.
    public var updatedAt: String
    public var links: [LinkItem]?
    public var tasks: [TaskItem]?
    public var carriedTasks: [CarriedTask]?
    public var preview: String?

    enum CodingKeys: String, CodingKey {
        case id, workspaceId, entryDate, content, updatedAt, links, tasks, carriedTasks, preview
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        workspaceId = c.optional(.workspaceId)
        entryDate = String(c.value(.entryDate, default: "").prefix(10))
        content = c.value(.content, default: "")
        updatedAt = try c.decode(String.self, forKey: .updatedAt)
        links = c.optional(.links)
        tasks = c.optional(.tasks)
        carriedTasks = c.optional(.carriedTasks)
        preview = c.optional(.preview)
    }

    public init(id: String, workspaceId: String?, entryDate: String, content: String, updatedAt: String,
                links: [LinkItem]? = nil, tasks: [TaskItem]? = nil, carriedTasks: [CarriedTask]? = nil) {
        self.id = id
        self.workspaceId = workspaceId
        self.entryDate = entryDate
        self.content = content
        self.updatedAt = updatedAt
        self.links = links
        self.tasks = tasks
        self.carriedTasks = carriedTasks
        preview = nil
    }
}

public struct GoalsEntry: Decodable, Equatable, Sendable {
    public var id: String
    public var weekStart: String
    public var content: String
    public var workspaceId: String?

    enum CodingKeys: String, CodingKey { case id, weekStart, content, workspaceId }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.value(.id, default: "")
        weekStart = String(c.value(.weekStart, default: "").prefix(10))
        content = c.value(.content, default: "")
        workspaceId = c.optional(.workspaceId)
    }
}

public struct Note: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var displayId: String
    public var workspaceId: String?
    public var title: String
    public var content: String
    public var preview: String
    public var pinned: Bool
    public var archived: Bool
    public var tags: [String]
    public var links: [LinkItem]
    public var createdAt: String
    public var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, displayId, workspaceId, title, content, preview, pinned, archived, tags, links, createdAt, updatedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayId = c.value(.displayId, default: "")
        workspaceId = c.optional(.workspaceId)
        title = c.value(.title, default: "")
        content = c.value(.content, default: "")
        preview = c.value(.preview, default: "")
        pinned = c.value(.pinned, default: false)
        archived = c.value(.archived, default: false)
        tags = c.value(.tags, default: [])
        links = c.value(.links, default: [])
        createdAt = c.value(.createdAt, default: "")
        updatedAt = c.value(.updatedAt, default: "")
    }
}

/// Row from GET /api/search.
public struct SearchResult: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var displayId: String
    public var type: String
    public var title: String
    public var detail: String
    public var completed: Bool
    public var dueAt: String?

    enum CodingKeys: String, CodingKey { case id, displayId, type, title, detail, completed, dueAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayId = c.value(.displayId, default: "")
        type = c.value(.type, default: "task")
        title = c.value(.title, default: "")
        detail = c.value(.detail, default: "")
        completed = c.value(.completed, default: false)
        dueAt = c.optional(.dueAt)
    }
}

/// Row from GET /api/mention.
public struct MentionResult: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var displayId: String
    public var type: String
    public var title: String
    public var completed: Bool

    enum CodingKeys: String, CodingKey { case id, displayId, type, title, completed }

    public init(id: String, displayId: String = "", type: String, title: String, completed: Bool = false) {
        self.id = id
        self.displayId = displayId
        self.type = type
        self.title = title
        self.completed = completed
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayId = c.value(.displayId, default: "")
        type = c.value(.type, default: "task")
        title = c.value(.title, default: "")
        completed = c.value(.completed, default: false)
    }
}

public struct CalendarDay: Decodable, Hashable, Sendable {
    public var date: String
    public var tasks: [TaskItem]
}

/// Row from GET /api/tasks/completed.
public struct CompletedTask: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var displayId: String
    public var title: String
    public var completedAt: String
    public var parentId: String?
    public var parentTaskId: String?
    public var parentDisplayId: String?
    public var parentTitle: String?

    enum CodingKeys: String, CodingKey {
        case id, displayId, title, completedAt, parentId, parentTaskId, parentDisplayId, parentTitle
    }

    public init(id: String, displayId: String, title: String, completedAt: String, parentId: String? = nil,
                parentTaskId: String? = nil, parentDisplayId: String? = nil, parentTitle: String? = nil) {
        self.id = id
        self.displayId = displayId
        self.title = title
        self.completedAt = completedAt
        self.parentId = parentId
        self.parentTaskId = parentTaskId
        self.parentDisplayId = parentDisplayId
        self.parentTitle = parentTitle
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayId = c.value(.displayId, default: "")
        title = c.value(.title, default: "")
        completedAt = c.value(.completedAt, default: "")
        parentId = c.optional(.parentId)
        parentTaskId = c.optional(.parentTaskId)
        parentDisplayId = c.optional(.parentDisplayId)
        parentTitle = c.optional(.parentTitle)
    }
}

public struct AdminUser: Decodable, Identifiable, Hashable, Sendable {
    public var id: String
    public var username: String
    public var isAdmin: Bool
    public var createdAt: String?
}

public struct PositionsResult: Decodable, Sendable {
    public var requested: Int
    public var updated: Int

    public init(requested: Int, updated: Int) {
        self.requested = requested
        self.updated = updated
    }
}
