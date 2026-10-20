import DaybookKit
import SwiftUI

/// Settings → Templates (web `SettingsTemplates.vue`). Templates are online-only data: edits need a
/// connection; the list shown offline is the last one fetched.
struct TemplatesSection: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Section {
            ForEach(app.templates) { template in
                NavigationLink {
                    TemplateEditor(template: template)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(template.name)
                        Text(template.subtasks.isEmpty ? "No subtasks" : "\(template.subtasks.count) subtask\(template.subtasks.count == 1 ? "" : "s")")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .accessibilityIdentifier("settings.template.\(template.name)")
            }
        } header: {
            Text("Templates")
        } footer: {
            Text(app.templates.isEmpty
                 ? "No templates yet. On a task, tap the template button to save it with its subtasks, then pick it under From template in New task."
                 : "Pick a template under From template in New task.")
        }
    }
}

struct TemplateEditor: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var draft: TaskTemplate
    @State private var newSubtask = ""
    @State private var saving = false
    @State private var confirmDelete = false

    init(template: TaskTemplate) {
        _draft = State(initialValue: template)
    }

    private var canSave: Bool {
        !draft.name.trimmingCharacters(in: .whitespaces).isEmpty && !draft.title.trimmingCharacters(in: .whitespaces).isEmpty && !saving
    }

    var body: some View {
        Form {
            Section {
                TextField("Template name", text: $draft.name)
                    .accessibilityIdentifier("template.name")
                TextField("Task title", text: $draft.title)
                    .accessibilityIdentifier("template.title")
                TextField("Details", text: $draft.description, axis: .vertical)
                    .lineLimit(2...6)
            }

            Section {
                Picker("Priority", selection: $draft.priority) {
                    ForEach(Priority.options) { p in Label(p.label, systemImage: p.symbol).tag(p.rawValue) }
                    Label("None", systemImage: "minus").tag(0)
                }
                Picker("Workspace", selection: $draft.workspaceId) {
                    Text("Current").tag(String?.none)
                    ForEach(app.workspaces) { Text($0.label).tag(Optional($0.id)) }
                }
            } footer: {
                Text("The workspace is used when you create from All; otherwise the open workspace wins.")
            }

            Section("Tags") {
                TagPicker(tags: $draft.tags)
            }

            Section {
                ForEach(draft.subtasks.indices, id: \.self) { i in
                    // Bound by index, guarded: a row can outlive its subtask for a frame after a delete.
                    TextField("Subtask", text: Binding(
                        get: { i < draft.subtasks.count ? draft.subtasks[i].title : "" },
                        set: { if i < draft.subtasks.count { draft.subtasks[i].title = $0 } }
                    ))
                }
                .onDelete { draft.subtasks.remove(atOffsets: $0) }
                .onMove { draft.subtasks.move(fromOffsets: $0, toOffset: $1) }
                HStack {
                    TextField("Add a subtask", text: $newSubtask)
                        .onSubmit(addSubtask)
                        .accessibilityIdentifier("template.newSubtask")
                    Button("Add", action: addSubtask)
                        .disabled(newSubtask.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            } header: {
                Text("Subtasks").withEditButton()
            }

            Section {
                Button("Create task from template", systemImage: "plus.circle") { Task { await useNow() } }
                    .accessibilityIdentifier("template.use")
                Button("Delete template", systemImage: "trash", role: .destructive) { confirmDelete = true }
                    .accessibilityIdentifier("template.delete")
            }
        }
        .navigationTitle(draft.name.isEmpty ? "Template" : draft.name)
        .inlineNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }
                    .disabled(!canSave)
                    .accessibilityIdentifier("template.save")
            }
        }
        .confirmationDialog("Delete “\(draft.name)”?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete template", role: .destructive) { Task { await delete() } }
        } message: {
            Text("Tasks already created from it stay.")
        }
    }

    private func addSubtask() {
        let title = newSubtask.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        draft.subtasks.append(TemplateSubtask(title: title))
        newSubtask = ""
    }

    private func save() async {
        guard let api = app.api else { return }
        saving = true
        defer { saving = false }
        var cleaned = draft
        cleaned.subtasks = draft.subtasks.filter { !$0.title.trimmingCharacters(in: .whitespaces).isEmpty }
        do {
            let saved = try await api.updateTemplate(cleaned)
            app.templates = app.templates.map { $0.id == saved.id ? saved : $0 }
            app.showToast("Template saved", style: .success)
            dismiss()
        } catch {
            app.showError("Template not saved (needs a connection)", error)
        }
    }

    private func delete() async {
        guard let api = app.api else { return }
        do {
            try await api.deleteTemplate(id: draft.id)
            app.templates.removeAll { $0.id == draft.id }
            app.showToast("Template deleted", style: .success)
            dismiss()
        } catch {
            app.showError("Template not deleted (needs a connection)", error)
        }
    }

    /// Works offline: the tasks are queued like any new task.
    private func useNow() async {
        guard let repo = app.repo else { return }
        do {
            let task = try await repo.createTasks(from: draft, workspaceId: app.activeWorkspaceId ?? draft.workspaceId)
            app.showToast("Created “\(task.title)”", style: .success)
        } catch {
            app.showError("Template could not be used", error)
        }
    }
}
