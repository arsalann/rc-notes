import DaybookKit
import Foundation
import Observation
import SwiftUI

/// State and behaviour of the Today (daybook) screen — a port of `pages/diary.vue`.
@MainActor
@Observable
final class TodayModel {
    enum TaskGroup: String, CaseIterable { case none, created, priority }
    enum ReorderState { case idle, saving, saved, failed }

    struct Group: Identifiable {
        var id: String
        var label: String
        var systemImage: String?
        var priority: Int?
        var ids: [String]
    }

    struct WeekDay: Identifiable {
        var id: String { date }
        var date: String
        var label: String
        var isToday: Bool
        var groups: [CompletedGroup]
        var count: Int
    }

    struct CompletedGroup: Identifiable {
        var id: String
        var parentTitle: String?
        var parentDisplayId: String?
        var parentCompletedThisDay: Bool
        var subtasks: [CompletedTask]
    }

    private let app: AppModel
    let journal: JournalSession

    var selectedDate: String
    var windowCenter: String
    private(set) var todayDate: String
    private(set) var entryDates: Set<String> = []
    private(set) var carriedTasks: [CarriedTask] = []
    private(set) var taskCache: [String: TaskItem] = [:]
    private(set) var manualPending: [String] = []
    private(set) var manualDone: [String] = []
    private var manualReady = false
    private(set) var navigating = false
    private(set) var loadError: String?
    var editMode = false
    private(set) var convertingChecklist = false

    var taskSort: Preferences.DiaryTaskSort {
        didSet {
            app.prefs.diaryTaskSort = taskSort
            if taskSort == .manual { taskGroup = .none }
        }
    }
    var taskGroup: TaskGroup = .none
    var hideDone: Bool { didSet { app.prefs.diaryHideDone = hideDone } }
    var journalExpanded: Bool { didSet { app.prefs.diaryJournalCollapsed = !journalExpanded } }
    var goalsExpanded: Bool { didSet { app.prefs.diaryGoalsCollapsed = !goalsExpanded } }
    var doneExpanded = false
    var subtasksExpanded = true
    var collapsedGroups: Set<String> = []
    private(set) var reorderState: ReorderState = .idle

    // Goals (one shared entry per Sunday-start week).
    private(set) var goals: GoalsEntry?
    var goalsText = ""
    private(set) var goalsSaving = false
    var goalsEditing = false
    private var goalsRequest = 0
    private var goalsSaveTask: Task<Void, Never>?

    // Copy from previous day.
    private(set) var previousContent: String?
    var copyPreviousPrompt = false

    // Week summary.
    var weekStart = ""
    private(set) var weekTasks: [CompletedTask] = []
    private(set) var weekLoading = false
    private(set) var outstanding: [TaskItem] = []
    private(set) var outstandingLoading = false

    private var indicatorRequest = 0

    init(app: AppModel) {
        self.app = app
        journal = JournalSession(backend: app.api!, store: app.draftStore, userId: app.user?.id ?? "")
        let today = app.days.today()
        todayDate = today
        selectedDate = today
        windowCenter = today
        taskSort = app.prefs.diaryTaskSort
        hideDone = app.prefs.diaryHideDone
        journalExpanded = !app.prefs.diaryJournalCollapsed
        goalsExpanded = !app.prefs.diaryGoalsCollapsed
    }

    private var api: APIClient { app.api! }
    private var days: DayMath { app.days }
    var workspaceId: String? { app.activeWorkspaceId }

    // MARK: Lifecycle & navigation

    func start(date: String? = nil) async {
        journal.quarantineLegacyDrafts()
        if let date, days.isValidYMD(date) {
            selectedDate = date
            windowCenter = date
        }
        await reload()
    }

