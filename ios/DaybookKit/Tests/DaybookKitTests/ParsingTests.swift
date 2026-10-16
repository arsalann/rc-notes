import Foundation
import Testing
@testable import DaybookKit

/// Fixed clock: Friday 2026-10-16 10:00 in Asia/Dubai (UTC+4).
let dubai = TimeZone(identifier: "Asia/Dubai")!
let fixedDays = DayMath(timeZone: dubai, now: { Date(timeIntervalSince1970: 1_792_130_400) })

@Suite struct DayMathTests {
    @Test func clockIsWhatTestsAssume() {
        #expect(fixedDays.today() == "2026-10-16")
        #expect(fixedDays.weekdayShort("2026-10-16") == "Fri")
    }

    @Test func naiveTimestampsAreUTC() throws {
        let d = try #require(DayMath.parseServerTimestamp("2026-10-16 06:00:00"))
        #expect(DayMath.isoString(d) == "2026-10-16T06:00:00.000Z")
        let frac = try #require(DayMath.parseServerTimestamp("2026-10-16 17:30:30.24154"))
        #expect(abs(frac.timeIntervalSince1970.truncatingRemainder(dividingBy: 1) - 0.24154) < 0.0001)
        #expect(DayMath.parseServerTimestamp("2026-10-16T06:00:00.000Z") == d)
        #expect(DayMath.parseServerTimestamp("2026-10-16T10:00:00+04:00") == d)
        #expect(DayMath.parseServerTimestamp("") == nil)
    }

    @Test func dueISOIsNineLocal() {
        // Web: new Date('2026-10-16T09:00').toISOString() in UTC+4.
        #expect(fixedDays.dueISO("2026-10-16") == "2026-10-16T05:00:00.000Z")
    }

    @Test func dayArithmeticAndWeeks() {
        #expect(fixedDays.addDays("2026-10-16", 1) == "2026-10-17")
        #expect(fixedDays.addDays("2026-12-31", 1) == "2027-01-01")
        #expect(fixedDays.startOfWeekSunday("2026-10-16") == "2026-10-11")
        #expect(fixedDays.startOfWeekSunday("2026-10-11") == "2026-10-11")
        #expect(fixedDays.isValidYMD("2026-02-29") == false)
        #expect(fixedDays.isValidYMD("2028-02-29"))
    }

    @Test func labels() {
        #expect(fixedDays.relativeDayLabel("2026-10-16") == "Today")
        #expect(fixedDays.relativeDayLabel("2026-10-15") == "Yesterday")
        #expect(fixedDays.relativeDayLabel("2026-10-17") == "Tomorrow")
        #expect(fixedDays.relativeDayLabel("2026-10-20") == "Tuesday, Oct 20")
        #expect(fixedDays.weekRangeLabel("2026-10-11") == "Oct 11 – Oct 17")
    }

    @Test func dueLabels() {
        #expect(fixedDays.formatDue("2026-10-16 05:00:00") == "Today")
        #expect(fixedDays.formatDue("2026-10-17 05:00:00") == "Tomorrow")
        #expect(fixedDays.formatDue("2026-10-13 05:00:00") == "3d overdue")
        #expect(fixedDays.formatDue("2026-10-20 05:00:00") == "4d")
        #expect(fixedDays.formatDue("2026-11-01 05:00:00") == "Nov 1")
        #expect(fixedDays.isOverdue("2026-10-15 05:00:00"))
        #expect(!fixedDays.isOverdue("2026-10-16 05:00:00"))
        #expect(fixedDays.outstandingDueLabel("2026-10-16 05:00:00", isOverdue: true) == "Overdue today")
    }
}

@Suite struct HashtagTests {
    @Test func priorityStatusDueAndTags() {
        let p = Hashtags.parse("Write blog #focus #now #tomorrow #Launch #launch", days: fixedDays)
        #expect(p.title == "Write blog")
        #expect(p.priority == 2)
        #expect(p.status == .now)
        #expect(p.dueDay == "2026-10-17")
        #expect(p.tags == ["launch"])
        #expect(p.dueISO(fixedDays) == "2026-10-17T05:00:00.000Z")
    }

    @Test func explicitDateAndNone() {
        let p = Hashtags.parse("#crit Pay rent #2026-11-01 #none", days: fixedDays)
        #expect(p.title == "Pay rent")
        #expect(p.priority == 0) // last one wins, like the web
        #expect(p.dueDay == "2026-11-01")
        let q = Hashtags.parse("Plan #next-week", days: fixedDays)
        #expect(q.dueDay == "2026-10-23")
    }

    @Test func plainTitleUntouched() {
        #expect(Hashtags.parse("Call mom", days: fixedDays) == ParsedTitle(title: "Call mom"))
    }

    @Test func mergeManualTagsKeepsHashtagsFirst() {
        #expect(Hashtags.mergeManualTags(["doc", "x"], ["Doc", "content", ""]) == ["doc", "x", "content"])
    }
}

