import DaybookKit
import SwiftUI

/// Port of `pages/tasks/index.vue`.
@MainActor
@Observable
final class TasksModel {
    struct Group: Identifiable {
        var id: String
        var label: String
        var systemImage: String?
        var emoji: String?
        var tasks: [TaskItem]
    }

    private let app: AppModel
    private(set) var tasks: [TaskItem] = []
    private(set) var loading = false
    private(set) var loadError: String?
    var showArchived = false
    var showDone: Bool
    var orderBy: Preferences.TaskOrderBy
    var groupBy: Preferences.TaskGroupBy
    var selection: Set<String> = []
    /// Inline subtask expansion (web `TaskItem` loads subtasks lazily when expanded).
    var expanded: Set<String> = []
    private(set) var subtasks: [String: [TaskItem]] = [:]

    init(app: AppModel) {
        self.app = app
        showDone = app.prefs.taskShowDone
        orderBy = app.prefs.taskOrderBy
        groupBy = app.prefs.taskGroupBy
    }

    private var api: APIClient { app.api! }

    func load() async {
        loading = true
        defer { loading = false }
        do {
            tasks = try await api.tasks(workspaceId: app.activeWorkspaceId, archived: showArchived)
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
        }
    }

    var sorted: [TaskItem] {
        let list = showDone ? tasks : tasks.filter { !$0.completed }
        func time(_ raw: String?) -> Double { DayMath.parseServerTimestamp(raw)?.timeIntervalSince1970 ?? 0 }
        switch orderBy {
        case .due:
            // Stable: tasks without a due date keep server order at the end.
            return list.enumerated().sorted { a, b in
                switch (a.element.dueAt, b.element.dueAt) {
                case (nil, nil): return a.offset < b.offset
                case (nil, _): return false
                case (_, nil): return true
                case let (x?, y?):
                    let tx = time(x), ty = time(y)
                    return tx == ty ? a.offset < b.offset : tx < ty
                }
            }.map(\.element)
        case .created:
            return list.sorted { a, b in
                if a.completed != b.completed { return !a.completed }
                if a.pinned != b.pinned { return a.pinned }
                return time(a.createdAt) > time(b.createdAt)
            }
        }
    }

    var groups: [Group] {
        let list = sorted
        switch groupBy {
        case .none:
            return [Group(id: "all", label: "", tasks: list)]
        case .status:
            return [TaskStatus.now, .next, .done].compactMap { status in
                let items = list.filter { $0.status == status }
                return items.isEmpty ? nil : Group(id: status.rawValue, label: status.label,
                                                   systemImage: status == .done ? "checkmark.circle" : status == .now ? "circle.inset.filled" : "circle", tasks: items)
            }
        case .priority:
            var out: [Group] = Priority.options.compactMap { p in
                let items = list.filter { $0.priority == p.rawValue }
                return items.isEmpty ? nil : Group(id: "p\(p.rawValue)", label: p.label, systemImage: p.symbol, tasks: items)
            }
            let none = list.filter { Priority(value: $0.priority) == .none }
            if !none.isEmpty { out.append(Group(id: "p0", label: "No priority", systemImage: "minus", tasks: none)) }
            return out
        case .tag:
            var order: [String] = []
            var byKey: [String: Group] = [:]
            for task in list {
                let tags = task.resolvedTags
                if tags.isEmpty {
                    if byKey["untagged"] == nil { order.append("untagged"); byKey["untagged"] = Group(id: "untagged", label: "Untagged", tasks: []) }
                    byKey["untagged"]!.tasks.append(task)
                }
                for tag in tags {
                    if byKey[tag.key] == nil { order.append(tag.key); byKey[tag.key] = Group(id: tag.key, label: tag.label, emoji: tag.emoji, tasks: []) }
                    byKey[tag.key]!.tasks.append(task)
                }
            }
            return order.compactMap { byKey[$0] }.sorted { TaskTags.groupOrder(($0.id, $0.label), ($1.id, $1.label)) }
        }
    }

    func toggleExpanded(_ task: TaskItem) async {
        if expanded.contains(task.id) {
            expanded.remove(task.id)
            return
        }
        expanded.insert(task.id)
        if let full = try? await api.task(id: task.id) { subtasks[task.id] = full.subtasks ?? [] }
    }