    /// Full refresh for the current date + workspace.
    func reload() async {
        todayDate = days.today()
        await loadEntry()
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.fetchIndicators() }
            group.addTask { await self.fetchGoals() }
        }
    }

    func selectDay(_ date: String) async {
        guard date != selectedDate, !navigating else { return }
        navigating = true
        defer { navigating = false }
        await leaveEditing()
        selectedDate = date
        await loadEntry()
        if days.startOfWeekSunday(date) != goals?.weekStart { await fetchGoals() }
    }

    func shiftDay(_ delta: Int) async {
        guard !navigating else { return }
        windowCenter = days.addDays(windowCenter, delta)
        await selectDay(days.addDays(selectedDate, delta))
        await fetchIndicators()
    }

    func goToToday() async {
        todayDate = days.today()
        windowCenter = todayDate
        await selectDay(todayDate)
        await fetchIndicators()
    }

    /// Opens a specific day (deep link from Notes → Diary notes).
    func open(date: String) async {
        guard days.isValidYMD(date) else { return }
        windowCenter = date
        if date == selectedDate { return }
        await selectDay(date)
        await fetchIndicators()
    }

    /// Persists writing before the workspace filter changes (web `selectWorkspace`).
    func prepareForWorkspaceChange() async {
        await leaveEditing()
    }

    func refreshToday() { todayDate = days.today() }

    var windowDays: [String] { (-3...3).map { days.addDays(windowCenter, $0) } }

    var selectedDayLabel: String { days.relativeDayLabel(selectedDate) }

    func hasContent(_ date: String) -> Bool {
        entryDates.contains(date) || journal.savedNonEmptyDates.contains(date)
    }

    // MARK: Entry

    private func resetDayState() {
        carriedTasks = []
        taskCache = [:]
        manualPending = []
        manualDone = []
        manualReady = false
        doneExpanded = false
        collapsedGroups = []
        subtasksExpanded = true
        editMode = false
        loadError = nil
    }

    func loadEntry() async {
        resetDayState()
        do {
            let current = try await journal.load(date: selectedDate, workspaceId: workspaceId)
            guard current, let entry = journal.entry else { return }
            merge(entry.tasks ?? [])
            carriedTasks = entry.carriedTasks ?? []
            await hydrateMissing()
            syncManualLists()
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func merge(_ tasks: [TaskItem]) {
        for task in tasks { taskCache[task.id] = task }
    }

    func update(_ task: TaskItem) {
        taskCache[task.id] = task
        syncManualLists()
    }

    /// Carried + linked + @-mentioned task ids (web `allTaskIds`).
    var allTaskIds: [String] {
        var ids: [String] = []
        var seen = Set<String>()
        func add(_ id: String) { if seen.insert(id).inserted { ids.append(id) } }
        carriedTasks.forEach { add($0.id) }
        let taskLinks = (journal.entry?.links ?? []).filter { $0.targetType == "task" }
        taskLinks.forEach { add($0.targetId) }
        for ref in Mentions.references(in: journal.text) {
            if let link = taskLinks.first(where: { $0.targetTitle == ref || $0.targetId == ref }) { add(link.targetId) }
        }
        return ids
    }

    var pendingIds: [String] { allTaskIds.filter { !(taskCache[$0]?.completed ?? false) } }
    var doneIds: [String] { allTaskIds.filter { taskCache[$0]?.completed ?? false } }
    var completionPercent: Int {
        let total = pendingIds.count + doneIds.count
        return total == 0 ? 0 : Int((Double(doneIds.count) / Double(total) * 100).rounded())
    }

    private func hydrateMissing() async {
        let missing = allTaskIds.filter { taskCache[$0] == nil }
        guard !missing.isEmpty, let tasks = try? await api.tasksBatch(ids: missing) else { return }
        merge(tasks)
    }

    // MARK: Ordering & grouping

    private func createdTime(_ id: String) -> Double {
        DayMath.parseServerTimestamp(taskCache[id]?.createdAt)?.timeIntervalSince1970 ?? 0
    }

    func sortByPosition(_ ids: [String]) -> [String] {
        ids.sorted { a, b in
            let pa = taskCache[a]?.position ?? .max, pb = taskCache[b]?.position ?? .max
            if pa != pb { return pa < pb }
            let ta = createdTime(a), tb = createdTime(b)
            if ta != tb { return ta < tb }
            return a < b
        }
    }

    private func preserveOrder(_ current: [String], _ next: [String]) -> [String] {
        let allowed = Set(next)
        let retained = current.filter { allowed.contains($0) }
        let retainedSet = Set(retained)
        return next.filter { !retainedSet.contains($0) } + retained
    }

    func syncManualLists() {
        let pending = sortByPosition(pendingIds), done = sortByPosition(doneIds)
        if !manualReady {
            manualPending = pending
            manualDone = done
            manualReady = allTaskIds.allSatisfy { taskCache[$0] != nil }
            return
        }
        manualPending = preserveOrder(manualPending, pending)
        manualDone = preserveOrder(manualDone, done)
    }

    func sorted(_ ids: [String]) -> [String] {
        switch taskSort {
        case .manual:
            return sortByPosition(ids)
        case .priority:
            return ids.sorted { a, b in
                let pa = taskCache[a]?.priority ?? 0, pb = taskCache[b]?.priority ?? 0
                if pa != pb { return pa > pb }
                return createdTime(a) > createdTime(b)
            }
        case .created:
            return ids.sorted { createdTime($0) > createdTime($1) }
        }
    }

    var pendingGroups: [Group] {
        let ids = taskSort == .manual ? manualPending.filter { pendingIds.contains($0) } : sorted(pendingIds)
        guard !ids.isEmpty else { return [] }
        switch taskGroup {
        case .none:
            return [Group(id: "all", label: "", ids: ids)]
        case .priority:
            var groups: [Group] = []
            for p in Priority.options {
                let list = ids.filter { (taskCache[$0]?.priority ?? 0) == p.rawValue }
                if !list.isEmpty { groups.append(Group(id: "p\(p.rawValue)", label: p.label, systemImage: p.symbol, priority: p.rawValue, ids: list)) }
            }
            let none = ids.filter { Priority(value: taskCache[$0]?.priority) == .none }
            if !none.isEmpty { groups.append(Group(id: "p0", label: "No priority", systemImage: "minus", priority: 0, ids: none)) }
            return groups
        case .created:
            var buckets: [String: [String]] = [:]
            for id in ids {
                let key = taskCache[id].map { String($0.createdAt.prefix(10)) }.flatMap { $0.isEmpty ? nil : $0 } ?? "unknown"
                buckets[key, default: []].append(id)
            }
            return buckets.keys.sorted(by: >).map { key in
                let label: String
                if key == days.today() { label = "Today" }
                else if key == days.offsetFromToday(-1) { label = "Yesterday" }
                else if key == "unknown" { label = "Unknown" }
                else { label = days.mediumLabel(key) }
                return Group(id: key, label: label, systemImage: "calendar", ids: buckets[key]!)
            }
        }
    }

    var sortedDoneIds: [String] { taskSort == .manual ? manualDone.filter { doneIds.contains($0) } : sorted(doneIds) }

    /// Drag-to-reorder within the pending list (custom order). One bulk request, all-or-nothing.
    func movePending(from source: IndexSet, to destination: Int) async {
        var pending = manualPending.filter { pendingIds.contains($0) }
        pending.move(fromOffsets: source, toOffset: destination)
        manualPending = pending
        await saveOrder()
    }

    private func saveOrder() async {
        let order = manualPending + manualDone
        guard !order.isEmpty, reorderState != .saving else { return }
        for (index, id) in order.enumerated() { taskCache[id]?.position = index }
        manualReady = true
        reorderState = .saving
        do {
            try await api.updateTaskPositions(order.enumerated().map { .init(id: $0.element, position: $0.offset) })
            reorderState = .saved
            try? await Task.sleep(for: .seconds(1.8))
            if reorderState == .saved { reorderState = .idle }
        } catch {
            reorderState = .failed
            app.showToast("Order could not be saved", detail: "No changes were written; try moving it again.", style: .error)
        }
    }

    /// Context-menu priority change (stands in for dragging between desktop board columns).
    func setPriority(_ id: String, _ priority: Int) async {
        guard let saved = await app.updateTask(id, ["priority": .int(priority)]) else { return }
        update(taskCache[id]?.merged(with: saved) ?? saved)
    }

    // MARK: Quick add

    /// Sheet-based add: due on the page's day unless chosen; mention appended to the journal.
    func addTask(_ result: QuickAddResult) async {
        do {
            let task = try await api.createTask(NewTask(title: result.title, workspaceId: workspaceId,
                                                        tags: result.tags.isEmpty ? nil : result.tags,
                                                        dueAt: result.dueAt ?? days.dueISO(selectedDate),
                                                        priority: result.priority, status: result.status))
            var subtasks: [TaskItem] = []
            for title in result.subtasks {
                if let sub = try? await api.createTask(NewTask(title: title, parentId: task.id, workspaceId: workspaceId)) { subtasks.append(sub) }
            }
            var stored = task
            stored.subtasks = subtasks
            taskCache[task.id] = stored
            let mention = "@[\(task.title)]"
            let current = journal.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if journal.canEdit { journal.edit(current.isEmpty ? mention : "\(journal.text)\n\(mention)") }
            if let entry = journal.entry {
                try? await api.createLink(sourceType: "diary", sourceId: entry.id, targetType: "task", targetId: task.id)
                journal.appendLocalLink(LinkItem(targetType: "task", targetId: task.id, targetTitle: task.title))
            }
            entryDates.insert(selectedDate)
            syncManualLists()
        } catch {
            app.showError("Task could not be added", error)
        }
    }

    /// Per-priority-group rapid add with an optimistic row and a client-minted id.
    func quickAdd(title raw: String, priority: Int) async {
        let title = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        let id = UUID().uuidString.lowercased()
        let due = days.dueISO(selectedDate)
        taskCache[id] = TaskItem(pendingId: id, title: title, priority: priority, status: .now, dueAt: due, workspaceId: workspaceId)
        journal.appendLocalLink(LinkItem(targetType: "task", targetId: id, targetTitle: title))
        entryDates.insert(selectedDate)
        syncManualLists()
        do {
            var task = try await api.createTask(NewTask(id: id, title: title, workspaceId: workspaceId, dueAt: due, priority: priority, status: .now))
            task.subtasks = []
            taskCache[id] = task
            if let entry = journal.entry {
                try? await api.createLink(sourceType: "diary", sourceId: entry.id, targetType: "task", targetId: id)
            }
        } catch {
            taskCache.removeValue(forKey: id)
            journal.removeLocalLinks(targetId: id)
            app.showToast("Task could not be added", detail: "Nothing was saved; try again.", style: .error)
        }
        syncManualLists()
    }

    // MARK: Journal editing

    func beginEditing() {
        guard journal.recoveryDraft == nil else {
            app.showToast("Restore or discard the unsaved writing first")
            return
        }
        editMode = true
    }

    /// Leaving the editor converts checklist lines into tasks, then saves (web `exitEditMode`).
    func endEditing() async {
        guard editMode else { return }
        await convertChecklist()
        await journal.flush()
        editMode = false
    }

    private func leaveEditing() async {
        if editMode {
            await endEditing()
        } else {
            await journal.flush()
        }
        await flushGoals()
    }

    private func convertChecklist() async {
        guard Checklist.hasChecklist(journal.text), let entry = journal.entry, journal.canEdit else { return }
        convertingChecklist = true
        defer { convertingChecklist = false }
        let items = Checklist.parse(journal.text)
        guard !items.isEmpty else { return }
        let parsed = Checklist.parsedInputs(items, days: days)
        do {
            try await api.tasksFromChecklist(items: parsed, sourceType: "diary", sourceId: entry.id, workspaceId: workspaceId, dueDate: selectedDate)
            let roots = zip(items, parsed).map { (original: $0.title, clean: $1.title) }
            journal.edit(Checklist.replaceWithMentions(journal.text, roots: roots))
            if let fresh = try? await api.diaryEntry(date: selectedDate, workspaceId: workspaceId) {
                merge(fresh.tasks ?? [])
                journal.refreshRelations(from: fresh)
                syncManualLists()
            }
        } catch {
            app.showError("Checklist could not be turned into tasks", error)
        }
    }

    func mentionPicked(_ item: MentionResult) async {
        guard let entry = journal.entry else { return }
        do {
            try await api.createLink(sourceType: "diary", sourceId: entry.id, targetType: item.type, targetId: item.id)
            journal.appendLocalLink(LinkItem(targetType: item.type, targetId: item.id, targetTitle: item.title))
            await hydrateMissing()
            syncManualLists()
        } catch {
            app.showError("Could not link that item", error)
        }
    }

    func restoreDraft() async {
        do {
            try await journal.restoreDraft()
            app.showToast("Unsaved writing restored", style: .success)
        } catch {
            app.showToast("Writing could not be restored", detail: "Your local copy is still safe.", style: .error)
        }
    }

    // MARK: Copy previous day

    func copyPrevious() async {
        let previous = days.addDays(selectedDate, -1)
        let entry = try? await api.diaryEntry(date: previous, workspaceId: workspaceId)
        guard let content = entry?.content, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            app.showToast("No notes on the previous page")
            return
        }
        previousContent = content
        if journal.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            await applyPrevious(append: false)
        } else {
            copyPreviousPrompt = true
        }
    }

    func applyPrevious(append: Bool) async {
        guard let source = previousContent?.trimmingCharacters(in: .whitespacesAndNewlines), !source.isEmpty, journal.canEdit else { return }
        let current = journal.text.trimmingCharacters(in: .whitespacesAndNewlines)
        journal.edit(append && !current.isEmpty ? "\(current)\n\n\(source)" : source)
        copyPreviousPrompt = false
        await journal.flush()
        app.showToast(append ? "Previous notes appended" : "Previous notes copied", style: .success)
    }

    // MARK: Day rail indicators

    func fetchIndicators() async {
        indicatorRequest += 1
        let request = indicatorRequest
        let window = windowDays
        guard let dates = try? await api.diaryDates(from: window.first!, to: window.last!, workspaceId: workspaceId),
              request == indicatorRequest else { return }
        entryDates = Set(dates)
    }

    // MARK: Goals

    var selectedWeekStart: String { days.startOfWeekSunday(selectedDate) }
    var goalsWeekLabel: String { days.weekRangeLabel(selectedWeekStart) }

    func fetchGoals() async {
        goalsRequest += 1
        let request = goalsRequest
        let week = selectedWeekStart
        let entry = try? await api.goals(weekStart: week, workspaceId: workspaceId)
        guard request == goalsRequest else { return }
        goals = entry
        goalsText = entry?.content ?? ""
        goalsEditing = false
    }

    func editGoals(_ text: String) {
        goalsText = text
        goalsSaveTask?.cancel()
        let week = selectedWeekStart, ws = workspaceId
        goalsSaving = true
        goalsSaveTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await persistGoals(week: week, content: text, workspaceId: ws)
        }
    }

    private func persistGoals(week: String, content: String, workspaceId: String?) async {
        do {
            try await api.saveGoals(weekStart: week, content: content, workspaceId: workspaceId)
            if goals?.weekStart == week { goals?.content = content }
        } catch {
            app.showToast("Goals could not be saved", detail: "Your writing is still here; try again in a moment.", style: .error)
        }
        goalsSaving = false
    }

    func flushGoals() async {
        guard goalsSaveTask != nil else { return }
        goalsSaveTask?.cancel()
        goalsSaveTask = nil
        guard let goals, goalsText != goals.content else {
            goalsSaving = false
            return
        }
        await persistGoals(week: goals.weekStart, content: goalsText, workspaceId: goals.workspaceId)
    }

    // MARK: Week summary

    var currentWeekStart: String { days.startOfWeekSunday(days.today()) }

    func openWeekSummary() async {
        todayDate = days.today()
        weekStart = currentWeekStart
        async let week: Void = loadWeek()
        async let out: Void = loadOutstanding()
        _ = await (week, out)
    }

    func shiftWeek(_ delta: Int) async {
        let next = days.addDays(weekStart, delta * 7)
        guard next <= currentWeekStart else { return }
        weekStart = next
        await loadWeek()
    }

    func loadWeek() async {
        guard !weekStart.isEmpty else { return }
        weekLoading = true
        defer { weekLoading = false }
        weekTasks = (try? await api.completedTasks(from: weekStart, to: days.addDays(weekStart, 6), workspaceId: workspaceId)) ?? []
    }

    func loadOutstanding() async {
        outstandingLoading = true
        defer { outstandingLoading = false }
        outstanding = (try? await api.outstandingTasks(workspaceId: workspaceId)) ?? []
    }

    var weekDays: [WeekDay] {
        guard !weekStart.isEmpty else { return [] }
        return (0..<7).map { offset in
            let date = days.addDays(weekStart, offset)
            let tasks = weekTasks.filter { days.localDay(ofServerTimestamp: $0.completedAt) == date }
            return WeekDay(date: date, label: "\(days.weekdayShort(date)) \(days.dayNumber(date))", isToday: date == todayDate,
                           groups: Self.groupCompleted(tasks), count: tasks.count)
        }
    }

    var weekTotal: Int { weekDays.reduce(0) { $0 + $1.count } }

    /// Subtasks grouped under their parent; a parent completed the same day merges with them.
    static func groupCompleted(_ tasks: [CompletedTask]) -> [CompletedGroup] {
        var order: [String] = []
        var groups: [String: CompletedGroup] = [:]
        for task in tasks {
            let key = task.parentId ?? task.id
            if groups[key] == nil {
                groups[key] = CompletedGroup(id: key, parentTitle: nil, parentDisplayId: nil, parentCompletedThisDay: false, subtasks: [])
                order.append(key)
            }
            if task.parentId != nil {
                groups[key]!.subtasks.append(task)
                if groups[key]!.parentTitle == nil, let title = task.parentTitle {
                    groups[key]!.parentTitle = title
                    groups[key]!.parentDisplayId = task.parentDisplayId
                }
            } else {
                groups[key]!.parentTitle = task.title
                groups[key]!.parentDisplayId = task.displayId
                groups[key]!.parentCompletedThisDay = true
            }
        }
        return order.compactMap { groups[$0] }
    }
}
