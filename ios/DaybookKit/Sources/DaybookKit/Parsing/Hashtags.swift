import Foundation

/// Port of `app/composables/useHashtagParse.ts`.
///
/// `#critical #crit #focus #snack #none #nopriority` set priority, `#now #next #done` set status,
/// `#today #tomorrow #nextweek #next-week #YYYY-MM-DD` set a due day (09:00 local), and any other
/// hashtag becomes a lowercase tag. Recognised tokens are removed from the title.
public struct ParsedTitle: Equatable, Sendable {
    public var title: String
    public var tags: [String]
    public var priority: Int?
    public var status: TaskStatus?
    /// Local calendar day; the task is due at 09:00 that day.
    public var dueDay: String?

    public init(title: String, tags: [String] = [], priority: Int? = nil, status: TaskStatus? = nil, dueDay: String? = nil) {
        self.title = title
        self.tags = tags
        self.priority = priority
        self.status = status
        self.dueDay = dueDay
    }

    /// UTC ISO due timestamp for the server, or nil.
    public func dueISO(_ days: DayMath = .current) -> String? {
        dueDay.flatMap { days.dueISO($0) }
    }
}

public enum Hashtags {
    static let priorityMap: [String: Int] = ["critical": 3, "crit": 3, "focus": 2, "snack": 1, "none": 0, "nopriority": 0]
    // JS `\w` is ASCII-only, so the token class is spelled out.
    static let regex = try! NSRegularExpression(pattern: "#([A-Za-z0-9_-]+)")

    public static func parse(_ input: String, days: DayMath = .current) -> ParsedTitle {
        var tags: [String] = []
        var priority: Int?
        var status: TaskStatus?
        var dueDay: String?

        let ns = input as NSString
        var output = ""
        var cursor = 0
        for match in regex.matches(in: input, range: NSRange(location: 0, length: ns.length)) {
            output += ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
            cursor = match.range.location + match.range.length
            let token = ns.substring(with: match.range(at: 1)).lowercased()
            if let value = priorityMap[token] {
                priority = value
            } else if let value = TaskStatus(rawValue: token) {
                status = value
            } else if let day = dueShortcut(token, days: days) {
                dueDay = day
            } else {
                tags.append(token)
            }
        }
        output += ns.substring(from: cursor)

        let collapsed = output.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var seen = Set<String>()
        let unique = tags.filter { seen.insert($0).inserted }
        return ParsedTitle(title: collapsed, tags: unique, priority: priority, status: status, dueDay: dueDay)
    }

    static func dueShortcut(_ token: String, days: DayMath) -> String? {
        switch token {
        case "today": return days.today()
        case "tomorrow": return days.offsetFromToday(1)
        case "nextweek", "next-week": return days.offsetFromToday(7)
        default:
            return token.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil ? token : nil
        }
    }

    /// Web QuickAdd `mergeManualTags`: hashtags exactly as typed, then picker-only tags not already present.
    public static func mergeManualTags(_ hashtagTags: [String], _ pickerTags: [String]) -> [String] {
        var seen = Set(hashtagTags.map { $0.trimmingCharacters(in: .whitespaces).lowercased() })
        let pickerOnly = pickerTags.filter { tag in
            let normalized = tag.trimmingCharacters(in: .whitespaces).lowercased()
            guard !normalized.isEmpty, !seen.contains(normalized) else { return false }
            seen.insert(normalized)
            return true
        }
        return hashtagTags + pickerOnly
    }
}

/// Port of `app/composables/usePriority.ts`.
public enum Priority: Int, CaseIterable, Identifiable, Sendable {
    case none = 0, snack = 1, focus = 2, critical = 3

    public var id: Int { rawValue }

    /// Options shown in pickers, highest first (web PRIORITY_OPTIONS order).
    public static let options: [Priority] = [.critical, .focus, .snack]

    public var label: String {
        switch self {
        case .critical: "Critical"
        case .focus: "Focus"
        case .snack: "Snack"
        case .none: "No priority"
        }
    }

    /// SF Symbol standing in for the web's lucide flame / target / cookie icons.
    public var symbol: String {
        switch self {
        case .critical: "flame.fill"
        case .focus: "scope"
        case .snack: "leaf.fill"
        case .none: "minus"
        }
    }

    public init(value: Int?) { self = Priority(rawValue: value ?? 0) ?? .none }
}