    func toggleSubtask(_ sub: TaskItem, parentId: String) async {
        guard var list = subtasks[parentId], let index = list.firstIndex(where: { $0.id == sub.id }) else { return }
        list[index].completed.toggle()
        subtasks[parentId] = list
        if let saved = await app.setCompleted(sub, list[index].completed) {
            subtasks[parentId]?[index] = sub.merged(with: saved)
        }
        if let i = tasks.firstIndex(where: { $0.id == parentId }) {
            tasks[i].subtaskDone = subtasks[parentId]?.filter(\.completed).count ?? tasks[i].subtaskDone
        }
    }

    func replace(_ task: TaskItem) {
        if let index = tasks.firstIndex(where: { $0.id == task.id }) { tasks[index] = tasks[index].merged(with: task) }
    }

    func add(_ result: QuickAddResult) async {
        do {
            let task = try await api.createTask(NewTask(title: result.title, workspaceId: app.activeWorkspaceId,
                                                        tags: result.tags.isEmpty ? nil : result.tags, dueAt: result.dueAt,
                                                        priority: result.priority, status: result.status))
            for title in result.subtasks {
                _ = try? await api.createTask(NewTask(title: title, parentId: task.id, workspaceId: app.activeWorkspaceId))
            }
            await load()
        } catch {
            app.showError("Task could not be added", error)
        }
    }

    func toggle(_ task: TaskItem) async {
        var optimistic = task
        optimistic.completed.toggle()
        optimistic.status = optimistic.completed ? .done : .next
        replace(optimistic)
        if let saved = await app.setCompleted(task, optimistic.completed) { replace(saved) }
    }

    func togglePin(_ task: TaskItem) async {
        guard let saved = try? await api.setTaskPinned(id: task.id, !task.pinned) else {
            app.showToast("Could not update that task", style: .error)
            return
        }
        replace(saved)
    }

    func archiveOrRestore(_ task: TaskItem) async {
        do {
            _ = showArchived ? try await api.toggleTaskArchived(id: task.id) : try await api.archiveTask(id: task.id)
            tasks.removeAll { $0.id == task.id }
        } catch {
            app.showError(showArchived ? "Could not restore that task" : "Could not archive that task", error)
        }
    }

    /// Flat-list drag reorder (no grouping): writes the new positions in one request.
    func move(from source: IndexSet, to destination: Int) async {
        var list = sorted
        list.move(fromOffsets: source, toOffset: destination)
        let items = list.enumerated().filter { $0.element.position != $0.offset }.map { APIClient.PositionItem(id: $0.element.id, position: $0.offset) }
        for (index, task) in list.enumerated() {
            if let i = tasks.firstIndex(where: { $0.id == task.id }) { tasks[i].position = index }
        }
        // Keep the visual order the person chose until the next load.
        tasks = list + tasks.filter { t in !list.contains(where: { $0.id == t.id }) }
        guard !items.isEmpty else { return }
        do {
            try await api.updateTaskPositions(items)
        } catch {
            app.showToast("Order could not be saved", detail: "No changes were written; try moving it again.", style: .error)
            await load()
        }
    }

    // MARK: Bulk

    func bulk(_ patch: JSONObject, label: String) async {
        let ids = Array(selection)
        guard !ids.isEmpty else { return }
        await withTaskGroup(of: TaskItem?.self) { group in
            for id in ids { group.addTask { await self.app.updateTask(id, patch) } }
            for await result in group { if let result { replace(result) } }
        }
        app.showToast("Updated \(ids.count) task\(ids.count == 1 ? "" : "s")", detail: label, style: .success)
    }

    func bulkArchive() async {
        let ids = Array(selection)
        guard !ids.isEmpty else { return }
        let restoring = showArchived
        await withTaskGroup(of: Void.self) { group in
            for id in ids { group.addTask { _ = try? await self.api.toggleTaskArchived(id: id) } }
        }
        tasks.removeAll { ids.contains($0.id) }
        selection = []
        app.showToast("\(restoring ? "Restored" : "Archived") \(ids.count) task\(ids.count == 1 ? "" : "s")", style: .success)
    }
}

struct TasksView: View {
    @Environment(AppModel.self) private var app
    @State private var model: TasksModel?

