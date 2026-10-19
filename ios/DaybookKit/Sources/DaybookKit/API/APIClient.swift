import Foundation

public enum APIError: Error, LocalizedError, Equatable, Sendable {
    case http(status: Int, message: String)
    case transport(String)
    case decoding(String)
    case invalidURL

    public var status: Int? {
        if case .http(let status, _) = self { return status }
        return nil
    }

    public var errorDescription: String? {
        switch self {
        case .http(let status, let message): message.isEmpty ? "Server error \(status)" : message
        case .transport(let message): message
        case .decoding(let message): "Unexpected server response (\(message))"
        case .invalidURL: "Invalid server address"
        }
    }
}

/// Thin async client over the Nitro API. Authentication is the `rc-session` cookie, kept in
/// `HTTPCookieStorage` so it survives relaunches. No `Origin` header is sent, which the server's
/// CSRF check allows.
public final class APIClient: Sendable {
    public static let userAgent = "daybook-ios/1.0"

    public let baseURL: URL
    private let session: URLSession
    private let onUnauthorized: @Sendable () -> Void

    /// `deviceId` goes out as `X-Daybook-Device` on every request, so the server can record which
    /// device made each change (`updated_device_id` columns, `event_log.device_id`).
    public init(baseURL: URL, cookieStorage: HTTPCookieStorage = .shared, userAgent: String = APIClient.userAgent,
                deviceId: String? = nil, onUnauthorized: @escaping @Sendable () -> Void = {}) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = cookieStorage
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.timeoutIntervalForRequest = 30
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        var headers: [String: String] = ["User-Agent": userAgent, "Accept": "application/json"]
        if let deviceId { headers["X-Daybook-Device"] = deviceId }
        config.httpAdditionalHeaders = headers
        session = URLSession(configuration: config)
        self.onUnauthorized = onUnauthorized
    }

    /// Normalizes what a person types ("192.168.1.20:3000", "http://mac.local:3000/") into a base URL.
    public static func normalizeServerURL(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") { text = "http://" + text }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https", url.host != nil else { return nil }
        return url
    }

    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    // MARK: Core

    func makeRequest(_ method: String, _ path: String, query: [String: String?] = [:], body: JSONObject? = nil) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        let items = query.compactMap { key, value in value.map { URLQueryItem(name: key, value: $0) } }
            .sorted { $0.name < $1.name }
        if !items.isEmpty { components.queryItems = items }
        guard let url = components.url else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        return request
    }

    func data(_ method: String, _ path: String, query: [String: String?] = [:], body: JSONObject? = nil) async throws -> Data {
        let request = try makeRequest(method, path, query: query, body: body)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.transport("No HTTP response") }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                .flatMap { $0["statusMessage"] as? String ?? $0["message"] as? String } ?? ""
            if http.statusCode == 401 && !path.hasPrefix("/api/auth/") && !path.hasPrefix("/api/setup") {
                onUnauthorized()
            }
            throw APIError.http(status: http.statusCode, message: message)
        }
        return data
    }

    func send<T: Decodable>(_ method: String, _ path: String, query: [String: String?] = [:], body: JSONObject? = nil, as type: T.Type = T.self) async throws -> T {
        let raw = try await data(method, path, query: query, body: body)
        do {
            return try Self.decoder.decode(T.self, from: raw)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    func sendIgnoringResult(_ method: String, _ path: String, query: [String: String?] = [:], body: JSONObject? = nil) async throws {
        _ = try await data(method, path, query: query, body: body)
    }
}

private func ws(_ workspaceId: String?) -> [String: String?] { ["workspace_id": workspaceId] }

// MARK: - Auth & setup

public struct SetupStatus: Decodable, Sendable { public var configured: Bool }

extension APIClient {
    public func setupStatus() async throws -> SetupStatus { try await send("GET", "/api/setup/status") }
    public func authCheck() async throws -> AuthCheck { try await send("GET", "/api/auth/check") }

    public func login(username: String, password: String) async throws -> SessionUser {
        let res: AuthResponse = try await send("POST", "/api/auth/login", body: ["username": .string(username), "password": .string(password)])
        return res.user
    }

    public func signup(username: String, password: String) async throws -> SessionUser {
        let res: AuthResponse = try await send("POST", "/api/auth/signup", body: ["username": .string(username), "password": .string(password)])
        return res.user
    }

    public func setup(username: String, password: String) async throws -> SessionUser {
        let res: AuthResponse = try await send("POST", "/api/setup", body: ["username": .string(username), "password": .string(password)])
        return res.user
    }

    public func logout() async throws { try await sendIgnoringResult("POST", "/api/auth/logout") }

    public func changePassword(current: String, new: String) async throws {
        try await sendIgnoringResult("PUT", "/api/auth/password", body: ["current_password": .string(current), "new_password": .string(new)])
    }
}

// MARK: - Workspaces & users

extension APIClient {
    public func workspaces() async throws -> [Workspace] { try await send("GET", "/api/workspaces") }

    public func createWorkspace(name: String, emoji: String) async throws -> Workspace {
        try await send("POST", "/api/workspaces", body: ["name": .string(name), "emoji": .string(emoji)])
    }

    public func users() async throws -> [AdminUser] { try await send("GET", "/api/users") }

    public func createUser(username: String, password: String) async throws {
        try await sendIgnoringResult("POST", "/api/users", body: ["username": .string(username), "password": .string(password)])
    }

    public func deleteUser(id: String) async throws { try await sendIgnoringResult("DELETE", "/api/users/\(id)") }
}

// MARK: - Tasks

public struct NewTask: Sendable {
    public var id: String?
    public var title: String
    public var description: String?
    public var parentId: String?
    public var workspaceId: String?
    public var tags: [String]?
    public var dueAt: String?
    public var priority: Int?
    public var status: TaskStatus?

    public init(id: String? = nil, title: String, description: String? = nil, parentId: String? = nil, workspaceId: String? = nil,
                tags: [String]? = nil, dueAt: String? = nil, priority: Int? = nil, status: TaskStatus? = nil) {
        self.id = id
        self.title = title
        self.description = description
        self.parentId = parentId
        self.workspaceId = workspaceId
        self.tags = tags
        self.dueAt = dueAt
        self.priority = priority
        self.status = status
    }

    var body: JSONObject {
        var body: JSONObject = ["title": .string(title)]
        if let id { body["id"] = .string(id) }
        if let description { body["description"] = .string(description) }
        if let parentId { body["parent_id"] = .string(parentId) }
        if let workspaceId { body["workspace_id"] = .string(workspaceId) }
        if let tags, !tags.isEmpty { body["tags"] = .strings(tags) }
        if let dueAt { body["due_at"] = .string(dueAt) }
        if let priority { body["priority"] = .int(priority) }
        if let status { body["status"] = .string(status.rawValue) }
        return body
    }
}

public struct ChecklistTaskInput: Sendable, Equatable {
    public var title: String
    public var checked: Bool
    public var tags: [String]?
    public var priority: Int?
    public var status: TaskStatus?
    public var dueAt: String?
    public var children: [ChecklistTaskInput]

    public init(title: String, checked: Bool, tags: [String]? = nil, priority: Int? = nil, status: TaskStatus? = nil,
                dueAt: String? = nil, children: [ChecklistTaskInput] = []) {
        self.title = title
        self.checked = checked
        self.tags = tags
        self.priority = priority
        self.status = status
        self.dueAt = dueAt
        self.children = children
    }

    var json: JSONValue {
        var object: JSONObject = ["title": .string(title), "checked": .bool(checked), "children": .array(children.map(\.json))]
        if let tags { object["tags"] = .strings(tags) }
        if let priority { object["priority"] = .int(priority) }
        if let status { object["status"] = .string(status.rawValue) }
        if let dueAt { object["due_at"] = .string(dueAt) }
        return .object(object)
    }
}

extension APIClient {
    public func tasks(workspaceId: String?, archived: Bool) async throws -> [TaskItem] {
        var query = ws(workspaceId)
        query["archived"] = archived ? "true" : "false"
        return try await send("GET", "/api/tasks", query: query)
    }

    public func task(id: String) async throws -> TaskItem { try await send("GET", "/api/tasks/\(id)") }

    public func tasksBatch(ids: [String]) async throws -> [TaskItem] {
        guard !ids.isEmpty else { return [] }
        return try await send("GET", "/api/tasks/batch", query: ["ids": ids.joined(separator: ",")])
    }

    public func createTask(_ task: NewTask) async throws -> TaskItem {
        try await send("POST", "/api/tasks", body: task.body)
    }

    /// Partial update. Pass `.null` to clear (`due_at`, `workspace_id`, `parent_id`).
    public func updateTask(id: String, _ patch: JSONObject) async throws -> TaskItem {
        try await send("PUT", "/api/tasks/\(id)", body: patch)
    }

    /// Archives the task and its subtasks.
    public func archiveTask(id: String) async throws -> TaskItem { try await send("DELETE", "/api/tasks/\(id)") }

    public func setTaskCompleted(id: String, _ completed: Bool) async throws -> TaskItem {
        try await send("PATCH", "/api/tasks/\(id)/complete", body: ["completed": .bool(completed)])
    }

    public func setTaskPinned(id: String, _ pinned: Bool) async throws -> TaskItem {
        try await send("PATCH", "/api/tasks/\(id)/pin", body: ["pinned": .bool(pinned)])
    }

    /// Toggles archived (used for restore from the archive).
    public func toggleTaskArchived(id: String) async throws -> TaskItem { try await send("PATCH", "/api/tasks/\(id)/archive") }

    public struct PositionItem: Sendable, Equatable {
        public var id: String
        public var position: Int
        public var priority: Int?
        public init(id: String, position: Int, priority: Int? = nil) {
            self.id = id
            self.position = position
            self.priority = priority
        }
    }

    @discardableResult
    public func updateTaskPositions(_ items: [PositionItem]) async throws -> PositionsResult {
        let array: [JSONValue] = items.map { item in
            var object: JSONObject = ["id": .string(item.id), "position": .int(item.position)]
            if let priority = item.priority { object["priority"] = .int(priority) }
            return .object(object)
        }
        return try await send("PATCH", "/api/tasks/positions", body: ["items": .array(array)])
    }

    public func completedTasks(from: String, to: String, workspaceId: String?) async throws -> [CompletedTask] {
        var query = ws(workspaceId)
        query["from"] = from
        query["to"] = to
        return try await send("GET", "/api/tasks/completed", query: query)
    }

    public func outstandingTasks(workspaceId: String?) async throws -> [TaskItem] {
        try await send("GET", "/api/tasks/outstanding", query: ws(workspaceId))
    }

    @discardableResult
    public func tasksFromChecklist(items: [ChecklistTaskInput], sourceType: String, sourceId: String, workspaceId: String?, dueDate: String?) async throws -> [TaskItem] {
        var body: JSONObject = [
            "items": .array(items.map(\.json)),
            "source_type": .string(sourceType),
            "source_id": .string(sourceId),
            "workspace_id": .optional(workspaceId),
        ]
        if let dueDate { body["due_date"] = .string(dueDate) }
        return try await send("POST", "/api/tasks/from-checklist", body: body)
    }

    public func taskLinks(id: String) async throws -> [LinkItem] { try await send("GET", "/api/task-links/\(id)") }

    public func calendar(workspaceId: String?) async throws -> [CalendarDay] {
        try await send("GET", "/api/calendar", query: ws(workspaceId))
    }
}

// MARK: - Diary & goals

extension APIClient {
    /// nil when the date has no entry yet (404).
    public func diaryEntry(date: String, workspaceId: String?) async throws -> DiaryEntry? {
        do {
            return try await send("GET", "/api/diary/\(date)", query: ws(workspaceId))
        } catch let error as APIError where error.status == 404 {
            return nil
        }
    }

    /// Get-or-create; carries unfinished tasks forward into a new page.
    public func createDiaryEntry(date: String, workspaceId: String?) async throws -> DiaryEntry {
        try await send("POST", "/api/diary", body: ["entry_date": .string(date), "workspace_id": .optional(workspaceId)])
    }

    /// Compare-and-swap save bound to an exact entry identity.
    public func saveDiaryEntry(date: String, entryId: String, workspaceId: String?, content: String, expectedUpdatedAt: String) async throws -> DiaryEntry {
        try await send("PUT", "/api/diary/\(date)", body: [
            "entry_id": .string(entryId),
            "content": .string(content),
            "workspace_id": .optional(workspaceId),
            "expected_updated_at": .string(expectedUpdatedAt),
        ])
    }

    public func diaryList(workspaceId: String?) async throws -> [DiaryEntry] {
        try await send("GET", "/api/diary", query: ws(workspaceId))
    }

    public func diaryDates(from: String, to: String, workspaceId: String?) async throws -> [String] {
        var query = ws(workspaceId)
        query["from"] = from
        query["to"] = to
        return try await send("GET", "/api/diary/dates", query: query)
    }

    public func goals(weekStart: String, workspaceId: String?) async throws -> GoalsEntry {
        try await send("GET", "/api/goals/\(weekStart)", query: ws(workspaceId))
    }

    public func saveGoals(weekStart: String, content: String, workspaceId: String?) async throws {
        try await sendIgnoringResult("PUT", "/api/goals/\(weekStart)", body: ["content": .string(content), "workspace_id": .optional(workspaceId)])
    }
}

// MARK: - Notes, links, search

extension APIClient {
    public func notes(workspaceId: String?, archived: Bool) async throws -> [Note] {
        var query = ws(workspaceId)
        query["archived"] = archived ? "true" : "false"
        return try await send("GET", "/api/notes", query: query)
    }

    public func note(id: String) async throws -> Note { try await send("GET", "/api/notes/\(id)") }

    public func createNote(title: String, workspaceId: String?, content: String = "") async throws -> Note {
        var body: JSONObject = ["title": .string(title), "content": .string(content)]
        if let workspaceId { body["workspace_id"] = .string(workspaceId) }
        return try await send("POST", "/api/notes", body: body)
    }

    @discardableResult
    public func updateNote(id: String, _ patch: JSONObject) async throws -> Note {
        try await send("PUT", "/api/notes/\(id)", body: patch)
    }

    public func createLink(sourceType: String, sourceId: String, targetType: String, targetId: String) async throws {
        try await sendIgnoringResult("POST", "/api/links", body: [
            "source_type": .string(sourceType), "source_id": .string(sourceId),
            "target_type": .string(targetType), "target_id": .string(targetId),
        ])
    }

    public func search(_ q: String, workspaceId: String?) async throws -> [SearchResult] {
        var query = ws(workspaceId)
        query["q"] = q
        return try await send("GET", "/api/search", query: query)
    }

    public func mention(_ q: String, type: String? = nil) async throws -> [MentionResult] {
        try await send("GET", "/api/mention", query: ["q": q, "type": type])
    }
}
