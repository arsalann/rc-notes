import DaybookKit
import SwiftUI

/// Settings → Tags (web `SettingsTags.vue`): every tag with its usage, rename / emoji / archive.
/// Online only. Renaming a custom tag rewrites it on every task and note (after a warning); built-in
/// tags get a display name and emoji only.
struct TagsSection: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Section {
            NavigationLink {
                TagsSettingsView()
            } label: {
                LabeledContent("Tags") {
                    let archived = app.tagOverrides.tags.filter(\.archived).count
                    Text(archived > 0 ? "\(archived) archived" : "")
                }
            }
            .accessibilityIdentifier("settings.tags")
        } footer: {
            Text("Rename tags, give them an emoji, or archive ones you no longer use.")
        }
    }
}

struct TagsSettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var editing: TagSummary?
    @State private var busyKey: String?

    private var active: [TagSummary] { app.tagOverrides.tags.filter { !$0.archived } }
    private var archived: [TagSummary] { app.tagOverrides.tags.filter(\.archived) }

    var body: some View {
        List {
            Section {
                ForEach(active) { row($0) }
                if active.isEmpty { Text("No active tags.").foregroundStyle(.secondary) }
            } footer: {
                Text("Archived tags are hidden from the tag picker; tasks keep them.")
            }
            if !archived.isEmpty {
                Section("Archived") {
                    ForEach(archived) { row($0) }
                }
            }
        }
        .navigationTitle("Tags")
        .refreshable { await app.refreshTemplatesAndTags() }
        .task { await app.refreshTemplatesAndTags() }
        .sheet(item: $editing) { TagEditSheet(tag: $0) }
    }

    private func row(_ tag: TagSummary) -> some View {
        Button {
            editing = tag
        } label: {
            HStack(spacing: 12) {
                Text(tag.emoji ?? "#").frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(tag.label).foregroundStyle(tag.archived ? .secondary : .primary)
                    Text(tag.usage + (tag.builtin ? " · built-in" : "")).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if busyKey == tag.key { ProgressView().controlSize(.small) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .swipeActions {
            Button(tag.archived ? "Restore" : "Archive", systemImage: tag.archived ? "tray.and.arrow.up" : "archivebox") {
                Task { await setArchived(tag, !tag.archived) }
            }
            .tint(tag.archived ? .green : .orange)
        }
        .accessibilityIdentifier("tag.\(tag.label)")
    }

    private func setArchived(_ tag: TagSummary, _ value: Bool) async {
        guard let api = app.api else { return }
        busyKey = tag.key
        defer { busyKey = nil }
        do {
            try await api.updateTag(key: tag.key, archived: value)
            await app.refreshTemplatesAndTags()
            app.showToast(value ? "“\(tag.label)” archived" : "“\(tag.label)” restored", style: .success)
        } catch {
            app.showError("Tag not updated (needs a connection)", error)
        }
    }
}

struct TagEditSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let tag: TagSummary
    @State private var name: String
    @State private var emoji: String
    @State private var saving = false
    @State private var confirmRename = false

    init(tag: TagSummary) {
        self.tag = tag
        _name = State(initialValue: tag.label)
        _emoji = State(initialValue: tag.emoji ?? "")
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var nameChanged: Bool { trimmedName != tag.label }
    private var emojiChanged: Bool { emoji.trimmingCharacters(in: .whitespaces) != (tag.emoji ?? "") }
    /// Renaming a custom tag that is in use rewrites tasks and notes.
    private var overwrites: Bool { !tag.builtin && nameChanged && tag.taskCount + tag.noteCount > 0 }
    private var mergesInto: TagSummary? {
        guard overwrites, let key = TaskTags.manualKey(trimmedName), key != tag.key else { return nil }
        return app.tagOverrides[key]
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Emoji", text: $emoji)
                        .accessibilityIdentifier("tagedit.emoji")
                    TextField(tag.builtin ? "Display name" : "Name", text: $name)
                        .noAutocapitalization()
                        .accessibilityIdentifier("tagedit.name")
                } footer: {
                    if tag.builtin {
                        Text("Built-in tag: the name and emoji change how it is shown; tasks are not rewritten and automatic detection keeps working.")
                    }
                }
                if overwrites {
                    Section {
                        Label("This overwrites existing tasks", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(Color("Warm"))
                            .font(.headline)
                        Text(warningText).font(.subheadline)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("tagedit.warning")
                }
                if tag.builtin && (tag.labelOverride != nil || tag.emojiOverride != nil) {
                    Section {
                        Button("Reset to “\(tag.name)”") { Task { await reset() } }
                    }
                }
            }
            .navigationTitle("Edit \(tag.label)")
            .inlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(overwrites ? "Rename" : "Save") {
                        if overwrites { confirmRename = true } else { Task { await save() } }
                    }
                    .disabled(trimmedName.isEmpty || !(nameChanged || emojiChanged) || saving)
                    .accessibilityIdentifier("tagedit.save")
                }
            }
            .confirmationDialog("Rename and overwrite \(tag.usage)?", isPresented: $confirmRename, titleVisibility: .visible) {
                Button("Rename & overwrite", role: .destructive) { Task { await save() } }
            } message: {
                Text(warningText)
            }
        }
    }

    private var warningText: String {
        var text = "Renaming rewrites the tag on \(tag.usage)"
        if tag.variants.count > 1 { text += " (every spelling: \(tag.variants.joined(separator: ", ")))" }
        text += "."
        if let merge = mergesInto { text += " “\(merge.label)” already exists, so the two tags merge." }
        return text + " It can't be undone from the app."
    }

    private func save() async {
        guard let api = app.api else { return }
        saving = true
        defer { saving = false }
        let newEmoji = emoji.trimmingCharacters(in: .whitespaces)
        do {
            if tag.builtin {
                try await api.updateTag(key: tag.key,
                                        label: nameChanged ? .string(trimmedName == tag.name ? "" : trimmedName) : nil,
                                        emoji: emojiChanged ? .string(newEmoji) : nil)
                app.showToast("Tag updated", style: .success)
            } else {
                var key = tag.key
                if nameChanged {
                    let result = try await api.renameTag(key: tag.key, to: trimmedName)
                    key = result.key
                    app.showToast("Renamed to “\(result.to)”",
                                  detail: "Updated \(result.tasks) task\(result.tasks == 1 ? "" : "s")\(result.notes > 0 ? " and \(result.notes) note\(result.notes == 1 ? "" : "s")" : "").",
                                  style: .success)
                }
                if emojiChanged {
                    try await api.updateTag(key: key, emoji: newEmoji.isEmpty ? .null : .string(newEmoji))
                    if !nameChanged { app.showToast("Tag updated", style: .success) }
                }
            }
            // A rename rewrote tasks on the server: pull them, then the new tag list.
            await app.syncNow()
            dismiss()
        } catch {
            app.showError("Tag not updated (needs a connection)", error)
        }
    }

    private func reset() async {
        guard let api = app.api else { return }
        do {
            try await api.updateTag(key: tag.key, label: .string(""), emoji: .null)
            await app.refreshTemplatesAndTags()
            app.showToast("“\(tag.name)” reset", style: .success)
            dismiss()
        } catch {
            app.showError("Tag not updated (needs a connection)", error)
        }
    }
}
