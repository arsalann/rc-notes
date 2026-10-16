import Foundation

/// Port of `app/utils/diaryDraft.ts`. Local journal drafts are versioned and bound to the exact
/// entry identity they were typed into; anything else is ignored or quarantined, never replayed.
public enum DiaryDraftFormat {
    public static let version = 2
    public static let keyPrefix = "daybook:diary-draft:v\(version)"
    public static let legacyKeyPrefix = "daybook:diary-draft:"
}

public struct DiaryDraftIdentity: Codable, Hashable, Sendable {
    public var userId: String
    public var entryId: String
    public var date: String
    public var workspaceId: String?

    public init(userId: String, entryId: String, date: String, workspaceId: String?) {
        self.userId = userId
        self.entryId = entryId
        self.date = date
        self.workspaceId = workspaceId
    }

    enum CodingKeys: String, CodingKey { case userId, entryId, date, workspaceId }

    // `workspaceId: null` is written explicitly, matching the web format.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(entryId, forKey: .entryId)
        try c.encode(date, forKey: .date)
        try c.encode(workspaceId, forKey: .workspaceId)
    }

    var isValid: Bool {
        !userId.isEmpty && !entryId.isEmpty
            && date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
            && (workspaceId == nil || !(workspaceId!.isEmpty))
    }
}

public struct DiaryDraft: Codable, Equatable, Sendable {
    public var version: Int
    public var identity: DiaryDraftIdentity
    public var content: String
    public var savedAt: String
    public var baseUpdatedAt: String

    public init(identity: DiaryDraftIdentity, content: String, baseUpdatedAt: String, savedAt: String = DayMath.isoString(Date())) {
        version = DiaryDraftFormat.version
        self.identity = identity
        self.content = content
        self.savedAt = savedAt
        self.baseUpdatedAt = baseUpdatedAt
    }
}

public enum DiaryDraftInspection: Equatable, Sendable {
    case accepted(DiaryDraft)
    case missing, invalid, legacy, contextMismatch
    /// Valid draft typed against an older server revision. Still offered, but only an explicit
    /// Restore may rebase and submit it.
    case staleBase(DiaryDraft)
}

public enum DiaryDrafts {
    /// `encodeURIComponent` equivalent.
    static func encodeComponent(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics.intersection(CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))
        allowed.insert(charactersIn: "-_.!~*'()")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    public static func storageKey(_ identity: DiaryDraftIdentity) -> String {
        let parts = [identity.userId, identity.entryId, identity.workspaceId ?? "{none}", identity.date].map(encodeComponent)
        return "\(DiaryDraftFormat.keyPrefix):\(parts.joined(separator: ":"))"
    }

    public static func isLegacyKey(_ key: String) -> Bool {
        key.hasPrefix(DiaryDraftFormat.legacyKeyPrefix) && !key.hasPrefix("\(DiaryDraftFormat.keyPrefix):")
    }

    public static func quarantineKey(_ key: String, at quarantinedAt: String) -> String {
        "\(key):quarantine:\(encodeComponent(quarantinedAt))"
    }

    public static func encode(_ draft: DiaryDraft) -> String? {
        (try? JSONEncoder().encode(draft)).flatMap { String(data: $0, encoding: .utf8) }
    }

    public static func inspect(_ raw: String?, expected: DiaryDraftIdentity, serverUpdatedAt: String) -> DiaryDraftInspection {
        guard let raw, let data = raw.data(using: .utf8) else { return .missing }
        guard let object = try? JSONSerialization.jsonObject(with: data) else { return .invalid }
        if let dict = object as? [String: Any], (dict["version"] as? Int) != DiaryDraftFormat.version {
            return .legacy
        }
        guard let draft = try? JSONDecoder().decode(DiaryDraft.self, from: data),
              draft.version == DiaryDraftFormat.version, draft.identity.isValid,
              !draft.savedAt.isEmpty, !draft.baseUpdatedAt.isEmpty else { return .invalid }
        guard draft.identity == expected else { return .contextMismatch }
        guard draft.baseUpdatedAt == serverUpdatedAt else { return .staleBase(draft) }
        return .accepted(draft)
    }

    public static func canPersist(_ draft: DiaryDraft, identity: DiaryDraftIdentity, serverUpdatedAt: String) -> Bool {
        draft.identity == identity && draft.baseUpdatedAt == serverUpdatedAt
    }
}

/// Persistent string storage for drafts (UserDefaults in the app, in-memory in tests).
public protocol DraftKeyValueStore: AnyObject {
    func string(forKey key: String) -> String?
    func set(_ value: String, forKey key: String)
    func remove(forKey key: String)
    func allKeys() -> [String]
}

public final class UserDefaultsDraftStore: DraftKeyValueStore {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    public func string(forKey key: String) -> String? { defaults.string(forKey: key) }
    public func set(_ value: String, forKey key: String) { defaults.set(value, forKey: key) }
    public func remove(forKey key: String) { defaults.removeObject(forKey: key) }
    public func allKeys() -> [String] { Array(defaults.dictionaryRepresentation().keys) }
}

public final class InMemoryDraftStore: DraftKeyValueStore {
    public private(set) var values: [String: String] = [:]

    public init(_ values: [String: String] = [:]) { self.values = values }

    public func string(forKey key: String) -> String? { values[key] }
    public func set(_ value: String, forKey key: String) { values[key] = value }
    public func remove(forKey key: String) { values.removeValue(forKey: key) }
    public func allKeys() -> [String] { Array(values.keys) }
}
