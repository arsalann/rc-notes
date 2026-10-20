import DaybookKit
import SwiftUI

struct TodayView: View {
    @Environment(AppModel.self) private var app
    @State private var model: TodayModel?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let model {
                    TodayScreen(model: model)
                } else {
                    ProgressView()
                }
            }
            .daybookDestinations()
        }
        .task {
            guard model == nil else { return }
            let created = TodayModel(app: app)
            model = created
            let requested = app.requestedDiaryDate
            app.requestedDiaryDate = nil
            await created.start(date: requested)
        }
        .onChange(of: app.requestedDiaryDate) { _, date in
            guard let date, let model else { return }
            app.requestedDiaryDate = nil
            path = NavigationPath()
            Task { await model.open(date: date) }
        }
    }
}

private struct TodayScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    @Bindable var model: TodayModel
    @State private var showAddTask = false
    @State private var showWeek = false
    @State private var quickAddPriority: Int?
    @State private var quickAddTitle = ""
    @FocusState private var quickAddFocused: Bool
    @State private var confirmBulkDelete = false

    private var journal: JournalSession { model.journal }

    var body: some View {
        ScrollViewReader { proxy in
            List {
                Section {
                    WorkspaceChips(model: model)
                    DayRail(model: model)
                }
                .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))

                if let error = model.loadError {
                    Section {
                        Label(error, systemImage: "wifi.exclamationmark").foregroundStyle(.red)
                        Button("Try again") { Task { await model.reload() } }
                    }
                }

                if !model.carriedTasks.isEmpty {
                    Section {
                        HStack {
                            Label("\(model.carriedTasks.count) unfinished thread\(model.carriedTasks.count == 1 ? "" : "s") from your last page",
                                  systemImage: "arrow.uturn.forward")
                                .font(.subheadline)
                            Spacer()
                            Button("Review") { withAnimation { proxy.scrollTo("tasks", anchor: .top) } }
                                .buttonStyle(.borderless)
                        }
                        .foregroundStyle(Color("Warm"))
                        .accessibilityIdentifier("today.carried")
                    }
                }

                if app.prefs.todayShowGoals { goalsSection }
                if app.prefs.todayShowJournal { journalSection }
                if model.selecting {
                    selectSection.id("tasks")
                } else {
                    tasksSection.id("tasks")
                    doneSection
                }
            }
            .listStyle(.insetGrouped)
            .refreshable {
                await app.syncNow()
                await model.reload()
            }
            .animation(.snappy, value: model.selectedDate)
        }
        .navigationTitle(model.selectedDayLabel)
        .navigationBarTitleDisplayMode(.large)
        .toolbar { toolbar }
        .sheet(isPresented: $showAddTask) {
            QuickAddSheet(defaultStatus: .now, defaultDueDay: model.selectedDate, onAdd: { result in
                await model.addTask(result)
            }, onTemplate: { template in
                await model.addFromTemplate(template)
            })
        }
        .bulkDeleteConfirmation(count: model.selection.count, isPresented: $confirmBulkDelete) {
            Task { await model.bulkDelete() }
        }
        .sheet(isPresented: $showWeek) {
            WeekSummaryView(model: model)
        }
        .confirmationDialog("Copy notes from the previous day?", isPresented: $model.copyPreviousPrompt, titleVisibility: .visible) {
            Button("Append to this page") { Task { await model.applyPrevious(append: true) } }
            Button("Replace this page", role: .destructive) { Task { await model.applyPrevious(append: false) } }
        } message: {
            Text("This page already has writing.")
        }
        .alert("Diary could not be saved", isPresented: Binding(get: { journal.saveError != nil }, set: { if !$0 { journal.saveError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(journal.saveError ?? "")
        }
        .onChange(of: app.activeWorkspaceId) {
            Task { await model.reload() }
        }
        .onChange(of: app.store?.revision) { model.storeChanged() }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background, .inactive:
                journal.checkpointCurrent()
                Task { await journal.flush(); await model.flushGoals() }
            case .active:
                model.refreshToday()
            @unknown default: break
            }
        }
        .onDisappear {
            journal.checkpointCurrent()
            Task { await journal.flush() }
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarLeading) {
            SyncBadge()
            if model.selectedDate != model.todayDate {
                Button("Today") { Task { await model.goToToday() } }
                    .accessibilityIdentifier("today.jump")
            }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            if model.selecting {
                Button("Done") { model.toggleSelecting() }
                    .accessibilityIdentifier("today.selectDone")
            } else {
            NavigationLink(value: Route.search) { Image(systemName: "magnifyingglass") }
                .accessibilityLabel("Search")
            Button {
                showWeek = true
            } label: {
                Image(systemName: "chart.bar.doc.horizontal")
            }
            .accessibilityLabel("Week summary")
            .accessibilityIdentifier("today.week")
            Menu {
                Picker("Sort", selection: $model.taskSort) {
                    Label("Custom order", systemImage: "line.3.horizontal").tag(Preferences.DiaryTaskSort.manual)
                    Label("Newest first", systemImage: "clock").tag(Preferences.DiaryTaskSort.created)
                    Label("Priority first", systemImage: "flag").tag(Preferences.DiaryTaskSort.priority)
                }
                Picker("Group", selection: $model.taskGroup) {
                    Label("No grouping", systemImage: "list.bullet").tag(TodayModel.TaskGroup.none)
                    Label("By created date", systemImage: "calendar").tag(TodayModel.TaskGroup.created)
                    Label("By priority", systemImage: "flag").tag(TodayModel.TaskGroup.priority)
                }
                Divider()
                Toggle(isOn: $model.hideDone) { Label("Hide done", systemImage: "eye.slash") }
                Button(model.subtasksExpanded ? "Collapse all subtasks" : "Expand all subtasks",
                       systemImage: model.subtasksExpanded ? "chevron.up" : "chevron.down") {
                    model.subtasksExpanded.toggle()
                }
            } label: {
                Image(systemName: "line.3.horizontal.decrease.circle")
            }
            .accessibilityLabel("View options")
            Button {
                model.toggleSelecting()
            } label: {
                Image(systemName: "checkmark.circle")
            }
            .disabled(model.allTaskIds.isEmpty)
            .accessibilityLabel("Select tasks")
            .accessibilityIdentifier("today.select")
            }
        }
        if model.selecting {
            ToolbarItem(placement: .bottomBar) {
                BulkBar(allSelected: !model.selectableIds.isEmpty && model.selection.count == model.selectableIds.count,
                        count: model.selection.count, busy: model.bulkBusy,
                        onToggleAll: model.toggleSelectAll,
                        onStatus: { status in Task { await model.bulkUpdate(["status": .string(status.rawValue)], label: "Status: \(status.rawValue.capitalized)") } },
                        onPriority: { p in Task { await model.bulkUpdate(["priority": .int(p)], label: "Priority: \(Priority(value: p).label)") } },
                        onArchive: { Task { await model.bulkArchive() } },
                        onDelete: { confirmBulkDelete = true })
            }
        }
    }

    // MARK: Select mode

    private var selectSection: some View {
        Section {
            ForEach(model.selectableIds, id: \.self) { id in
                let selected = model.selection.contains(id)
                let task = model.taskCache[id]
                Button {
                    model.toggleSelected(id)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(selected ? Color.accentColor : .secondary)
                        Text(task?.title ?? "Loading…")
                            .strikethrough(task?.completed ?? false)
                            .foregroundStyle((task?.completed ?? false) ? .secondary : .primary)
                            .lineLimit(2)
                        Spacer()
                        if let count = task?.subtasks?.count, count > 0 {
                            Text("+\(count)").font(.caption).foregroundStyle(.secondary)
                        }
                        if let p = task?.priority, p > 0 {
                            Image(systemName: Priority(value: p).symbol).foregroundStyle(Priority(value: p).color)
                        }
                    }
                    .frame(minHeight: 36)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
                .accessibilityIdentifier("today.selectRow.\(task?.title ?? id)")
            }
            if model.selectableIds.isEmpty {
                Text("No tasks for this day.").foregroundStyle(.secondary)
            }
        } header: {
            Label("\(model.selection.count) selected", systemImage: "checkmark.circle")
        }
    }

    // MARK: Goals

    private var goalsSection: some View {
        Section {
            if model.goalsExpanded {
                if model.goalsEditing {
                    TextEditor(text: Binding(get: { model.goalsText }, set: { model.editGoals($0) }))
                        .frame(minHeight: 120)
                        .accessibilityIdentifier("goals.editor")
                    Button("Done") {
                        model.goalsEditing = false
                        Task { await model.flushGoals() }
                    }
                } else {
                    Button {
                        model.goalsEditing = true
                    } label: {
                        Group {
                            if model.goalsText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Text("What matters this week?").foregroundStyle(.tertiary)
                            } else {
                                MarkdownText(source: Markdown.cleaned(model.goalsText))
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("goals.preview")
                }
            }
        } header: {
            HStack {
                CollapsibleHeader(title: "Goals", systemImage: "target", isExpanded: $model.goalsExpanded)
                Text(model.goalsWeekLabel).font(.caption).foregroundStyle(.secondary)
                if model.goalsSaving { ProgressView().controlSize(.mini) }
            }
        }
    }

    // MARK: Journal

    private var journalSection: some View {
        Section {
            if model.journalExpanded {
                if let draft = journal.recoveryDraft {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Unsaved writing from \(draftTime(draft)) was found on this device.", systemImage: "clock.arrow.circlepath")
                            .font(.subheadline)
                            .foregroundStyle(Color("Warm"))
                        Text(draft.content).font(.footnote).foregroundStyle(.secondary).lineLimit(4)
                        HStack {
                            Button("Restore") { Task { await model.restoreDraft() } }
                                .buttonStyle(.borderedProminent)
                                .accessibilityIdentifier("journal.restore")
                            Button("Discard", role: .destructive) { journal.discardDraft() }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("journal.discard")
                        }
                    }
                    .padding(.vertical, 4)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("journal.recovery")
                }

                if model.editMode {
                    MentionEditor(
                        text: Binding(get: { journal.text }, set: { journal.edit($0) }),
                        placeholder: "Write about your day… use @ to mention a task, - [ ] for a checklist",
                        minHeight: 200,
                        identifier: "journal.editor"
                    ) { item in
                        Task { await model.mentionPicked(item) }
                    }
                    HStack {
                        if model.convertingChecklist { ProgressView().controlSize(.small); Text("Creating tasks…").font(.caption) }
                        Spacer()
                        Button("Done") { Task { await model.endEditing() } }
                            .buttonStyle(.borderedProminent)
                            .accessibilityIdentifier("journal.done")
                    }
                } else if journal.isLoading {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Button {
                        model.beginEditing()
                    } label: {
                        let visible = Markdown.cleaned(Mentions.stripped(journal.text))
                        Group {
                            if visible.isEmpty {
                                Text("Tap to write…").foregroundStyle(.tertiary)
                            } else {
                                MarkdownText(source: visible)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 60, alignment: .topLeading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("journal.preview")
                    .accessibilityValue(journal.text)
                }
            }
        } header: {
            HStack {
                CollapsibleHeader(title: "Journal", systemImage: "book", isExpanded: $model.journalExpanded)
                if journal.isSaving {
                    ProgressView().controlSize(.mini).accessibilityIdentifier("journal.saving")
                }
                Menu {
                    Button("Copy from previous day", systemImage: "doc.on.doc") { Task { await model.copyPrevious() } }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .disabled(!journal.canEdit)
                .accessibilityLabel("Journal options")
            }
        }
    }

    private func draftTime(_ draft: DiaryDraft) -> String {
        guard let date = DayMath.parseServerTimestamp(draft.savedAt) else { return "earlier" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    // MARK: Tasks

    private var tasksSection: some View {
        Section {
            if model.pendingGroups.isEmpty && model.doneIds.isEmpty && !journal.isLoading {
                Text("No tasks for this day yet.").foregroundStyle(.secondary)
            }
            ForEach(model.pendingGroups) { group in
                if !group.label.isEmpty {
                    groupHeader(group)
                }
                if !model.collapsedGroups.contains(group.id) {
                    ForEach(group.ids, id: \.self) { id in
                        taskRow(id)
                    }
                    .onMove(perform: model.taskSort == .manual && model.taskGroup == .none ? { source, destination in
                        Task { await model.movePending(from: source, to: destination) }
                    } : nil)
                    if let priority = group.priority, quickAddPriority == priority {
                        quickAddRow(priority)
                    }
                }
            }
            if model.taskGroup != .priority {
                Button {
                    showAddTask = true
                } label: {
                    Label("Add task", systemImage: "plus.circle.fill")
                }
                .accessibilityIdentifier("today.addTask")
            }
        } header: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Label("Tasks", systemImage: "checklist")
                    Spacer()
                    Text("\(model.pendingIds.count) open · \(model.doneIds.count) done")
                        .monospacedDigit()
                        .accessibilityIdentifier("today.taskCounts")
                }
                if !model.allTaskIds.isEmpty {
                    ProgressView(value: Double(model.completionPercent), total: 100)
                        .accessibilityLabel("\(model.completionPercent) percent done")
                }
                switch model.reorderState {
                case .saving: Text("Saving order…").font(.caption2)
                case .saved: Text("Order saved").font(.caption2)
                case .failed: Text("Order could not be saved").font(.caption2).foregroundStyle(.red)
                case .idle: EmptyView()
                }
            }
        }
    }

    private func groupHeader(_ group: TodayModel.Group) -> some View {
        HStack {
            Button {
                if model.collapsedGroups.contains(group.id) { model.collapsedGroups.remove(group.id) } else { model.collapsedGroups.insert(group.id) }
            } label: {
                HStack(spacing: 6) {
                    if let symbol = group.systemImage { Image(systemName: symbol).foregroundStyle(Priority(value: group.priority).color) }
                    Text(group.label).font(.subheadline.weight(.semibold))
                    Text("\(group.ids.count)").font(.caption).foregroundStyle(.secondary)
                    Image(systemName: "chevron.right")
                        .rotationEffect(.degrees(model.collapsedGroups.contains(group.id) ? 0 : 90))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.borderless)
            Spacer()
            if let priority = group.priority {
                Button {
                    quickAddPriority = quickAddPriority == priority ? nil : priority
                    quickAddTitle = ""
                    model.collapsedGroups.remove(group.id)
                    quickAddFocused = quickAddPriority != nil
                } label: {
                    Image(systemName: "plus")
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Add \(group.label) task")
            }
        }
        .moveDisabled(true)
    }

    private func quickAddRow(_ priority: Int) -> some View {
        TextField("New \(Priority(value: priority).label.lowercased()) task", text: $quickAddTitle)
            .focused($quickAddFocused)
            .submitLabel(.next)
            .onSubmit {
                let title = quickAddTitle
                quickAddTitle = ""
                quickAddFocused = true
                Task { await model.quickAdd(title: title, priority: priority) }
            }
            .moveDisabled(true)
    }

    @ViewBuilder
    private func taskRow(_ id: String) -> some View {
        if let task = model.taskCache[id] {
            InlineTaskRow(task: task, hideDoneSubtasks: model.hideDone, showTags: false, showPriority: model.taskGroup != .priority,
                          subtasksExpanded: model.subtasksExpanded) { updated in
                model.update(updated)
            }
            .id("\(id)-\(model.subtasksExpanded)")
            .contextMenu {
                if !task.isPending {
                    Menu("Priority") {
                        ForEach(Priority.options) { p in
                            Button(p.label, systemImage: p.symbol) { Task { await model.setPriority(id, p.rawValue) } }
                        }
                        Button("None", systemImage: "minus") { Task { await model.setPriority(id, 0) } }
                    }
                }
            }
        } else {
            HStack {
                ProgressView().controlSize(.small)
                Text("Loading task…").foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var doneSection: some View {
        if !model.hideDone && !model.sortedDoneIds.isEmpty {
            Section {
                if model.doneExpanded {
                    ForEach(model.sortedDoneIds, id: \.self) { id in taskRow(id) }
                }
            } header: {
                CollapsibleHeader(title: "Done", systemImage: "checkmark.circle", count: model.sortedDoneIds.count, isExpanded: $model.doneExpanded)
            }
        }
    }
}

/// "All" + each workspace (filters the whole page).
private struct WorkspaceChips: View {
    @Environment(AppModel.self) private var app
    let model: TodayModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("All", id: nil)
                ForEach(app.workspaces) { ws in chip(ws.label, id: ws.id) }
            }
        }
    }

    private func chip(_ label: String, id: String?) -> some View {
        let selected = app.activeWorkspaceId == id
        return Button {
            guard !selected else { return }
            Task {
                await model.prepareForWorkspaceChange()
                app.activeWorkspaceId = id
            }
        } label: {
            Text(label)
                .font(.subheadline.weight(selected ? .semibold : .regular))
                .padding(.horizontal, 12)
                .frame(minHeight: 34)
                .background(selected ? Color.accentColor.opacity(0.16) : Color.secondary.opacity(0.08), in: Capsule())
                .overlay(Capsule().strokeBorder(selected ? Color.accentColor.opacity(0.5) : .clear))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("workspace.chip.\(id == nil ? "All" : (app.workspace(id)?.name ?? ""))")
    }
}

/// Seven-day rail with content dots and prev/next arrows.
private struct DayRail: View {
    @Environment(AppModel.self) private var app
    let model: TodayModel

    var body: some View {
        HStack(spacing: 2) {
            Button { Task { await model.shiftDay(-1) } } label: {
                Image(systemName: "chevron.left").frame(width: 28, height: 44)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Previous day")
            .accessibilityIdentifier("day.previous")
            ForEach(model.windowDays, id: \.self) { date in
                let selected = date == model.selectedDate
                let isToday = date == model.todayDate
                Button {
                    Task { await model.selectDay(date) }
                } label: {
                    VStack(spacing: 3) {
                        Text(app.days.weekdayShort(date)).font(.caption2).foregroundStyle(.secondary)
                        Text("\(app.days.dayNumber(date))")
                            .font(.callout.weight(selected || isToday ? .bold : .regular))
                            .foregroundStyle(isToday ? Color.accentColor : .primary)
                        Circle()
                            .fill(model.hasContent(date) ? Color("Warm") : .clear)
                            .frame(width: 5, height: 5)
                    }
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(selected ? Color.accentColor.opacity(0.15) : .clear, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(alignment: .bottom) {
                        if selected { Capsule().fill(Color.accentColor).frame(width: 18, height: 2.5) }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(app.days.longLabel(date))\(model.hasContent(date) ? ", has writing" : "")")
                .accessibilityAddTraits(selected ? .isSelected : [])
                .accessibilityIdentifier("day.\(date)")
            }
            Button { Task { await model.shiftDay(1) } } label: {
                Image(systemName: "chevron.right").frame(width: 28, height: 44)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Next day")
            .accessibilityIdentifier("day.next")
        }
        .disabled(model.navigating)
    }
}
