import DaybookKit
import SwiftUI

enum Route: Hashable {
    case task(String)
    case note(String)
    case calendar
    case search
}

extension View {
    /// Every tab's stack can open tasks, notes, the calendar and search.
    func daybookDestinations() -> some View {
        navigationDestination(for: Route.self) { route in
            switch route {
            case .task(let id): TaskDetailView(taskId: id)
            case .note(let id): NoteDetailView(noteId: id)
            case .calendar: CalendarView()
            case .search: SearchView()
            }
        }
    }
}

// MARK: - Markdown

/// Renders markdown blocks natively (headings, lists, checkboxes, quotes, code).
struct MarkdownText: View {
    let source: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(Markdown.blocks(source).enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func inline(_ text: String) -> Text {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        if let attributed = try? AttributedString(markdown: text, options: options) { return Text(attributed) }
        return Text(text)
    }

    @ViewBuilder
    private func blockView(_ block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let text):
            inline(text).font(level == 1 ? .title2.bold() : level == 2 ? .title3.bold() : .headline)
        case .paragraph(let text):
            inline(text)
        case .bullet(let text, let indent):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("•").foregroundStyle(.secondary)
                inline(text)
            }
            .padding(.leading, CGFloat(indent) * 16)
        case .numbered(let number, let text, let indent):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(number).").foregroundStyle(.secondary).monospacedDigit()
                inline(text)
            }
            .padding(.leading, CGFloat(indent) * 16)
        case .checkbox(let checked, let text, let indent):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: checked ? "checkmark.square.fill" : "square").foregroundStyle(checked ? Color.accentColor : .secondary)
                inline(text).strikethrough(checked).foregroundStyle(checked ? .secondary : .primary)
            }
            .padding(.leading, CGFloat(indent) * 16)
        case .quote(let text):
            inline(text)
                .foregroundStyle(.secondary)
                .padding(.leading, 10)
                .overlay(alignment: .leading) { Rectangle().fill(.quaternary).frame(width: 3) }
        case .code(let text):
            Text(text)
                .font(.callout.monospaced())
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
        case .rule:
            Divider()
        }
    }
}

// MARK: - Workspaces

/// Toolbar menu: All workspaces, each workspace, New workspace (web `WorkspaceSwitcher`).
struct WorkspaceMenu: View {
    @Environment(AppModel.self) private var model
    var beforeChange: (() async -> Void)?
    @State private var creating = false

    var body: some View {
        Menu {
            Picker("Workspace", selection: Binding(
                get: { model.activeWorkspaceId },
                set: { next in
                    Task {
                        await beforeChange?()
                        model.activeWorkspaceId = next
                    }
                }
            )) {
                Label("All Workspaces", systemImage: "square.stack.3d.up").tag(String?.none)
                ForEach(model.workspaces) { ws in
                    Text(ws.label).tag(Optional(ws.id))
                }
            }
            Divider()
            Button("New workspace", systemImage: "plus") { creating = true }
        } label: {
            HStack(spacing: 4) {
                Text(model.activeWorkspace?.label ?? "All")
                    .lineLimit(1)
                Image(systemName: "chevron.down").font(.caption2.weight(.semibold))
            }
            .font(.subheadline.weight(.medium))
        }
        .accessibilityIdentifier("workspace.menu")
        .sheet(isPresented: $creating) {
            NewWorkspaceSheet { created in model.activeWorkspaceId = created.id }
        }
    }
}

struct NewWorkspaceSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var onCreated: (Workspace) -> Void = { _ in }
    @State private var name = ""
    @State private var emoji = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Emoji", text: $emoji)
                        .onChange(of: emoji) { _, value in if value.count > 2 { emoji = String(value.prefix(2)) } }
                    TextField("Name", text: $name)
                        .accessibilityIdentifier("workspace.name")
                } footer: {
                    Text("Workspaces are filters across tasks, notes and your daybook.")
                }
            }
            .navigationTitle("New workspace")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        saving = true
                        Task {
                            defer { saving = false }
                            do {
                                let ws = try await model.createWorkspace(name: name.trimmingCharacters(in: .whitespaces), emoji: emoji.trimmingCharacters(in: .whitespaces))
                                model.showToast("Workspace \"\(ws.name)\" created", style: .success)
                                onCreated(ws)
                                dismiss()
                            } catch {
                                model.showError("Could not create workspace", error)
                            }
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                    .accessibilityIdentifier("workspace.create")
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Task badges

extension Priority {
    var color: Color {
        switch self {
        case .critical: .red
        case .focus: .orange
        case .snack: .green
        case .none: .secondary
        }
    }
}

struct PriorityIcon: View {
    let priority: Int

    var body: some View {
        let p = Priority(value: priority)
        if p != .none {
            Image(systemName: p.symbol)
                .font(.caption)
                .foregroundStyle(p.color)
                .accessibilityLabel(p.label)
        }
    }
}

struct TagEmojis: View {
    @Environment(AppModel.self) private var app
    let tags: [ResolvedTag]
    var limit = 2

    var body: some View {
        // Settings → Tags can relabel a tag or give a custom tag an emoji.
        let emoji = app.tagOverrides.present(tags).filter { $0.emoji != nil }
        if !emoji.isEmpty {
            HStack(spacing: 1) {
                ForEach(emoji.prefix(limit), id: \.key) { tag in
                    Text(tag.emoji ?? "").font(.caption).accessibilityLabel(tag.label)
                }
                if emoji.count > limit {
                    Text("+\(emoji.count - limit)").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct DueBadge: View {
    @Environment(AppModel.self) private var model
    let dueAt: String?
    var completed = false

    var body: some View {
        if let dueAt, !dueAt.isEmpty {
            let overdue = !completed && model.days.isOverdue(dueAt)
            HStack(spacing: 3) {
                Image(systemName: overdue ? "exclamationmark.circle" : "calendar")
                Text(model.days.formatDue(dueAt))
            }
            .font(.caption)
            .foregroundStyle(overdue ? Color.red : .secondary)
            .fixedSize()
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Due \(model.days.formatDue(dueAt))")
        }
    }
}

struct StatusBadge: View {
    let status: TaskStatus

    var body: some View {
        if status != .done {
            Text(status.label)
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(status == .now ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.14), in: Capsule())
                .foregroundStyle(status == .now ? Color.accentColor : .secondary)
        }
    }
}

struct CompletionButton: View {
    let completed: Bool
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: completed ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(completed ? Color.accentColor : .secondary)
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .disabled(disabled)
        .accessibilityLabel(completed ? "Mark not done" : "Mark done")
        .sensoryFeedback(.success, trigger: completed) { _, now in now }
    }
}

/// Collapsible section header used on Today and Notes.
struct CollapsibleHeader: View {
    let title: String
    var systemImage: String?
    var count: Int?
    @Binding var isExpanded: Bool

    var body: some View {
        Button {
            withAnimation(.snappy) { isExpanded.toggle() }
        } label: {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
                if let count { Text("\(count)").foregroundStyle(.secondary).monospacedDigit() }
                Spacer()
                Image(systemName: "chevron.right")
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("section.\(title)")
    }
}
