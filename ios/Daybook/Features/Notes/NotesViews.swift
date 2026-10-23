import DaybookKit
import SwiftUI

/// Port of `pages/notes/index.vue`: diary notes, pinned notes, other notes, archive.
struct NotesView: View {
    @Environment(AppModel.self) private var app
    @State private var notes: [Note] = []
    @State private var diaryNotes: [DiaryEntry] = []
    @State private var showArchived = false
    @State private var loading = false
    @State private var diaryExpanded = true
    @State private var otherExpanded = true
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if !showArchived {
                    Section {
                        if diaryExpanded {
                            ForEach(diaryNotes) { entry in
                                Button {
                                    app.requestedDiaryDate = entry.entryDate
                                    app.selectedTab = .today
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("\(entry.entryDate) \(app.days.weekdayShort(entry.entryDate))").font(.headline)
                                        Text(Markdown.diaryPreview(entry.preview ?? entry.content))
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("diaryNote.\(entry.entryDate)")
                            }
                            if diaryNotes.isEmpty {
                                Text("Diary entries with notes will appear here.").foregroundStyle(.secondary).italic()
                            }
                        }
                    } header: {
                        CollapsibleHeader(title: "Diary notes", systemImage: "book", count: diaryNotes.count, isExpanded: $diaryExpanded)
                    }
                }

                let pinned = notes.filter(\.pinned)
                if !pinned.isEmpty && !showArchived {
                    Section("Pinned") {
                        ForEach(pinned) { noteRow($0) }
                    }
                }

                Section {
                    if otherExpanded {
                        ForEach(showArchived ? notes : notes.filter { !$0.pinned }) { noteRow($0) }
                        if notes.isEmpty && !loading {
                            Text(showArchived ? "No archived notes." : "No notes yet.").foregroundStyle(.secondary).italic()
                        }
                    }
                } header: {
                    CollapsibleHeader(title: showArchived ? "Archived notes" : "Other notes", systemImage: showArchived ? "archivebox" : "doc.on.doc",
                                      count: notes.count, isExpanded: $otherExpanded)
                }
            }
            .navigationTitle(showArchived ? "Archived notes" : "Notebook")
            .refreshable {
                await app.syncNow()
                await load()
            }
            .task { await load() }
            .onChange(of: app.store?.revision) { Task { await load() } }
            .onChange(of: app.activeWorkspaceId) { Task { await load() } }
            .onChange(of: showArchived) { otherExpanded = true; Task { await load() } }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { WorkspaceMenu() }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showArchived.toggle() } label: {
                        Image(systemName: showArchived ? "tray.and.arrow.up" : "archivebox")
                    }
                    .accessibilityLabel(showArchived ? "Show notebook" : "Show archived notes")
                    if !showArchived {
                        Button { Task { await createNote() } } label: { Image(systemName: "square.and.pencil") }
                            .accessibilityLabel("New note")
                            .accessibilityIdentifier("notes.add")
                    }
                }
            }
            .daybookDestinations()
        }
    }

    private func noteRow(_ note: Note) -> some View {
        NavigationLink(value: Route.note(note.id)) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(note.title.isEmpty ? "Untitled" : note.title).font(.headline)
                    if note.pinned { Image(systemName: "pin.fill").font(.caption).foregroundStyle(Color("Warm")) }
                }
                if !note.preview.isEmpty {
                    Text(note.preview).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                }
                if !note.tags.isEmpty {
                    Text(note.tags.prefix(3).map { "#\($0)" }.joined(separator: " ")).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityIdentifier("note.row.\(note.title)")
        .swipeActions(edge: .leading) {
            Button { Task { await togglePin(note) } } label: {
                Label(note.pinned ? "Unpin" : "Pin", systemImage: note.pinned ? "pin.slash" : "pin")
            }
            .tint(Color("Warm"))
        }
    }

    private func load() async {
        guard let repo = app.repo else { return }
        loading = true
        defer { loading = false }
        if !showArchived {
            diaryNotes = (try? await repo.diaryList(workspaceId: app.activeWorkspaceId)) ?? []
        }
        notes = (try? await repo.notes(workspaceId: app.activeWorkspaceId, archived: showArchived)) ?? notes
    }

    private func createNote() async {
        guard let repo = app.repo else { return }
        do {
            let note = try await repo.createNote(title: "Untitled", workspaceId: app.activeWorkspaceId)
            notes.insert(note, at: 0)
            path.append(Route.note(note.id))
        } catch {
            app.showError("Could not create a note", error)
        }
    }

    /// Optimistic pin with rollback (web `togglePin`).
    private func togglePin(_ note: Note) async {
        guard let repo = app.repo, let index = notes.firstIndex(where: { $0.id == note.id }) else { return }
        notes[index].pinned.toggle()
        do {
            try await repo.updateNote(id: note.id, ["pinned": .bool(notes[index].pinned)])
        } catch {
            if let i = notes.firstIndex(where: { $0.id == note.id }) { notes[i].pinned = note.pinned }
            app.showError("Could not update that note", error)
        }
    }
}

