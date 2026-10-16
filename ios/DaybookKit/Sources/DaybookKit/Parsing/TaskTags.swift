import Foundation

/// Port of `app/utils/taskTags.ts`. The server returns `resolved_tags` for stored tasks; the client
/// needs the catalog for the tag picker and for previewing tags before a task is created.
public struct TaskTagDefinition: Sendable, Hashable {
    public var key: String
    public var label: String
    public var emoji: String
    public var matchers: [String]
    public var aliases: [String]
}

public enum TaskTags {
    public static let catalog: [TaskTagDefinition] = [
        .init(key: "data-stack", label: "Data stack", emoji: "🛠️",
              matchers: ["bruin", "ingestr", "duckdb", "ducklake", "clickhouse", "fivetran", "dbt"], aliases: []),
        .init(key: "content", label: "Content", emoji: "✍️",
              matchers: ["blog", "tutorial", "docs", "academy", "course", "masterclass", "video"], aliases: ["doc", "read"]),
        .init(key: "growth", label: "Growth", emoji: "📈",
              matchers: ["growth", "marketing", "launch", "promote", "linkedin", "reddit", "seo", "social"], aliases: []),
        .init(key: "community", label: "Community", emoji: "🎤",
              matchers: ["community", "event", "webinar", "meetup", "office hours", "fireside", "luma", "pydata", "slack"], aliases: []),
        .init(key: "partnerships", label: "Partnerships", emoji: "🤝",
              matchers: ["partner", "partnership", "partnerstack"], aliases: []),
        .init(key: "customers", label: "Customers", emoji: "👥",
              matchers: ["customer", "user", "icp", "outreach", "sales", "client"], aliases: ["icp"]),
        .init(key: "travel", label: "Travel", emoji: "✈️",
              matchers: ["trip", "bcn", "hotel", "flight"], aliases: ["trip"]),
        .init(key: "personal-admin", label: "Personal admin", emoji: "🧾",
              matchers: ["driver's license", "vodafone", "revolut", "groceries", "nail clippers"], aliases: []),
    ]

    static let catalogOrder: [String: Int] = Dictionary(uniqueKeysWithValues: catalog.enumerated().map { ($1.key, $0) })
    static let byKey: [String: TaskTagDefinition] = Dictionary(uniqueKeysWithValues: catalog.map { ($0.key, $0) })
    static let aliasToKey: [String: String] = {
        var map: [String: String] = [:]
        for tag in catalog {
            map[normalize(tag.key)] = tag.key
            map[normalize(tag.label)] = tag.key
            for alias in tag.aliases { map[normalize(alias)] = tag.key }
        }
        return map
    }()

    /// Lowercase, accent-free, punctuation collapsed to single spaces.
    public static func normalize(_ input: String?) -> String {
        var text = (input ?? "").decomposedStringWithCompatibilityMapping
        text = text.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }.map(String.init).joined()
        text = text.lowercased()
            .replacingOccurrences(of: "[’‘`]", with: "'", options: .regularExpression)
            .replacingOccurrences(of: "'", with: "")
            .replacingOccurrences(of: #"[^\p{L}\p{N}]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        return text.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }

    public static func canonicalManualKey(_ raw: String?) -> String? {
        let normalized = normalize(raw)
        return normalized.isEmpty ? nil : aliasToKey[normalized]
    }

    static func matches(_ normalizedText: String, _ matcher: String) -> Bool {
        let m = normalize(matcher)
        guard !normalizedText.isEmpty, !m.isEmpty else { return false }
        return " \(normalizedText) ".contains(" \(m) ")
    }

    static func detect(_ text: String?, source: TagSource) -> [ResolvedTag] {
        let normalized = normalize(text)
        guard !normalized.isEmpty else { return [] }
        return catalog.compactMap { def in
            let terms = def.matchers.filter { matches(normalized, $0) }
            return terms.isEmpty ? nil : ResolvedTag(key: def.key, label: def.label, emoji: def.emoji, sources: [source], matchedTerms: terms)
        }
    }

    static func resolveManual(_ raw: String) -> ResolvedTag? {
        let label = raw.trimmingCharacters(in: .whitespaces)
        let normalized = normalize(label)
        guard !normalized.isEmpty else { return nil }
        if let key = canonicalManualKey(label), let def = byKey[key] {
            return ResolvedTag(key: def.key, label: def.label, emoji: def.emoji, sources: [.manual], matchedTerms: [label])
        }
        return ResolvedTag(key: "manual:\(normalized)", label: label, emoji: nil, sources: [.manual], matchedTerms: [label])
    }

    static func rank(_ tag: ResolvedTag) -> Int {
        tag.sources.contains(.manual) || tag.sources.contains(.title) ? 0 : 1
    }

    public static func compare(_ a: ResolvedTag, _ b: ResolvedTag) -> Bool {
        if rank(a) != rank(b) { return rank(a) < rank(b) }
        let oa = catalogOrder[a.key] ?? .max, ob = catalogOrder[b.key] ?? .max
        if oa != ob { return oa < ob }
        return a.label.localizedCompare(b.label) == .orderedAscending
    }

    static func merge(_ tags: [ResolvedTag]) -> [ResolvedTag] {
        var order: [String] = []
        var byKey: [String: ResolvedTag] = [:]
        for tag in tags {
            if var current = byKey[tag.key] {
                for s in tag.sources where !current.sources.contains(s) { current.sources.append(s) }
                for t in tag.matchedTerms where !current.matchedTerms.contains(t) { current.matchedTerms.append(t) }
                byKey[tag.key] = current
            } else {
                byKey[tag.key] = tag
                order.append(tag.key)
            }
        }
        return order.compactMap { byKey[$0] }.sorted(by: compare)
    }

    public static func resolve(title: String?, parentTitle: String? = nil, manualTags: [String] = []) -> (detected: [ResolvedTag], resolved: [ResolvedTag]) {
        let manual = manualTags.compactMap(resolveManual)
        let direct = detect(title, source: .title)
        let parent = detect(parentTitle, source: .parent)
        return (merge(direct + parent), merge(manual + direct + parent))
    }

    /// "task title: blog, docs" — why a tag was detected (task detail "Detected" badges).
    public static func detectedReason(_ tag: ResolvedTag) -> String {
        let source = [tag.sources.contains(.title) ? "task title" : "", tag.sources.contains(.parent) ? "parent title" : ""]
            .filter { !$0.isEmpty }.joined(separator: " + ")
        let terms = tag.matchedTerms.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        return terms.isEmpty ? source : "\(source): \(terms.joined(separator: ", "))"
    }

    /// Tag picker toggle: adds the catalog key or removes every manual tag that aliases to it.
    public static func toggle(key: String, in tags: [String]) -> [String] {
        let selected = tags.contains { canonicalManualKey($0) == key }
        return selected ? tags.filter { canonicalManualKey($0) != key } : tags + [key]
    }

    public static func isSelected(key: String, in tags: [String]) -> Bool {
        tags.contains { canonicalManualKey($0) == key }
    }

    /// Ordering used by "Group by tag": catalog order, then label, untagged last.
    public static func groupOrder(_ a: (key: String, label: String), _ b: (key: String, label: String)) -> Bool {
        if a.key == "untagged" { return false }
        if b.key == "untagged" { return true }
        let oa = catalogOrder[a.key] ?? .max, ob = catalogOrder[b.key] ?? .max
        if oa != ob { return oa < ob }
        return a.label.localizedCompare(b.label) == .orderedAscending
    }
}
