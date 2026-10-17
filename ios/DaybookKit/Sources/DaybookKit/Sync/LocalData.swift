import CryptoKit
import Foundation

/// The app's local copy of the synced tables, keyed by row id.
public struct LocalData: Codable, Equatable, Sendable {
    public var workspaces: [String: WorkspaceRow] = [:]
    public var tasks: [String: TaskRow] = [:]
    public var notes: [String: NoteRow] = [:]
    public var links: [String: LinkRow] = [:]
    public var diary: [String: DiaryRow] = [:]
    public var goals: [String: GoalsRow] = [:]

    public init() {}

    public var isEmpty: Bool { workspaces.isEmpty && tasks.isEmpty && notes.isEmpty && diary.isEmpty }

    /// Same rule as the server's `getDefaultWorkspaceId`: the first workspace named "Work".
    public var defaultWorkspaceId: String? {
        workspaces.values.filter { $0.name == "Work" }.min { ($0.position, $0.id) < ($1.position, $1.id) }?.id
    }

    /// Applies one pulled row or a mutation response, unless the local copy is already newer.
    mutating func upsert<Row: SyncRow>(_ row: Row, into table: WritableKeyPath<LocalData, [String: Row]>) {
        if let existing = self[keyPath: table][row.id], existing.syncSeq > row.syncSeq { return }
        self[keyPath: table][row.id] = row
    }

    mutating func remove(table: String, id: String) {
        switch table {
        case "workspaces": workspaces[id] = nil
        case "tasks": tasks[id] = nil
        case "notes": notes[id] = nil
        case "links": links[id] = nil
        case "diary_entries": diary[id] = nil
        case "goals_weekly": goals[id] = nil
        default: break
        }
    }
}

/// Timestamps in the server's format: naive UTC, `2026-10-17 09:30:00.123`.
public enum ServerTime {
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        return f
    }()

    public static func string(_ date: Date) -> String { formatter.string(from: date) }

    /// A client due date (`2026-10-17T07:00:00.000Z`, or any zoned ISO form) as the server stores it
    /// (`($due_at::timestamptz AT TIME ZONE 'UTC')`). Unzoned values are taken as UTC, as the server does.
    public static func storedDue(_ raw: String) -> String? {
        DayMath.parseServerTimestamp(raw).map(string)
    }

    /// `YYYY-MM-DD` of a stored (UTC) timestamp: the server's `due_at::DATE`.
    public static func utcDay(_ stored: String?) -> String? {
        guard let stored, stored.count >= 10 else { return nil }
        return String(stored.prefix(10))
    }
}

public enum DiaryIds {
    /// Id of a new diary page, the same value the server computes (`diaryIdSql` in `db.ts`):
    /// `md5('daybook-diary:<date>:<workspace or empty>')` formatted as a UUID.
    public static func entryId(date: String, workspaceId: String?) -> String {
        let digest = Insecure.MD5.hash(data: Data("daybook-diary:\(date):\(workspaceId ?? "")".utf8))
        let hex = digest.map { String(format: "%02x", $0) }.joined()
        let chars = Array(hex)
        func part(_ a: Int, _ b: Int) -> String { String(chars[a..<b]) }
        return "\(part(0, 8))-\(part(8, 12))-\(part(12, 16))-\(part(16, 20))-\(part(20, 32))"
    }
}
