import Foundation

// Task templates and tag settings (web PR #53). Neither is a synced table: both are read and written
// online through `APIClient`, like users and workspaces. Creating tasks from a template goes through
// `Repository` (queued, works offline).

/// One subtask of a template. `priority` nil = same as the task.
public struct TemplateSubtask: Codable, Hashable, Sendable {
    public var title: String
    public var description: String
    public var priority: Int?
    public var tags: [String]

    public init(title: String, description: String = "", priority: Int? = nil, tags: [String] = []) {
        self.title = title
        self.description = description
        self.priority = priority
        self.tags = tags
    }

    enum CodingKeys: String, CodingKey { case title, description, priority, tags }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = c.value(.title, default: "")
        description = c.value(.description, default: "")
        priority = c.optional(.priority)
        tags = c.value(.tags, default: [])
    }

    var json: JSONValue {
        .object(["title": .string(title), "description": .string(description),
                 "priority": priority.map(JSONValue.int) ?? .null, "tags": .strings(tags)])
    }
}

/// A row of `GET /api/templates`.
public struct TaskTemplate: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var workspaceId: String?
    public var name: String
    public var title: String
    public var description: String
    public var priority: Int
    public var tags: [String]
    public var subtasks: [TemplateSubtask]
    public var position: Int

    public init(id: String, workspaceId: String? = nil, name: String, title: String, description: String = "",
                priority: Int = 2, tags: [String] = [], subtasks: [TemplateSubtask] = [], position: Int = 0) {
        self.id = id
        self.workspaceId = workspaceId
        self.name = name
        self.title = title
        self.description = description
        self.priority = priority
        self.tags = tags
        self.subtasks = subtasks
        self.position = position
    }

    enum CodingKeys: String, CodingKey { case id, workspaceId, name, title, description, priority, tags, subtasks, position }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        workspaceId = c.optional(.workspaceId)
        name = c.value(.name, default: "")
        title = c.value(.title, default: "")
        description = c.value(.description, default: "")
        priority = c.value(.priority, default: 2)
        tags = c.value(.tags, default: [])
        subtasks = c.value(.subtasks, default: [])
        position = c.value(.position, default: 0)
    }

    /// The body for `POST /api/templates` / `PUT /api/templates/:id`.
    public var body: JSONObject {
        ["name": .string(name), "title": .string(title), "description": .string(description), "priority": .int(priority),
         "tags": .strings(tags), "subtasks": .array(subtasks.map(\.json)), "workspace_id": .optional(workspaceId)]
    }

    /// "Save as template": the task and its non-archived subtasks. A subtask whose priority equals the
    /// task's is stored as "same as the task", so changing the template's priority carries over.
    public static func from(task: TaskItem, subtasks: [TaskItem], name: String) -> TaskTemplate {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return TaskTemplate(
            id: UUID().uuidString.lowercased(), workspaceId: task.workspaceId, name: trimmed.isEmpty ? task.title : trimmed,
            title: task.title, description: task.description, priority: task.priority, tags: task.tags,
            subtasks: subtasks.filter { !$0.archived }.map {
                TemplateSubtask(title: $0.title, description: $0.description, priority: $0.priority == task.priority ? nil : $0.priority, tags: $0.tags)
            })
    }
}

/// A row of `GET /api/tags`.
public struct TagSummary: Codable, Identifiable, Hashable, Sendable {
    public var key: String
    /// Shown name: the override, else the catalog label or the most used spelling.
    public var label: String
    /// Catalog label or most used spelling, without the override.
    public var name: String
    public var emoji: String?
    public var builtin: Bool
    public var archived: Bool
    public var taskCount: Int
    public var noteCount: Int
    public var variants: [String]
    public var labelOverride: String?
    public var emojiOverride: String?

    public var id: String { key }

    public init(key: String, label: String, name: String? = nil, emoji: String? = nil, builtin: Bool = false, archived: Bool = false,
                taskCount: Int = 0, noteCount: Int = 0, variants: [String] = [], labelOverride: String? = nil, emojiOverride: String? = nil) {
        self.key = key
        self.label = label
        self.name = name ?? label
        self.emoji = emoji
        self.builtin = builtin
        self.archived = archived
        self.taskCount = taskCount
        self.noteCount = noteCount
        self.variants = variants
        self.labelOverride = labelOverride
        self.emojiOverride = emojiOverride
    }

    enum CodingKeys: String, CodingKey {
        case key, label, name, emoji, builtin, archived, taskCount, noteCount, variants, labelOverride, emojiOverride
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        label = c.value(.label, default: key)
        name = c.value(.name, default: label)
        emoji = c.optional(.emoji)
        builtin = c.value(.builtin, default: false)
        archived = c.value(.archived, default: false)
        taskCount = c.value(.taskCount, default: 0)
        noteCount = c.value(.noteCount, default: 0)
        variants = c.value(.variants, default: [])
        labelOverride = c.optional(.labelOverride)
        emojiOverride = c.optional(.emojiOverride)
    }

    /// "3 tasks, 1 note"
    public var usage: String {
        var parts = ["\(taskCount) task\(taskCount == 1 ? "" : "s")"]
        if noteCount > 0 { parts.append("\(noteCount) note\(noteCount == 1 ? "" : "s")") }
        return parts.joined(separator: ", ")
    }
}

public struct TagRenameResult: Decodable, Equatable, Sendable {
    public var key: String
    public var to: String
    public var tasks: Int
    public var notes: Int
}