    var body: some View {
        NavigationStack {
            Group {
                if let model { TasksScreen(model: model) } else { ProgressView() }
            }
            .daybookDestinations()
        }
        .task {
            if model == nil { model = TasksModel(app: app) }
        }
    }
}

private struct TasksScreen: View {
    @Environment(AppModel.self) private var app
    @Bindable var model: TasksModel
    @State private var showAdd = false
    @State private var editMode: EditMode = .inactive

    private var selecting: Bool { editMode == .active }

    var body: some View {
        List(selection: $model.selection) {
            if let error = model.loadError {
                Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(.red)
            }
            ForEach(model.groups) { group in
                Section {
                    ForEach(group.tasks) { task in
                        rowActions(VStack(alignment: .leading, spacing: 4) {
                            row(task)
                            if model.expanded.contains(task.id) && !selecting {
                                subtaskRows(task)
                            }
                        }, task)
                        .tag(task.id)
                    }
                    .onMove(perform: model.groupBy == .none && !selecting ? { source, destination in
                        Task { await model.move(from: source, to: destination) }
                    } : nil)
                } header: {
                    if !group.label.isEmpty {
                        HStack(spacing: 6) {
                            if let emoji = group.emoji { Text(emoji) } else if let symbol = group.systemImage { Image(systemName: symbol) }
                            Text(group.label)
                            Text("\(group.tasks.count)").foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if !model.loading && model.groups.allSatisfy({ $0.tasks.isEmpty }) {
                ContentUnavailableView(model.showArchived ? "No archived tasks" : "No tasks",
                                       systemImage: model.showArchived ? "archivebox" : "checkmark.circle",
                                       description: Text(model.showArchived ? "Archived tasks show up here." : "Add one with the + button."))
            }
        }
        .environment(\.editMode, $editMode)
        .navigationTitle(model.showArchived ? "Archived" : "Tasks")
        .refreshable { await model.load() }
        .task { await model.load() }
        .onChange(of: app.activeWorkspaceId) { Task { await model.load() } }
        .onChange(of: model.showArchived) { Task { await model.load() } }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { WorkspaceMenu() }
            ToolbarItemGroup(placement: .topBarTrailing) {
                if !selecting {
                    NavigationLink(value: Route.calendar) { Image(systemName: "calendar") }
                        .accessibilityLabel("Calendar")
                        .accessibilityIdentifier("tasks.calendar")
                    viewMenu
                    if !model.showArchived {
                        Button { showAdd = true } label: { Image(systemName: "plus") }
                            .accessibilityLabel("New task")
                            .accessibilityIdentifier("tasks.add")
                    }
                } else {
                    Button("Done") { editMode = .inactive; model.selection = [] }
                }
            }
            if selecting {
                ToolbarItemGroup(placement: .bottomBar) { bulkBar }
            }
        }
        .sheet(isPresented: $showAdd) {
            QuickAddSheet(defaultStatus: .next) { result in await model.add(result) }
        }
    }

    private var viewMenu: some View {
        Menu {
            Picker("Order by", selection: $model.orderBy) {
                Label("Newest first", systemImage: "clock").tag(Preferences.TaskOrderBy.created)
                Label("Due date", systemImage: "calendar").tag(Preferences.TaskOrderBy.due)
            }
            Picker("Group by", selection: $model.groupBy) {
                Label("No grouping", systemImage: "list.bullet").tag(Preferences.TaskGroupBy.none)
                Label("By status", systemImage: "circle.inset.filled").tag(Preferences.TaskGroupBy.status)
                Label("By priority", systemImage: "flag").tag(Preferences.TaskGroupBy.priority)
                Label("By tag", systemImage: "number").tag(Preferences.TaskGroupBy.tag)
            }
            Divider()
            Toggle(isOn: $model.showDone) { Label("Show done", systemImage: "checkmark.circle") }
            Toggle(isOn: $model.showArchived) { Label("Archived", systemImage: "archivebox") }
            Button("Select tasks", systemImage: "checkmark.circle.badge.questionmark") { editMode = .active }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel("View options")
        .accessibilityIdentifier("tasks.view")
    }

    @ViewBuilder
    private var bulkBar: some View {
        Button("All") { model.selection = Set(model.sorted.map(\.id)) }
        Spacer()
        Menu("Status") {
            Button("Next", systemImage: "circle") { Task { await model.bulk(["status": "next"], label: "Status: Next") } }
            Button("Now", systemImage: "circle.inset.filled") { Task { await model.bulk(["status": "now"], label: "Status: Now") } }
            Button("Done", systemImage: "checkmark.circle") { Task { await model.bulk(["status": "done"], label: "Status: Done") } }
        }
        .disabled(model.selection.isEmpty)
        Spacer()
        Menu("Priority") {
            ForEach(Priority.options) { p in
                Button(p.label, systemImage: p.symbol) { Task { await model.bulk(["priority": .int(p.rawValue)], label: "Priority: \(p.label)") } }
            }
            Button("None", systemImage: "minus") { Task { await model.bulk(["priority": 0], label: "Priority: None") } }
        }
        .disabled(model.selection.isEmpty)
        Spacer()
        Button(model.showArchived ? "Restore" : "Archive") {
            Task {
                await model.bulkArchive()
                editMode = .inactive
            }
        }
        .disabled(model.selection.isEmpty)
    }


    private func rowActions<Content: View>(_ content: Content, _ task: TaskItem) -> some View {
        content
            .swipeActions(edge: .leading) {
                Button { Task { await model.toggle(task) } } label: {
                    Label(task.completed ? "Undo" : "Done", systemImage: task.completed ? "arrow.uturn.backward" : "checkmark")
                }
                .tint(.accentColor)
            }
            .swipeActions(edge: .trailing) {
                Button(role: model.showArchived ? nil : .destructive) { Task { await model.archiveOrRestore(task) } } label: {
                    Label(model.showArchived ? "Restore" : "Archive", systemImage: model.showArchived ? "tray.and.arrow.up" : "archivebox")
                }
                Button { Task { await model.togglePin(task) } } label: {
                    Label(task.pinned ? "Unpin" : "Pin", systemImage: task.pinned ? "pin.slash" : "pin")
                }
                .tint(Color("Warm"))
            }
            .contextMenu {
                Menu("Status") {
                    ForEach(TaskStatus.allCases, id: \.self) { status in
                        Button(status.label) {
                            Task { if let saved = await app.updateTask(task.id, ["status": .string(status.rawValue)]) { model.replace(saved) } }
                        }
                    }
                }
                Menu("Priority") {
                    ForEach(Priority.options) { p in
                        Button(p.label, systemImage: p.symbol) {
                            Task { if let saved = await app.updateTask(task.id, ["priority": .int(p.rawValue)]) { model.replace(saved) } }
                        }
                    }
                    Button("None", systemImage: "minus") {
                        Task { if let saved = await app.updateTask(task.id, ["priority": 0]) { model.replace(saved) } }
                    }
                }
            }
    }

    @ViewBuilder
    private func subtaskRows(_ task: TaskItem) -> some View {
        if let subs = model.subtasks[task.id] {
            ForEach(subs) { sub in
                HStack(spacing: 8) {
                    CompletionButton(completed: sub.completed) { Task { await model.toggleSubtask(sub, parentId: task.id) } }
                    Text(sub.title)
                        .font(.subheadline)
                        .strikethrough(sub.completed)
                        .foregroundStyle(sub.completed ? .secondary : .primary)
                    Spacer()
                    PriorityIcon(priority: sub.priority)
                }
                .padding(.leading, 42)
            }
        } else {
            ProgressView().padding(.leading, 42)
        }
    }

    private func row(_ task: TaskItem) -> some View {
        HStack(spacing: 10) {
            if !selecting {
                CompletionButton(completed: task.completed) { Task { await model.toggle(task) } }
                    .accessibilityIdentifier("task.toggle.\(task.title)")
            }
            NavigationLink(value: Route.task(task.id)) {
                TaskRow(task: task)
            }
            .navigationLinkIndicatorVisibility(task.subtaskCount > 0 ? .hidden : .automatic)
            .accessibilityIdentifier("task.row.\(task.title)")
            .disabled(selecting)
            if task.subtaskCount > 0 && !selecting {
                Button { Task { await model.toggleExpanded(task) } } label: {
                    Image(systemName: "chevron.right")
                        .rotationEffect(.degrees(model.expanded.contains(task.id) ? 90 : 0))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 32, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(model.expanded.contains(task.id) ? "Hide subtasks" : "Show subtasks")
            }
        }

    }
}
