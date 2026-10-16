import Foundation

/// Date helpers ported from `app/composables/useDate.ts` and the day/week math in `pages/diary.vue`.
///
/// Server timestamps are naive strings (`2026-10-16 17:30:30.24154`). Like the web client's `parseUTC`,
/// they are interpreted as UTC. Calendar days (`YYYY-MM-DD`) are always local.
public struct DayMath: Sendable {
    public var calendar: Calendar
    public var now: @Sendable () -> Date

    public init(timeZone: TimeZone = .current, now: @escaping @Sendable () -> Date = { Date() }) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = Locale(identifier: "en_US_POSIX")
        self.calendar = calendar
        self.now = now
    }

    public static let current = DayMath()

    // MARK: Parsing

    /// Parses a server timestamp. Naive values are UTC (matches web `parseUTC`).
    public static func parseServerTimestamp(_ raw: String?) -> Date? {
        guard var text = raw?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return nil }
        text = text.replacingOccurrences(of: " ", with: "T")
        if text.count == 10 { text += "T00:00:00" }
        var zone = TimeZone(identifier: "UTC")!
        if text.hasSuffix("Z") || text.hasSuffix("z") {
            text.removeLast()
        } else if let match = text.range(of: #"[+-]\d{2}:?\d{2}$"#, options: .regularExpression) {
            let offset = String(text[match]).replacingOccurrences(of: ":", with: "")
            let sign = offset.hasPrefix("-") ? -1 : 1
            let hours = Int(offset.dropFirst().prefix(2)) ?? 0
            let minutes = Int(offset.suffix(2)) ?? 0
            zone = TimeZone(secondsFromGMT: sign * (hours * 3600 + minutes * 60)) ?? zone
            text.removeSubrange(match)
        }
        var fraction = 0.0
        if let dot = text.firstIndex(of: ".") {
            fraction = Double("0" + text[dot...]) ?? 0
            text = String(text[..<dot])
        }
        let parts = text.split(separator: "T")
        guard parts.count == 2 else { return nil }
        let ymd = parts[0].split(separator: "-").compactMap { Int($0) }
        let hms = parts[1].split(separator: ":").compactMap { Int($0) }
        guard ymd.count == 3, hms.count >= 2 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let components = DateComponents(year: ymd[0], month: ymd[1], day: ymd[2], hour: hms[0], minute: hms[1], second: hms.count > 2 ? hms[2] : 0)
        guard let date = calendar.date(from: components) else { return nil }
        return date.addingTimeInterval(fraction)
    }

    /// JavaScript `Date#toISOString()` format: `2026-10-16T06:00:00.000Z`.
    public static func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }

    // MARK: Local days

    public func ymd(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    public func today() -> String { ymd(now()) }

    /// Local noon on the given day (same anchor the web uses: `new Date(ds + 'T12:00:00')`).
    public func date(fromYMD value: String, hour: Int = 12, minute: Int = 0) -> Date? {
        let parts = value.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: hour, minute: minute))
        // Reject roll-over dates like 2026-02-31 (web `routeDiaryDate` does the same round trip).
        guard let date, ymd(date) == String(value.prefix(10)) else { return nil }
        return date
    }

    public func isValidYMD(_ value: String) -> Bool {
        value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil && date(fromYMD: value) != nil
    }

    public func addDays(_ value: String, _ days: Int) -> String {
        guard let base = date(fromYMD: value), let next = calendar.date(byAdding: .day, value: days, to: base) else { return value }
        return ymd(next)
    }

    public func offsetFromToday(_ days: Int) -> String { addDays(today(), days) }

    /// Sunday of the week containing the day.
    public func startOfWeekSunday(_ value: String) -> String {
        guard let base = date(fromYMD: value) else { return value }
        let weekday = calendar.component(.weekday, from: base) // 1 = Sunday
        return addDays(value, -(weekday - 1))
    }

    public func weekdayShort(_ value: String) -> String {
        guard let base = date(fromYMD: value) else { return "" }
        return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][calendar.component(.weekday, from: base) - 1]
    }

    public func dayNumber(_ value: String) -> Int {
        guard let base = date(fromYMD: value) else { return 0 }
        return calendar.component(.day, from: base)
    }

    /// Local calendar day of a server timestamp.
    public func localDay(ofServerTimestamp raw: String?) -> String? {
        DayMath.parseServerTimestamp(raw).map(ymd)
    }

    /// Due timestamp to send for "this local day at HH:MM" (web: `new Date('YYYY-MM-DDT09:00').toISOString()`).
    public func dueISO(_ day: String, hour: Int = 9, minute: Int = 0) -> String? {
        date(fromYMD: day, hour: hour, minute: minute).map(DayMath.isoString)
    }

    // MARK: Labels

    private func formatted(_ date: Date, _ template: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }

    /// "Oct 16"
    public func shortLabel(_ value: String) -> String {
        guard let d = date(fromYMD: value) else { return value }
        return formatted(d, "MMMd")
    }

    /// "Friday, Oct 16"
    public func longLabel(_ value: String) -> String {
        guard let d = date(fromYMD: value) else { return value }
        return formatted(d, "EEEEMMMd")
    }

    /// "Fri, Oct 16"
    public func mediumLabel(_ value: String) -> String {
        guard let d = date(fromYMD: value) else { return value }
        return formatted(d, "EEEMMMd")
    }

    /// Today / Yesterday / Tomorrow / "Friday, Oct 16".
    public func relativeDayLabel(_ value: String) -> String {
        let today = today()
        if value == today { return "Today" }
        if value == addDays(today, -1) { return "Yesterday" }
        if value == addDays(today, 1) { return "Tomorrow" }
        return longLabel(value)
    }

    /// "Oct 11 – Oct 17"
    public func weekRangeLabel(_ weekStart: String) -> String {
        "\(shortLabel(weekStart)) – \(shortLabel(addDays(weekStart, 6)))"
    }

    private func dayDifference(_ raw: String) -> Int? {
        guard let due = DayMath.parseServerTimestamp(raw),
              let a = date(fromYMD: ymd(due)), let b = date(fromYMD: today()) else { return nil }
        return calendar.dateComponents([.day], from: b, to: a).day
    }

    /// Web `formatDue`: "3d overdue" / "Today" / "Tomorrow" / "4d" / "Oct 30".
    public func formatDue(_ raw: String?) -> String {
        guard let raw, let diff = dayDifference(raw), let due = DayMath.parseServerTimestamp(raw) else { return "" }
        if diff < 0 { return "\(-diff)d overdue" }
        if diff == 0 { return "Today" }
        if diff == 1 { return "Tomorrow" }
        if diff < 7 { return "\(diff)d" }
        return formatted(due, "MMMd")
    }

    public func isOverdue(_ raw: String?) -> Bool {
        guard let raw, let diff = dayDifference(raw) else { return false }
        return diff < 0
    }

    /// Week-summary outstanding label (web `formatDueLabel`).
    public func outstandingDueLabel(_ raw: String?, isOverdue: Bool) -> String {
        guard let raw, let diff = dayDifference(raw), let due = DayMath.parseServerTimestamp(raw) else { return "" }
        if isOverdue { return diff == 0 ? "Overdue today" : "\(abs(diff))d overdue" }
        if diff == 0 { return "Today" }
        if diff == 1 { return "Tomorrow" }
        return formatted(due, "MMMd")
    }

    /// Due date shown in a picker: local `Date` for a server timestamp.
    public static func dueDate(_ raw: String?) -> Date? { parseServerTimestamp(raw) }
}