/// Settings → Tags, applied where tags render: label/emoji overrides and archived (hidden from pickers).
public struct TagOverrides: Equatable, Sendable {
    public var tags: [TagSummary]
    private var byKey: [String: TagSummary]

    public init(_ tags: [TagSummary] = []) {
        self.tags = tags
        byKey = Dictionary(tags.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
    }

    public subscript(key: String) -> TagSummary? { byKey[key] }

    /// The tag with the Settings label/emoji applied.
    public func present(_ tag: ResolvedTag) -> ResolvedTag {
        guard let s = byKey[tag.key] else { return tag }
        var out = tag
        if let label = s.labelOverride, !label.isEmpty { out.label = label }
        if let emoji = s.emojiOverride { out.emoji = emoji.isEmpty ? nil : emoji }
        return out
    }

    public func present(_ tags: [ResolvedTag]) -> [ResolvedTag] { tags.map(present) }

    /// `raw` is a stored tag or a key.
    public func isArchived(_ raw: String) -> Bool {
        let key = byKey[raw] != nil ? raw : TaskTags.manualKey(raw)
        return key.flatMap { byKey[$0]?.archived } ?? false
    }

    /// What the tag picker offers: built-in tags, then custom tags in use, without archived ones unless
    /// `selected` already has them (so they can be removed). Without settings: the built-in catalog.
    public func pickerOptions(selected: [String]) -> [TagPickerOption] {
        guard !tags.isEmpty else {
            return TaskTags.catalog.map { TagPickerOption(key: $0.key, label: $0.label, emoji: $0.emoji, value: $0.key) }
        }
        let selectedKeys = Set(selected.compactMap(TaskTags.manualKey))
        return tags.filter { !$0.archived || selectedKeys.contains($0.key) }
            .map { TagPickerOption(key: $0.key, label: $0.label, emoji: $0.emoji, value: $0.builtin ? $0.key : $0.name) }
    }
}

public struct TagPickerOption: Identifiable, Hashable, Sendable {
    public var key: String
    public var label: String
    public var emoji: String?
    /// What gets stored in `tags` when picked.
    public var value: String
    public var id: String { key }
}

extension TaskTags {
    /// The key a stored manual tag resolves to (`manualTaskTagKey` on the web): a catalog key, or
    /// `manual:<normalized>` so spellings that differ only in case or punctuation share a key.
    public static func manualKey(_ raw: String?) -> String? {
        let normalized = normalize(raw)
        guard !normalized.isEmpty else { return nil }
        return aliasToKey[normalized] ?? "manual:\(normalized)"
    }

    public static func isBuiltIn(_ key: String) -> Bool { byKey[key] != nil }

    /// Picker toggle for any tag (built-in or custom): removes every spelling of it, or adds `option.value`.
    public static func toggle(_ option: TagPickerOption, in tags: [String]) -> [String] {
        tags.contains { manualKey($0) == option.key } ? tags.filter { manualKey($0) != option.key } : tags + [option.value]
    }
}

// MARK: - API

extension APIClient {
    public func templates() async throws -> [TaskTemplate] { try await send("GET", "/api/templates") }

    public func createTemplate(_ template: TaskTemplate) async throws -> TaskTemplate {
        var body = template.body
        body["id"] = .string(template.id)
        return try await send("POST", "/api/templates", body: body)
    }

    public func updateTemplate(_ template: TaskTemplate) async throws -> TaskTemplate {
        try await send("PUT", "/api/templates/\(template.id)", body: template.body)
    }

    public func deleteTemplate(id: String) async throws { try await sendIgnoringResult("DELETE", "/api/templates/\(id)") }

    public func tags() async throws -> [TagSummary] { try await send("GET", "/api/tags") }

    /// Display overrides; `label: ""` / `emoji: .null` remove that override. Nothing on tasks changes.
    public func updateTag(key: String, label: JSONValue? = nil, emoji: JSONValue? = nil, archived: Bool? = nil) async throws {
        var body: JSONObject = ["key": .string(key)]
        if let label { body["label"] = label }
        if let emoji { body["emoji"] = emoji }
        if let archived { body["archived"] = .bool(archived) }
        try await sendIgnoringResult("PUT", "/api/tags", body: body)
    }

    /// Renames a custom tag on every task and note (merges into an existing tag of that name).
    public func renameTag(key: String, to: String) async throws -> TagRenameResult {
        try await send("POST", "/api/tags/rename", body: ["key": .string(key), "to": .string(to)])
    }
}

extension Repository {
    /// Creates the template's task, then each subtask in order, through the queue (works offline).
    @discardableResult
    public func createTasks(from template: TaskTemplate, workspaceId: String?, dueAt: String? = nil, status: TaskStatus? = nil) async throws -> TaskItem {
        let task = try await createTask(NewTask(
            id: UUID().uuidString.lowercased(), title: template.title.isEmpty ? template.name : template.title,
            description: template.description.isEmpty ? nil : template.description, workspaceId: workspaceId,
            tags: template.tags.isEmpty ? nil : template.tags, dueAt: dueAt, priority: template.priority, status: status))
        for sub in template.subtasks where !sub.title.trimmingCharacters(in: .whitespaces).isEmpty {
            try await createTask(NewTask(
                id: UUID().uuidString.lowercased(), title: sub.title, description: sub.description.isEmpty ? nil : sub.description,
                parentId: task.id, workspaceId: workspaceId, tags: sub.tags.isEmpty ? nil : sub.tags, priority: sub.priority))
        }
        return try await self.task(id: task.id)
    }
}
