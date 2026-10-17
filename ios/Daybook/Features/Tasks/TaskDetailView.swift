import DaybookKit
import SwiftUI
import UIKit

/// Port of `pages/tasks/[id].vue`.
struct TaskDetailView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let taskId: String

    @State private var task: TaskItem?
    @State private var loadError: String?
    @State private var title = ""
    @State private var descriptionText = ""
    @State private var tags: [String] = []
    @State private var newTag = ""
    @State private var newSubtask = ""
    @State private var links: [LinkItem] = []
    @State private var linkedNoteContent: String?
    @State private var confirmArchive = false
    @State private var pickDue = false
    @State private var dueDate = Date()
    @State private var subtaskCandidates: [MentionResult] = []
    @State private var openNoteId: String?
    @FocusState private var focus: Field?

    private enum Field { case title, description, subtask, tag }

    private var repo: Repository { app.repo! }
    private var subtasks: [TaskItem] { task?.subtasks ?? [] }
    private var linkedNote: LinkItem? { links.first { $0.targetType == "note" } }

    var body: some View {
        Group {
            if let task {
                form(task)
            } else if let loadError {
                ContentUnavailableView("Task unavailable", systemImage: "exclamationmark.triangle", description: Text(loadError))
            } else {
                ProgressView()
            }
        }
        .navigationTitle(task?.displayId ?? "Task")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: app.store?.revision) { Task { await refresh() } }
        .navigationDestination(item: $openNoteId) { NoteDetailView(noteId: $0) }
    }

    // MARK: Form

    private func form(_ task: TaskItem) -> some View {
        Form {
            Section {
                HStack(alignment: .top, spacing: 10) {
                    CompletionButton(completed: task.completed) { Task { await toggleComplete() } }
                        .accessibilityIdentifier("detail.complete")
                    TextField("Title", text: $title, axis: .vertical)
                        .font(.title3.weight(.semibold))
                        .focused($focus, equals: .title)
                        .submitLabel(.done)
                        .onSubmit { Task { await saveTitle() } }
                        .accessibilityIdentifier("detail.title")
                }
                Menu {
                    Button("No workspace", systemImage: "circle.slash") { Task { await patch(["workspace_id": .null]) } }
                    ForEach(app.workspaces) { ws in
                        Button(ws.label) { Task { await patch(["workspace_id": .string(ws.id)]) } }
                    }
                } label: {
                    LabeledContent("Workspace", value: app.workspace(task.workspaceId)?.label ?? "No workspace")
                }
                if let parent = task.parentTitle, let parentId = task.parentId {
                    NavigationLink(value: Route.task(parentId)) {
                        LabeledContent("Parent", value: parent)
                    }
                }
            }

            Section("Status") {
                Picker("Status", selection: Binding(get: { task.status }, set: { s in Task { await patch(["status": .string(s.rawValue)]) } })) {
                    ForEach(TaskStatus.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("detail.status")
            }

            Section("Priority") {
                Picker("Priority", selection: Binding(get: { task.priority }, set: { p in Task { await patch(["priority": .int(p)]) } })) {
                    ForEach(Priority.options) { p in Label(p.label, systemImage: p.symbol).tag(p.rawValue) }
                    Label("None", systemImage: "minus").tag(0)
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }

            subtasksSection

            Section("Description") {
                TextField("Add details", text: $descriptionText, axis: .vertical)
                    .lineLimit(3...12)
                    .focused($focus, equals: .description)
                    .accessibilityIdentifier("detail.description")
            }

            dueSection(task)
            tagsSection(task)
            noteSection
        }
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: focus) { old, _ in
            if old == .title { Task { await saveTitle() } }
            if old == .description { Task { await saveDescription() } }
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { copyAsMarkdown() } label: { Image(systemName: "doc.on.doc") }
                    .accessibilityLabel("Copy as markdown")
                Button { Task { await togglePin() } } label: { Image(systemName: task.pinned ? "pin.fill" : "pin") }
                    .accessibilityLabel(task.pinned ? "Unpin" : "Pin")
                Button(role: .destructive) { confirmArchive = true } label: { Image(systemName: "archivebox") }
                    .accessibilityLabel("Archive")
                    .accessibilityIdentifier("detail.archive")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focus = nil }
            }
        }
        .confirmationDialog("Archive this task?", isPresented: $confirmArchive, titleVisibility: .visible) {
            Button("Archive task and subtasks", role: .destructive) { Task { await archive() } }
        }
    }

    private var subtasksSection: some View {
        Section {
            if !subtasks.isEmpty {
                ProgressView(value: Double(subtasks.filter(\.completed).count), total: Double(subtasks.count))
            }
            ForEach(subtasks) { sub in
                HStack(spacing: 8) {
                    CompletionButton(completed: sub.completed) { Task { await toggleSubtask(sub) } }
                    TagEmojis(tags: sub.resolvedTags)
                    NavigationLink(value: Route.task(sub.id)) {
                        HStack {
                            Text(sub.title).strikethrough(sub.completed).foregroundStyle(sub.completed ? .secondary : .primary)
                            Spacer()
                            Text(sub.displayId).font(.caption2.monospaced()).foregroundStyle(.tertiary)
                        }
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { Task { await archiveSubtask(sub) } } label: { Label("Archive", systemImage: "archivebox") }
                }
            }
            TextField("Add subtask (#tags, @ to attach an existing task)", text: $newSubtask)
                .focused($focus, equals: .subtask)
                .submitLabel(.done)
                .onSubmit { Task { await addSubtask() } }
                .accessibilityIdentifier("detail.newSubtask")
            ForEach(subtaskCandidates) { candidate in
                Button {
                    Task { await attachSubtask(candidate) }
                } label: {
                    Label("Attach \"\(candidate.title)\"", systemImage: "arrow.turn.down.right")
                }
            }
        } header: {
            HStack {
                Text("Subtasks")
                Spacer()
                if !subtasks.isEmpty { Text("\(subtasks.filter(\.completed).count)/\(subtasks.count)").monospacedDigit() }
            }
        }
        .task(id: newSubtask) { await searchSubtaskCandidates() }
    }

    private func dueSection(_ task: TaskItem) -> some View {
        Section {
            HStack {
                ForEach([("Today", 0), ("Tomorrow", 1), ("Next week", 7)], id: \.1) { label, offset in
                    let day = app.days.offsetFromToday(offset)
                    Button(label) { Task { await patch(["due_at": .optional(app.days.dueISO(day))]) } }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .tint(app.days.localDay(ofServerTimestamp: task.dueAt) == day ? .accentColor : .secondary)
                }
            }
            if pickDue {
                DatePicker("Due", selection: $dueDate)
                Button("Set due date") {
                    pickDue = false
                    Task { await patch(["due_at": .string(DayMath.isoString(dueDate))]) }
                }
            } else {
                Button("Pick date & time…") {
                    dueDate = DayMath.dueDate(task.dueAt) ?? app.days.date(fromYMD: app.days.today(), hour: 9) ?? Date()
                    pickDue = true
                }
            }
            if task.dueAt != nil {
                Button("Clear due date", role: .destructive) { Task { await patch(["due_at": .null]) } }
            }
        } header: {
            HStack {
                Text("Due date")
                Spacer()
                if let due = task.dueAt, let date = DayMath.dueDate(due) {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .foregroundStyle(app.days.isOverdue(due) && !task.completed ? .red : .secondary)
                }
            }
        }
    }

    private func tagsSection(_ task: TaskItem) -> some View {
        Section("Tags") {
            if !task.detectedTags.isEmpty {
                ForEach(task.detectedTags, id: \.key) { tag in
                    LabeledContent {
                        Text(TaskTags.detectedReason(tag)).font(.caption)
                    } label: {
                        Text("\(tag.emoji ?? "") \(tag.label)")
                    }
                }
            }
            ForEach(tags, id: \.self) { tag in
                Text("#\(tag)")
                    .swipeActions {
                        Button(role: .destructive) { Task { await saveTags(tags.filter { $0 != tag }) } } label: { Label("Remove", systemImage: "xmark") }
                    }
            }
            TagPicker(tags: Binding(get: { tags }, set: { next in Task { await saveTags(next) } }))
            TextField("Add a tag", text: $newTag)
                .textInputAutocapitalization(.never)
                .focused($focus, equals: .tag)
                .onSubmit { Task { await addTag() } }
                .onChange(of: newTag) { _, value in if value.contains(",") { Task { await addTag() } } }
        }
    }

    @ViewBuilder
    private var noteSection: some View {
        Section("Linked note") {
            if let note = linkedNote {
                if let content = linkedNoteContent, !content.isEmpty {
                    MarkdownText(source: content).lineLimit(8)
                }
                NavigationLink(value: Route.note(note.targetId)) { Label("Open \(note.targetTitle)", systemImage: "doc.text") }
            } else {
                Button { Task { await addNote() } } label: { Label("Add note", systemImage: "doc.badge.plus") }
                    .accessibilityIdentifier("detail.addNote")
            }
        }
    }

    // MARK: Actions

    private func load() async {
        do {
            async let detail = repo.task(id: taskId)
            async let fetchedLinks = try? repo.taskLinks(id: taskId)
            let loaded = try await detail
            task = loaded
            title = loaded.title
            descriptionText = loaded.description
            tags = loaded.tags
            links = await fetchedLinks ?? []
            await loadNotePreview()
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// After a sync: take the stored task and links, keeping text that is being typed.
    private func refresh() async {
        guard let fresh = try? await repo.task(id: taskId) else { return }
        task = fresh
        if focus != .title { title = fresh.title }
        if focus != .description { descriptionText = fresh.description }
        if focus != .tag { tags = fresh.tags }
        links = (try? await repo.taskLinks(id: taskId)) ?? links
    }

    private func loadNotePreview() async {
        guard let note = linkedNote else { return }
        linkedNoteContent = (try? await repo.note(id: note.targetId))?.content
    }

    private func apply(_ updated: TaskItem?) {
        guard let updated, let current = task else { return }
        task = current.merged(with: updated)
        tags = updated.tags
    }

    private func patch(_ body: JSONObject) async {
        apply(await app.updateTask(taskId, body))
    }

    private func saveTitle() async {
        guard let task, title.trimmingCharacters(in: .whitespaces) != task.title else { return }
        let parsed = Hashtags.parse(title.trimmingCharacters(in: .whitespaces), days: app.days)
        guard !parsed.title.isEmpty else { title = task.title; return }
        var merged = tags
        for tag in parsed.tags where !merged.contains(tag) { merged.append(tag) }
        var body: JSONObject = ["title": .string(parsed.title), "tags": .strings(merged)]
        if let p = parsed.priority { body["priority"] = .int(p) }
        if let s = parsed.status { body["status"] = .string(s.rawValue) }
        if let due = parsed.dueISO(app.days) { body["due_at"] = .string(due) }
        title = parsed.title
        await patch(body)
    }

    private func saveDescription() async {
        guard let task, descriptionText != task.description else { return }
        await patch(["description": .string(descriptionText)])
    }

    private func saveTags(_ next: [String]) async {
        tags = next
        await patch(["tags": .strings(next)])
    }

    private func addTag() async {
        let tag = newTag.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces)
        newTag = ""
        guard !tag.isEmpty, !tags.contains(tag) else { return }
        await saveTags(tags + [tag])
    }

    private func toggleComplete() async {
        guard let current = task else { return }
        apply(await app.setCompleted(current, !current.completed))
    }

    private func togglePin() async {
        guard let current = task else { return }
        do {
            apply(try await repo.setTaskPinned(id: taskId, !current.pinned))
        } catch {
            app.showError("Could not update that task", error)
        }
    }

    private func archive() async {
        do {
            _ = try await repo.archiveTask(id: taskId)
            app.showToast("Task archived", style: .success)
            dismiss()
        } catch {
            app.showError("Could not archive that task", error)
        }
    }

    private func toggleSubtask(_ sub: TaskItem) async {
        guard let saved = await app.setCompleted(sub, !sub.completed) else { return }
        task?.subtasks = subtasks.map { $0.id == sub.id ? $0.merged(with: saved) : $0 }
    }

    private func archiveSubtask(_ sub: TaskItem) async {
        do {
            _ = try await repo.archiveTask(id: sub.id)
            task?.subtasks = subtasks.filter { $0.id != sub.id }
        } catch {
            app.showError("Could not archive that subtask", error)
        }
    }

    private func addSubtask() async {
        let text = newSubtask.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty, !text.contains("@"), let current = task else { return }
        newSubtask = ""
        if let created = await app.createSubtask(parent: current, title: text) {
            task?.subtasks = subtasks + [created]
        }
        focus = .subtask
    }

    /// `@query` in the subtask field searches existing tasks to re-parent here.
    private func searchSubtaskCandidates() async {
        guard let at = newSubtask.lastIndex(of: "@") else { subtaskCandidates = []; return }
        if at != newSubtask.startIndex {
            let prev = newSubtask[newSubtask.index(before: at)]
            guard prev == " " || prev == "\n" else { subtaskCandidates = []; return }
        }
        let query = String(newSubtask[newSubtask.index(after: at)...])
        guard !query.isEmpty, !query.contains(" ") else { subtaskCandidates = []; return }
        try? await Task.sleep(for: .milliseconds(200))
        guard !Task.isCancelled else { return }
        subtaskCandidates = ((try? await repo.mention(query)) ?? []).filter { $0.type == "task" && $0.id != taskId }
    }

    private func attachSubtask(_ candidate: MentionResult) async {
        newSubtask = ""
        subtaskCandidates = []
        _ = await app.updateTask(candidate.id, ["parent_id": .string(taskId)])
        if let fresh = try? await repo.task(id: taskId) { task?.subtasks = fresh.subtasks }
    }

    private func addNote() async {
        guard let current = task else { return }
        do {
            let note = try await repo.createNote(title: current.title, workspaceId: current.workspaceId)
            try await repo.createLink(sourceType: "task", sourceId: taskId, targetType: "note", targetId: note.id)
            links.append(LinkItem(targetType: "note", targetId: note.id, targetTitle: note.title))
            openNoteId = note.id
        } catch {
            app.showError("Could not add a note", error)
        }
    }

    private func copyAsMarkdown() {
        guard let task else { return }
        func box(_ done: Bool) -> String { done ? "x" : " " }
        var lines = ["- [\(box(task.completed))] \(task.title)"]
        if !task.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines += task.description.components(separatedBy: "\n").map { "  \($0)" }
        }
        lines += subtasks.map { "  - [\(box($0.completed))] \($0.title)" }
        UIPasteboard.general.string = lines.joined(separator: "\n")
        app.showToast("Copied as markdown", style: .success)
    }
}
