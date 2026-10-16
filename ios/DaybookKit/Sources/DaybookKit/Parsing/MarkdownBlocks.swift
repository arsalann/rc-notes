import Foundation

/// Minimal block-level markdown splitter for previews (the web uses `marked`). Inline formatting
/// (bold, italics, links, code) is left in each block's text for `AttributedString(markdown:)`.
public enum MarkdownBlock: Equatable, Sendable {
    case heading(level: Int, text: String)
    case paragraph(String)
    case bullet(text: String, indent: Int)
    case numbered(number: String, text: String, indent: Int)
    case checkbox(checked: Bool, text: String, indent: Int)
    case quote(String)
    case code(String)
    case rule
}

public enum Markdown {
    public static func blocks(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var quote: [String] = []
        var code: [String]?

        func flushParagraph() {
            if !paragraph.isEmpty { blocks.append(.paragraph(paragraph.joined(separator: " "))) }
            paragraph = []
        }
        func flushQuote() {
            if !quote.isEmpty { blocks.append(.quote(quote.joined(separator: " "))) }
            quote = []
        }

        for rawLine in source.components(separatedBy: "\n") {
            let line = rawLine.replacingOccurrences(of: "\t", with: "    ")
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let indent = (line.count - line.drop(while: { $0 == " " }).count) / 2

            if trimmed.hasPrefix("```") {
                if let lines = code {
                    blocks.append(.code(lines.joined(separator: "\n")))
                    code = nil
                } else {
                    flushParagraph(); flushQuote()
                    code = []
                }
                continue
            }
            if code != nil { code?.append(rawLine); continue }

            if trimmed.isEmpty { flushParagraph(); flushQuote(); continue }

            if trimmed.hasPrefix(">") {
                flushParagraph()
                quote.append(String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces))
                continue
            }
            flushQuote()

            if let m = trimmed.firstMatch(of: /^(#{1,6})\s+(.*)$/) {
                flushParagraph()
                blocks.append(.heading(level: m.1.count, text: String(m.2)))
            } else if trimmed.range(of: #"^([-*_])(\s*\1){2,}$"#, options: .regularExpression) != nil {
                flushParagraph()
                blocks.append(.rule)
            } else if let m = trimmed.firstMatch(of: /^[-*+]\s+\[([ xX])\]\s+(.*)$/) {
                flushParagraph()
                blocks.append(.checkbox(checked: m.1 != " ", text: String(m.2), indent: indent))
            } else if let m = trimmed.firstMatch(of: /^[-*+]\s+(.*)$/) {
                flushParagraph()
                blocks.append(.bullet(text: String(m.1), indent: indent))
            } else if let m = trimmed.firstMatch(of: /^(\d+)[.)]\s+(.*)$/) {
                flushParagraph()
                blocks.append(.numbered(number: String(m.1), text: String(m.2), indent: indent))
            } else {
                paragraph.append(trimmed)
            }
        }
        if let lines = code { blocks.append(.code(lines.joined(separator: "\n"))) }
        flushParagraph()
        flushQuote()
        return blocks
    }

    /// Web `notesHtml` / `goalsHtml` cleanup: trailing spaces trimmed, 3+ newlines collapsed.
    public static func cleaned(_ content: String) -> String {
        content.replacingOccurrences(of: #"[ \t]+$"#, with: "", options: [.regularExpression])
            .components(separatedBy: "\n").map { $0.replacingOccurrences(of: #"[ \t]+$"#, with: "", options: .regularExpression) }
            .joined(separator: "\n")
            .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Note list / diary list one-line preview (web `diaryPreview`).
    public static func diaryPreview(_ content: String) -> String {
        let text = Mentions.stripped(content)
            .replacingOccurrences(of: #"(?m)^\s*[-*]\s+\[[ xX]\]\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? "Linked tasks and diary activity" : text
    }

    /// Note preview segments: markdown text interleaved with linked-task embeds (web `renderedBlocks`).
    public enum Segment: Equatable, Sendable {
        case text(String)
        case task(id: String)
    }

    public static func noteSegments(_ content: String, links: [LinkItem]) -> [Segment] {
        var segments: [Segment] = []
        let ns = content as NSString
        var last = 0
        for match in Mentions.regex.matches(in: content, range: NSRange(location: 0, length: ns.length)) {
            let before = ns.substring(with: NSRange(location: last, length: match.range.location - last))
            if !before.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { segments.append(.text(before)) }
            let ref = ns.substring(with: match.range(at: 1))
            if let link = links.first(where: { $0.targetType == "task" && ($0.targetTitle == ref || $0.targetId == ref) }) {
                segments.append(.task(id: link.targetId))
            } else {
                segments.append(.text("@[\(ref)]"))
            }
            last = match.range.location + match.range.length
        }
        let rest = ns.substring(from: last)
        if !rest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { segments.append(.text(rest)) }
        return segments
    }
}