/// Port of `pages/notes/[id].vue`: title, markdown editor with @-mentions and autosave, preview with
/// embedded linked tasks, checklist→tasks on leaving the editor, pin, archive.
struct NoteDetailView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let noteId: String
    @State private var openTaskId: String?

    @State private var note: Note?
    @State private var loadError: String?
    @State private var title = ""
    @State private var content = ""
    @State private var editing = true
    @State private var saving = false
    @State private var creatingTasks = false
    @State private var taskCache: [String: TaskItem] = [:]
    @State private var confirmArchive = false
    @State private var saveTask: Task<Void, Never>?

    private var repo: Repository { app.repo! }

    var body: some View {
        Group {
            if let note {
                editor(note)
            } else if let loadError {
                ContentUnavailableView("Note unavailable", systemImage: "exclamationmark.triangle", description: Text(loadError))
            } else {
                ProgressView()
            }
        }
        .navigationDestination(item: $openTaskId) { TaskDetailView(taskId: $0) }
        .navigationTitle(note?.displayId ?? "Note")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: app.store?.revision) { Task { await refresh() } }
        .onDisappear { Task { await flush() } }
    }

    private func editor(_ note: Note) -> some View {
        List {
            Section {
                TextField("Title", text: $title, axis: .vertical)
                    .font(.title2.weight(.semibold))
                    .onChange(of: title) { scheduleSave() }
                    .accessibilityIdentifier("note.title")
            }
            Section {
                if editing {
                    MentionEditor(text: $content, placeholder: "Write in markdown… @ links a task or note, - [ ] makes tasks",
                                  minHeight: 260, identifier: "note.editor") { item in
                        Task { await link(item) }
                    }
                    .onChange(of: content) { scheduleSave() }
                } else {
                    preview(note)
                }
            }
            if !note.links.isEmpty {
                Section("Linked") {
                    ForEach(note.links, id: \.linkId) { link in
                        NavigationLink(value: link.targetType == "note" ? Route.note(link.targetId) : Route.task(link.targetId)) {
                            Label(link.targetTitle, systemImage: link.targetType == "note" ? "doc.text" : "checkmark.circle")
                        }
                    }
                }
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if saving || creatingTasks { ProgressView().accessibilityIdentifier("note.saving") }
                Button(editing ? "Preview" : "Edit") { Task { await toggleEditing() } }
                    .accessibilityIdentifier("note.toggleEdit")
                Menu {
                    Button(note.pinned ? "Unpin" : "Pin", systemImage: note.pinned ? "pin.slash" : "pin") { Task { await togglePin() } }
                    Button(note.archived ? "Restore" : "Archive", systemImage: note.archived ? "tray.and.arrow.up" : "archivebox",
                           role: note.archived ? nil : .destructive) { confirmArchive = true }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog(note.archived ? "Restore this note?" : "Archive this note?", isPresented: $confirmArchive, titleVisibility: .visible) {
            Button(note.archived ? "Restore" : "Archive", role: note.archived ? nil : .destructive) { Task { await toggleArchive() } }
        }
    }

    @ViewBuilder
    private func preview(_ note: Note) -> some View {
        let segments = Markdown.noteSegments(content, links: note.links)
        if segments.isEmpty {
            Text("Nothing here yet. Tap Edit to write.").foregroundStyle(.tertiary)
        }
        ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
            switch segment {
            case .text(let text):
                MarkdownText(source: text)
            case .task(let id):
                if let task = taskCache[id] {
                    InlineTaskRow(task: task, onOpenTask: { openTaskId = $0 }) { taskCache[$0.id] = $0 }
                } else {
                    ProgressView().task { await hydrate([id]) }
                }
            }
        }
    }

    // MARK: Actions

    private func load() async {
        do {
            let loaded = try await repo.note(id: noteId)
            note = loaded
            title = loaded.title
            content = loaded.content
            // Start in preview when the note already has content.
            editing = loaded.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// After a sync: new links always; title and text only when nothing typed here is unsaved and
    /// the editor is closed.
    private func refresh() async {
        guard let current = note, let fresh = try? await repo.note(id: noteId) else { return }
        note?.links = fresh.links
        note?.pinned = fresh.pinned
        note?.archived = fresh.archived
        note?.displayId = fresh.displayId
        let unsaved = title != current.title || content != current.content
        if !editing && !unsaved && !saving {
            note?.title = fresh.title
            note?.content = fresh.content
            title = fresh.title
            content = fresh.content
        }
        for id in taskCache.keys {
            if let task = try? await repo.task(id: id) { taskCache[id] = task }
        }
    }

    private func hydrate(_ ids: [String]) async {
        let missing = ids.filter { taskCache[$0] == nil }
        guard !missing.isEmpty, let tasks = try? await repo.tasksBatch(ids: missing) else { return }
        for task in tasks { taskCache[task.id] = task }
    }

    /// 300 ms debounced autosave of title + content.
    private func scheduleSave() {
        guard let note, title != note.title || content != note.content else { return }
        saving = true
        saveTask?.cancel()
        let body: JSONObject = ["title": .string(title), "content": .string(content)]
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await save(body)
        }
    }

    private func save(_ body: JSONObject) async {
        do {
            let saved = try await repo.updateNote(id: noteId, body)
            note?.title = saved.title
            note?.content = saved.content
        } catch {
            app.showError("Note could not be saved", error)
        }
        saving = false
    }

    private func flush() async {
        guard let note, title != note.title || content != note.content else { return }
        saveTask?.cancel()
        await save(["title": .string(title), "content": .string(content)])
    }

    private func link(_ item: MentionResult) async {
        do {
            try await repo.createLink(sourceType: "note", sourceId: noteId, targetType: item.type, targetId: item.id)
            await flush()
            if let fresh = try? await repo.note(id: noteId) { note?.links = fresh.links }
        } catch {
            app.showError("Could not link that item", error)
        }
    }

    private func toggleEditing() async {
        if editing, Checklist.hasChecklist(content), let note {
            creatingTasks = true
            defer { creatingTasks = false }
            let items = Checklist.parse(content)
            do {
                try await repo.tasksFromChecklist(items: Checklist.rawInputs(items), sourceType: "note", sourceId: note.id,
                                                 workspaceId: note.workspaceId, dueDate: nil)
                content = Checklist.replaceWithMentions(content, roots: items.map { (original: $0.title, clean: $0.title) })
                await flush()
                if let fresh = try? await repo.note(id: noteId) { self.note?.links = fresh.links }
            } catch {
                app.showError("Checklist could not be turned into tasks", error)
                return
            }
        } else {
            await flush()
        }
        editing.toggle()
    }

    private func togglePin() async {
        guard let note else { return }
        do {
            let saved = try await repo.updateNote(id: noteId, ["pinned": .bool(!note.pinned)])
            self.note?.pinned = saved.pinned
        } catch {
            app.showError("Could not update that note", error)
        }
    }

    private func toggleArchive() async {
        guard let note else { return }
        await flush()
        do {
            try await repo.updateNote(id: noteId, ["archived": .bool(!note.archived)])
            dismiss()
        } catch {
            app.showError("Could not update that note", error)
        }
    }
}
