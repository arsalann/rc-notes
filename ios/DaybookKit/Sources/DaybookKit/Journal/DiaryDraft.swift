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

    /// Every draft key of one user starts with this (used to erase them when the account is deleted).
    public static func storageKeyPrefix(userId: String) -> String {
        "\(DiaryDraftFormat.keyPrefix):\(encodeComponent(userId)):"
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

/// One file per draft, written atomically and synchronously, so a draft survives the app being
/// killed right after a keystroke (UserDefaults persists asynchronously and can lose it).
public final class FileDraftStore: DraftKeyValueStore {
    private let directory: URL
    private let fm = FileManager.default

    public init(directory: URL) {
        self.directory = directory
        try? fm.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// `Application Support/JournalDrafts`, excluded from iCloud backup.
    public static func standard() -> FileDraftStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var dir = base.appendingPathComponent("JournalDrafts", isDirectory: true)
        let store = FileDraftStore(directory: dir)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? dir.setResourceValues(values)
        return store
    }

    private func url(for key: String) -> URL {
        let name = Data(key.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return directory.appendingPathComponent(name + ".draft")
    }

    private func key(forFile name: String) -> String? {
        guard name.hasSuffix(".draft") else { return nil }
        var b64 = String(name.dropLast(6)).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        return Data(base64Encoded: b64).flatMap { String(data: $0, encoding: .utf8) }
    }

    public func string(forKey key: String) -> String? {
        (try? Data(contentsOf: url(for: key))).flatMap { String(data: $0, encoding: .utf8) }
    }

    public func set(_ value: String, forKey key: String) {
        try? Data(value.utf8).write(to: url(for: key), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    public func remove(forKey key: String) { try? fm.removeItem(at: url(for: key)) }

    public func allKeys() -> [String] {
        ((try? fm.contentsOfDirectory(atPath: directory.path)) ?? []).compactMap(key(forFile:))
    }

    /// Deletes every stored draft (used by the UI-test reset).
    public func removeAll() {
        allKeys().forEach(remove(forKey:))
    }
}

public final class InMemoryDraftStore: DraftKeyValueStore {
    public private(set) var values: [String: String] = [:]

    public init(_ values: [String: String] = [:]) { self.values = values }

    public func string(forKey key: String) -> String? { values[key] }
    public func set(_ value: String, forKey key: String) { values[key] = value }
    public func remove(forKey key: String) { values.removeValue(forKey: key) }
    public func allKeys() -> [String] { Array(values.keys) }
}
