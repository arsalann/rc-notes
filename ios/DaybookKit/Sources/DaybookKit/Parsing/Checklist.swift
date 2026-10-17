import Foundation

/// Port of `app/composables/useChecklist.ts`: markdown `- [ ]` / `- [x]` lines become a task tree.
public struct ChecklistItem: Equatable, Sendable {
    public var title: String
    public var checked: Bool
    public var indent: Int
    public var children: [ChecklistItem]

    public init(title: String, checked: Bool, indent: Int, children: [ChecklistItem] = []) {
        self.title = title
        self.checked = checked
        self.indent = indent
        self.children = children
    }
}

public enum Checklist {
    static let lineRegex = try! NSRegularExpression(pattern: #"^(\s*)- \[([ xX])\] (.+)$"#)

    static func match(_ line: String) -> (indent: Int, checked: Bool, title: String)? {
        let ns = line as NSString
        guard let m = lineRegex.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) else { return nil }
        let indent = m.range(at: 1).length
        let checked = ns.substring(with: m.range(at: 2)).lowercased() == "x"
        let title = ns.substring(with: m.range(at: 3)).trimmingCharacters(in: .whitespaces)
        return (indent, checked, title)
    }

    public static func hasChecklist(_ content: String) -> Bool {
        content.components(separatedBy: "\n").contains { match($0) != nil }
    }

    /// Indented items become children of the nearest less-indented item above them.
    public static func parse(_ content: String) -> [ChecklistItem] {
        // Build with index paths so children can be appended in place.
        var roots: [ChecklistItem] = []
        var stack: [(path: [Int], indent: Int)] = []

        for line in content.components(separatedBy: "\n") {
            guard let m = match(line) else { continue }
            let item = ChecklistItem(title: m.title, checked: m.checked, indent: m.indent)
            while let last = stack.last, last.indent >= m.indent { stack.removeLast() }
            let path: [Int]
            if let parent = stack.last {
                path = parent.path + [append(item, at: parent.path, in: &roots)]
            } else {
                roots.append(item)
                path = [roots.count - 1]
            }
            stack.append((path, m.indent))
        }
        return roots
    }

    private static func append(_ item: ChecklistItem, at path: [Int], in roots: inout [ChecklistItem]) -> Int {
        func walk(_ nodes: inout [ChecklistItem], _ path: ArraySlice<Int>) -> Int {
            let index = path.first!
            if path.count == 1 {
                nodes[index].children.append(item)
                return nodes[index].children.count - 1
            }
            return walk(&nodes[index].children, path.dropFirst())
        }
        return walk(&roots, path[...])
    }

    /// Root checklist lines become `@[cleanTitle]`; subtask lines are dropped.
    public static func replaceWithMentions(_ content: String, roots: [(original: String, clean: String)]) -> String {
        var map: [String: String] = [:]
        for pair in roots where map[pair.original] == nil { map[pair.original] = pair.clean }
        var remaining = Set(roots.map(\.original))
        var result: [String] = []
        for line in content.components(separatedBy: "\n") {
            if let m = match(line) {
                if remaining.contains(m.title) {
                    result.append("@[\(map[m.title] ?? m.title)]")
                    remaining.remove(m.title)
                }
            } else {
                result.append(line)
            }
        }
        return result.joined(separator: "\n")
    }

    /// Diary path: hashtags parsed on every item (priority/status/due/tags), as `convertChecklistToTasks` does.
    public static func parsedInputs(_ items: [ChecklistItem], days: DayMath = .current) -> [ChecklistTaskInput] {
        items.map { item in
            let p = Hashtags.parse(item.title, days: days)
            return ChecklistTaskInput(title: p.title, checked: item.checked, tags: p.tags, priority: p.priority,
                                      status: p.status, dueAt: p.dueISO(days), children: parsedInputs(item.children, days: days))
        }
    }

    /// Notes path: titles sent verbatim (web notes editor does not parse hashtags).
    public static func rawInputs(_ items: [ChecklistItem]) -> [ChecklistTaskInput] {
        items.map { ChecklistTaskInput(title: $0.title, checked: $0.checked, children: rawInputs($0.children)) }
    }
}

/// `@[Title]` mention helpers shared by the journal and notes editors.
public enum Mentions {
    static let regex = try! NSRegularExpression(pattern: #"@\[([^\]]+)\]"#)

    public static func references(in content: String) -> [String] {
        let ns = content as NSString
        return regex.matches(in: content, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range(at: 1)) }
    }

    /// Text with mentions removed (journal preview shows tasks in the Tasks section instead).
    public static func stripped(_ content: String) -> String {
        content.replacingOccurrences(of: #"@\[[^\]]+\]"#, with: "", options: .regularExpression)
    }

    /// Active `@query` immediately before `cursor` (UTF-16 offset), web `handleContentInput` rules:
    /// the `@` starts the text or follows a space/newline, and the query is non-empty with no whitespace.
    public static func activeQuery(in text: String, cursor: Int) -> (query: String, atOffset: Int)? {
        let ns = text as NSString
        let end = min(max(cursor, 0), ns.length)
        let before = ns.substring(to: end) as NSString
        let at = before.range(of: "@", options: .backwards)
        guard at.location != NSNotFound else { return nil }
        if at.location > 0 {
            let prev = before.substring(with: NSRange(location: at.location - 1, length: 1))
            guard prev == " " || prev == "\n" else { return nil }
        }
        let query = before.substring(from: at.location + 1)
        guard !query.isEmpty, !query.contains(" "), !query.contains("\n") else { return nil }
        return (query, at.location)
    }

    /// Replaces `@query` (from `atOffset` up to `cursor`) with `@[title]`. Returns new text and cursor.
    public static func insert(title: String, in text: String, atOffset: Int, cursor: Int) -> (text: String, cursor: Int) {
        let ns = text as NSString
        let end = min(max(cursor, atOffset), ns.length)
        let token = "@[\(title)]"
        let next = ns.replacingCharacters(in: NSRange(location: atOffset, length: end - atOffset), with: token)
        return (next, atOffset + (token as NSString).length)
    }
}
