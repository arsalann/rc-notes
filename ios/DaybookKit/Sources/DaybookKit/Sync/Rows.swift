import Foundation

// Raw rows of the synced tables, as `GET /api/sync/pull` returns them (and as mutation endpoints
// return them). The app keeps a local copy of these and builds every screen's models from it.
// Decoding is lenient like the API models; the same Codable shapes are used for the local file
// (camelCase keys there, snake_case from the server via `.convertFromSnakeCase`).

public protocol SyncRow: Codable, Hashable, Sendable {
    var id: String { get }
    var syncSeq: Int64 { get }
}

public struct WorkspaceRow: SyncRow {
    public var id: String
    public var name: String
    public var emoji: String
    public var description: String
    public var color: String?
    public var position: Int
    public var archived: Bool
    public var syncSeq: Int64

    public init(id: String, name: String, emoji: String = "", position: Int = 0) {
        self.id = id
        self.name = name
        self.emoji = emoji
        description = ""
        color = nil
        self.position = position
        archived = false
        syncSeq = 0
    }

    enum CodingKeys: String, CodingKey { case id, name, emoji, description, color, position, archived, syncSeq }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = c.value(.name, default: "")
        emoji = c.value(.emoji, default: "")
        description = c.value(.description, default: "")
        color = c.optional(.color)
        position = c.value(.position, default: 0)
        archived = c.value(.archived, default: false)
        syncSeq = c.value(.syncSeq, default: 0)
    }
}

public struct TaskRow: SyncRow {
    public var id: String
    public var displayId: String
    public var workspaceId: String?
    public var parentId: String?
    public var title: String
    public var description: String
    public var status: String
    public var priority: Int
    public var completed: Bool
    public var completedAt: String?
    public var pinned: Bool
    public var archived: Bool
    public var deletedAt: String?
    public var dueAt: String?
    public var tags: [String]
    public var position: Int
    public var createdAt: String
    public var updatedAt: String
    public var syncSeq: Int64

    public init(id: String, title: String, workspaceId: String? = nil, parentId: String? = nil, status: String = "next",
                priority: Int = 2, dueAt: String? = nil, tags: [String] = [], position: Int = 0, createdAt: String = "") {
        self.id = id
        displayId = ""
        self.workspaceId = workspaceId
        self.parentId = parentId
        self.title = title
        description = ""
        self.status = status
        self.priority = priority
        completed = false
        completedAt = nil
        pinned = false
        archived = false
        deletedAt = nil
        self.dueAt = dueAt
        self.tags = tags
        self.position = position
        self.createdAt = createdAt
        updatedAt = createdAt
        syncSeq = 0
    }

    enum CodingKeys: String, CodingKey {
        case id, displayId, workspaceId, parentId, title, description, status, priority, completed, completedAt,
             pinned, archived, deletedAt, dueAt, tags, position, createdAt, updatedAt, syncSeq
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
        status = c.optional(.status) ?? (completed ? "done" : "next")
        priority = c.value(.priority, default: 0)
        completedAt = c.optional(.completedAt)
        pinned = c.value(.pinned, default: false)
        archived = c.value(.archived, default: false)
        deletedAt = c.optional(.deletedAt)
        dueAt = c.optional(.dueAt)
        tags = c.value(.tags, default: [])
        position = c.value(.position, default: 0)
        createdAt = c.value(.createdAt, default: "")
        updatedAt = c.value(.updatedAt, default: "")
        syncSeq = c.value(.syncSeq, default: 0)
    }
}

public struct NoteRow: SyncRow {
    public var id: String
    public var displayId: String
    public var workspaceId: String?
    public var title: String
    public var content: String
    public var pinned: Bool
    public var archived: Bool
    public var deletedAt: String?
    public var tags: [String]
    public var createdAt: String
    public var updatedAt: String
    public var syncSeq: Int64

    public init(id: String, title: String, content: String = "", workspaceId: String? = nil, createdAt: String = "") {
        self.id = id
        displayId = ""
        self.workspaceId = workspaceId
        self.title = title
        self.content = content
        pinned = false
        archived = false
        deletedAt = nil
        tags = []
        self.createdAt = createdAt
        updatedAt = createdAt
        syncSeq = 0
    }

