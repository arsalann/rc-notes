import Foundation

/// The two sync calls; `APIClient` conforms, tests use an in-memory server.
public protocol SyncTransport: Sendable {
    func push(_ ops: [PushOp]) async throws -> PushResponse
    func pull(since: Int64, limit: Int) async throws -> PullResponse
}

public struct PushOp: Sendable, Equatable {
    public var id: String
    public var clientTime: String
    public var method: String
    public var path: String
    public var body: JSONValue?

    init(_ op: PendingOp) {
        let request = op.mutation.request
        id = op.id
        clientTime = DayMath.isoString(op.clientTime)
        method = request.method
        path = request.path
        body = request.body
    }

    var json: JSONValue {
        var object: JSONObject = ["id": .string(id), "client_time": .string(clientTime), "method": .string(method), "path": .string(path)]
        if let body { object["body"] = body }
        return .object(object)
    }
}

public struct PushResult: Decodable, Sendable, Equatable {
    public var id: String
    public var status: Int
    public var body: JSONValue?
    public var replayed: Bool?

    public init(id: String, status: Int, body: JSONValue? = nil) {
        self.id = id
        self.status = status
        self.body = body
        replayed = nil
    }

    /// The response body as a row (snake_case JSON from the server).
    func row<Row: Decodable>(_ type: Row.Type) -> Row? {
        guard let body, case .object = body, let data = try? JSONEncoder().encode(body) else { return nil }
        return try? APIClient.decoder.decode(Row.self, from: data)
    }

    var message: String {
        if case .object(let object)? = body {
            return object["statusMessage"]?.stringValue ?? object["message"]?.stringValue ?? ""
        }
        return body?.stringValue ?? ""
    }
}

public struct PushResponse: Decodable, Sendable {
    public var results: [PushResult]
    public var stopped: Bool

    public init(results: [PushResult], stopped: Bool = false) {
        self.results = results
        self.stopped = stopped
    }
}

public struct PullResponse: Decodable, Sendable {
    public struct Rows: Decodable, Sendable {
        public var workspaces: [WorkspaceRow] = []
        public var tasks: [TaskRow] = []
        public var notes: [NoteRow] = []
        public var links: [LinkRow] = []
        public var diaryEntries: [DiaryRow] = []
        public var goalsWeekly: [GoalsRow] = []

        public init() {}

        enum CodingKeys: String, CodingKey { case workspaces, tasks, notes, links, diaryEntries, goalsWeekly }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            workspaces = c.value(.workspaces, default: [])
            tasks = c.value(.tasks, default: [])
            notes = c.value(.notes, default: [])
            links = c.value(.links, default: [])
            diaryEntries = c.value(.diaryEntries, default: [])
            goalsWeekly = c.value(.goalsWeekly, default: [])
        }
    }

    public struct Tombstone: Decodable, Sendable {
        public var tableName: String
        public var rowId: String
        public init(tableName: String, rowId: String) {
            self.tableName = tableName
            self.rowId = rowId
        }
    }

    public var cursor: Int64
    public var more: Bool
    public var rows: Rows
    public var tombstones: [Tombstone]

    public init(cursor: Int64, more: Bool = false, rows: Rows = Rows(), tombstones: [Tombstone] = []) {
        self.cursor = cursor
        self.more = more
        self.rows = rows
        self.tombstones = tombstones
    }
}

extension APIClient: SyncTransport {
    public func push(_ ops: [PushOp]) async throws -> PushResponse {
        try await send("POST", "/api/sync/push", body: ["ops": .array(ops.map(\.json))])
    }

    public func pull(since: Int64, limit: Int) async throws -> PullResponse {
        try await send("GET", "/api/sync/pull", query: ["since": String(since), "limit": String(limit)])
    }
}