@Suite struct ChecklistTests {
    let content = """
    Morning
    - [ ] Ship build #critical
      - [x] Run tests
      - [ ] Tag release
    - [x] Coffee
    after
    """

    @Test func parsesTree() {
        let items = Checklist.parse(content)
        #expect(items.count == 2)
        #expect(items[0].title == "Ship build #critical")
        #expect(items[0].children.map(\.title) == ["Run tests", "Tag release"])
        #expect(items[0].children[0].checked)
        #expect(items[1].checked)
        #expect(Checklist.hasChecklist(content))
        #expect(!Checklist.hasChecklist("no list here"))
    }

    @Test func deepNesting() {
        let items = Checklist.parse("- [ ] a\n  - [ ] b\n    - [ ] c\n  - [ ] d\n- [ ] e")
        #expect(items.map(\.title) == ["a", "e"])
        #expect(items[0].children.map(\.title) == ["b", "d"])
        #expect(items[0].children[0].children.map(\.title) == ["c"])
    }

    @Test func replacesRootsWithMentionsAndDropsSubtasks() {
        let items = Checklist.parse(content)
        let parsed = Checklist.parsedInputs(items, days: fixedDays)
        #expect(parsed[0].title == "Ship build")
        #expect(parsed[0].priority == 3)
        let roots = zip(items, parsed).map { (original: $0.title, clean: $1.title) }
        let next = Checklist.replaceWithMentions(content, roots: roots)
        #expect(next == "Morning\n@[Ship build]\n@[Coffee]\nafter")
    }
}

@Suite struct MentionTests {
    @Test func activeQueryRules() {
        #expect(Mentions.activeQuery(in: "hi @shi", cursor: 7)?.query == "shi")
        #expect(Mentions.activeQuery(in: "@x", cursor: 2)?.atOffset == 0)
        #expect(Mentions.activeQuery(in: "mail@x", cursor: 6) == nil)
        #expect(Mentions.activeQuery(in: "hi @", cursor: 4) == nil)
        #expect(Mentions.activeQuery(in: "hi @a b", cursor: 7) == nil)
    }

    @Test func insertReplacesQuery() {
        let r = Mentions.insert(title: "Ship build", in: "do @shi now", atOffset: 3, cursor: 7)
        #expect(r.text == "do @[Ship build] now")
        #expect(r.cursor == 16)
        #expect(Mentions.references(in: r.text) == ["Ship build"])
        #expect(Mentions.stripped(r.text) == "do  now")
    }
}

@Suite struct TaskTagTests {
    @Test func detectsWholeWordsOnly() {
        let r = TaskTags.resolve(title: "Write the blog post for a user")
        #expect(r.detected.map(\.key) == ["content", "customers"])
        #expect(TaskTags.resolve(title: "Blogging").detected.isEmpty)
        #expect(TaskTags.resolve(title: "Renew driver’s license").detected.first?.key == "personal-admin")
    }

    @Test func manualAliasesAndCustomTags() {
        let r = TaskTags.resolve(title: "Plan", parentTitle: "Book hotel", manualTags: ["doc", "Errands"])
        #expect(r.resolved.map(\.key) == ["content", "manual:errands", "travel"])
        #expect(r.resolved.last?.sources == [.parent])
        #expect(TaskTags.canonicalManualKey("Read") == "content")
        #expect(TaskTags.detectedReason(r.detected[0]) == "parent title: hotel")
    }

    @Test func pickerToggle() {
        #expect(TaskTags.toggle(key: "content", in: ["doc", "x"]) == ["x"])
        #expect(TaskTags.toggle(key: "travel", in: ["x"]) == ["x", "travel"])
        #expect(TaskTags.isSelected(key: "content", in: ["read"]))
    }
}

@Suite struct MarkdownTests {
    @Test func blocks() {
        let b = Markdown.blocks("# Title\nline one\nline two\n\n- a\n  - b\n- [x] done\n1. first\n> quote\n---\n```\ncode\n```")
        #expect(b == [
            .heading(level: 1, text: "Title"),
            .paragraph("line one line two"),
            .bullet(text: "a", indent: 0),
            .bullet(text: "b", indent: 1),
            .checkbox(checked: true, text: "done", indent: 0),
            .numbered(number: "1", text: "first", indent: 0),
            .quote("quote"),
            .rule,
            .code("code"),
        ])
    }

    @Test func diaryPreviewStripsMentionsAndBoxes() {
        #expect(Markdown.diaryPreview("@[Task]\n- [ ] thing\nnice   day") == "thing nice day")
        #expect(Markdown.diaryPreview("@[Only]") == "Linked tasks and diary activity")
    }

    @Test func noteSegmentsEmbedLinkedTasks() {
        let links = [LinkItem(targetType: "task", targetId: "t1", targetTitle: "Ship")]
        let s = Markdown.noteSegments("Intro\n@[Ship]\n@[Unknown]\nEnd", links: links)
        #expect(s == [.text("Intro\n"), .task(id: "t1"), .text("@[Unknown]"), .text("\nEnd")])
    }
}