    enum CodingKeys: String, CodingKey {
        case id, displayId, workspaceId, title, content, pinned, archived, deletedAt, tags, createdAt, updatedAt, syncSeq
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayId = c.value(.displayId, default: "")
        workspaceId = c.optional(.workspaceId)
        title = c.value(.title, default: "")
        content = c.value(.content, default: "")
        pinned = c.value(.pinned, default: false)
        archived = c.value(.archived, default: false)
        deletedAt = c.optional(.deletedAt)
        tags = c.value(.tags, default: [])
        createdAt = c.value(.createdAt, default: "")
        updatedAt = c.value(.updatedAt, default: "")
        syncSeq = c.value(.syncSeq, default: 0)
    }
}

public struct LinkRow: SyncRow {
    public var id: String
    public var sourceType: String
    public var sourceId: String
    public var targetType: String
    public var targetId: String
    public var createdAt: String
    public var syncSeq: Int64

    public init(id: String, sourceType: String, sourceId: String, targetType: String, targetId: String, createdAt: String = "") {
        self.id = id
        self.sourceType = sourceType
        self.sourceId = sourceId
        self.targetType = targetType
        self.targetId = targetId
        self.createdAt = createdAt
        syncSeq = 0
    }

    enum CodingKeys: String, CodingKey { case id, sourceType, sourceId, targetType, targetId, createdAt, syncSeq }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        sourceType = c.value(.sourceType, default: "")
        sourceId = c.value(.sourceId, default: "")
        targetType = c.value(.targetType, default: "")
        targetId = c.value(.targetId, default: "")
        createdAt = c.value(.createdAt, default: "")
        syncSeq = c.value(.syncSeq, default: 0)
    }
}

public struct DiaryRow: SyncRow {
    public var id: String
    public var workspaceId: String?
    /// YYYY-MM-DD
    public var entryDate: String
    public var content: String
    public var deletedAt: String?
    public var createdAt: String
    /// The journal's compare-and-swap token: kept exactly as the server wrote it.
    public var updatedAt: String
    public var syncSeq: Int64

    public init(id: String, workspaceId: String?, entryDate: String, content: String = "", createdAt: String = "") {
        self.id = id
        self.workspaceId = workspaceId
        self.entryDate = entryDate
        self.content = content
        deletedAt = nil
        self.createdAt = createdAt
        updatedAt = createdAt
        syncSeq = 0
    }

    enum CodingKeys: String, CodingKey { case id, workspaceId, entryDate, content, deletedAt, createdAt, updatedAt, syncSeq }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        workspaceId = c.optional(.workspaceId)
        entryDate = String(c.value(.entryDate, default: "").prefix(10))
        content = c.value(.content, default: "")
        deletedAt = c.optional(.deletedAt)
        createdAt = c.value(.createdAt, default: "")
        updatedAt = c.value(.updatedAt, default: "")
        syncSeq = c.value(.syncSeq, default: 0)
    }
}

public struct GoalsRow: SyncRow {
    public var id: String
    public var workspaceId: String?
    /// The week's Sunday, YYYY-MM-DD.
    public var weekStart: String
    public var content: String
    public var createdAt: String
    public var updatedAt: String
    public var syncSeq: Int64

    public init(id: String, workspaceId: String?, weekStart: String, content: String, createdAt: String = "") {
        self.id = id
        self.workspaceId = workspaceId
        self.weekStart = weekStart
        self.content = content
        self.createdAt = createdAt
        updatedAt = createdAt
        syncSeq = 0
    }

    enum CodingKeys: String, CodingKey { case id, workspaceId, weekStart, content, createdAt, updatedAt, syncSeq }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        workspaceId = c.optional(.workspaceId)
        weekStart = String(c.value(.weekStart, default: "").prefix(10))
        content = c.value(.content, default: "")
        createdAt = c.value(.createdAt, default: "")
        updatedAt = c.value(.updatedAt, default: "")
        syncSeq = c.value(.syncSeq, default: 0)
    }
}
