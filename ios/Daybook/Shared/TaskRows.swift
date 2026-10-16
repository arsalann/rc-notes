import DaybookKit
import SwiftUI

extension AppModel {
    /// Explicit completion target; on failure refetch the row instead of guessing (web `InlineTask`).
    func setCompleted(_ task: TaskItem, _ completed: Bool) async -> TaskItem? {
        guard let api, !task.isPending else { return nil }
        do {
            return try await api.setTaskCompleted(id: task.id, completed)
        } catch {
            showError("Could not update that task", error)
            return try? await api.task(id: task.id)
        }
    }

    func updateTask(_ id: String, _ patch: JSONObject, errorTitle: String = "Could not update that task") async -> TaskItem? {
        guard let api else { return nil }
        do {
            return try await api.updateTask(id: id, patch)
        } catch {
            showError(errorTitle, error)
            return nil
        }
    }

    func createSubtask(parent: TaskItem, title: String) async -> TaskItem? {
        guard let api else { return nil }
        let parsed = Hashtags.parse(title, days: days)
        guard !parsed.title.isEmpty else { return nil }
        do {
            return try await api.createTask(NewTask(title: parsed.title, parentId: parent.id, workspaceId: activeWorkspaceId,
                                                    tags: parsed.tags.isEmpty ? nil : parsed.tags, dueAt: parsed.dueISO(days),
                                                    priority: parsed.priority, status: parsed.status))
        } catch {
            showError("Could not add subtask", error)
            return nil
        }
    }
}

/// Compact task row with checkbox, inline subtasks and an add-subtask field (web `InlineTask`).
struct InlineTaskRow: View {
    @Environment(AppModel.self) private var model
    let task: TaskItem
    var hideDoneSubtasks = false
    var showTags = true
    var showPriority = true
    var subtasksExpanded = true
    /// Called with the server's version of the task (or a subtask's parent with updated subtasks).
    let onChange: (TaskItem) -> Void

    @State private var expanded: Bool?
    @State private var newSubtask = ""
    @State private var toggling: Set<String> = []

    private var subtasks: [TaskItem] { task.subtasks ?? [] }
    private var isExpanded: Bool { expanded ?? (subtasksExpanded && !subtasks.isEmpty) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center, spacing: 8) {
                CompletionButton(completed: task.completed, disabled: task.isPending || toggling.contains(task.id)) {
                    toggle(task)
                }
                .accessibilityIdentifier("task.toggle.\(task.title)")
                titleView
                Spacer(minLength: 4)
                if showTags { TagEmojis(tags: task.resolvedTags) }
                if showPriority { PriorityIcon(priority: task.priority) }
                Button {
                    withAnimation(.snappy) { expanded = !isExpanded }
                } label: {
                    HStack(spacing: 2) {
                        if !subtasks.isEmpty {
                            Text("\(subtasks.filter(\.completed).count)/\(subtasks.count)")
                                .font(.caption2.monospacedDigit())
                        }
                        Image(systemName: "chevron.right").rotationEffect(.degrees(isExpanded ? 90 : 0))
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 32, minHeight: 32)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(isExpanded ? "Hide subtasks" : "Show subtasks")
            }
            if isExpanded {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(subtasks.filter { !hideDoneSubtasks || !$0.completed }) { sub in
                        HStack(spacing: 8) {
                            CompletionButton(completed: sub.completed, disabled: toggling.contains(sub.id)) { toggle(sub) }
                            NavigationLink(value: Route.task(sub.id)) {
                                Text(sub.title)
                                    .font(.subheadline)
                                    .strikethrough(sub.completed)
                                    .foregroundStyle(sub.completed ? .secondary : .primary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            if showPriority { PriorityIcon(priority: sub.priority) }
                        }
                    }
                    HStack(spacing: 8) {
                        Image(systemName: "plus").foregroundStyle(.secondary).frame(width: 32)
                        TextField("Add subtask", text: $newSubtask)
                            .font(.subheadline)
                            .submitLabel(.done)
                            .onSubmit(addSubtask)
                    }
                }
                .padding(.leading, 28)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var titleView: some View {
        let label = VStack(alignment: .leading, spacing: 2) {
            Text(task.title)
                .strikethrough(task.completed)
                .foregroundStyle(task.completed ? .secondary : .primary)
                .lineLimit(3)
            HStack(spacing: 6) {
                if !task.displayId.isEmpty {
                    Text(task.displayId).font(.caption2.monospaced()).foregroundStyle(.tertiary)
                }
                if task.isPending { ProgressView().controlSize(.mini) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        if task.isPending {
            label
        } else {
            NavigationLink(value: Route.task(task.id)) { label }
                .buttonStyle(.plain)
                .accessibilityIdentifier("task.row.\(task.title)")
        }
    }

    private func toggle(_ target: TaskItem) {
        guard !toggling.contains(target.id), !target.isPending else { return }
        toggling.insert(target.id)
        let next = !target.completed
        apply(target, completed: next) // optimistic
        Task {
            defer { toggling.remove(target.id) }
            if let saved = await model.setCompleted(target, next) {
                replace(saved)
            }
        }
    }

    private func apply(_ target: TaskItem, completed: Bool) {
        var copy = target
        copy.completed = completed
        copy.status = completed ? .done : .next
        replace(copy)
    }

    private func replace(_ updated: TaskItem) {
        if updated.id == task.id {
            onChange(task.merged(with: updated))
        } else {
            var parent = task
            parent.subtasks = subtasks.map { $0.id == updated.id ? $0.merged(with: updated) : $0 }
            onChange(parent)
        }
    }

    private func addSubtask() {
        let title = newSubtask.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        newSubtask = ""
        Task {
            if let created = await model.createSubtask(parent: task, title: title) {
                var parent = task
                parent.subtasks = subtasks + [created]
                onChange(parent)
            }
        }
    }
}

/// Task card for the Tasks list (web `TaskItem`): title, pin, description, badges, subtask progress.
struct TaskRow: View {
    let task: TaskItem
    var selectable = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(task.title)
                    .strikethrough(task.completed)
                    .foregroundStyle(task.completed ? .secondary : .primary)
                    .lineLimit(2)
                if task.pinned {
                    Image(systemName: "pin.fill").font(.caption2).foregroundStyle(Color("Warm")).accessibilityLabel("Pinned")
                }
            }
            if !task.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(task.description).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            HStack(spacing: 8) {
                if Priority(value: task.priority) != .none {
                    HStack(spacing: 3) {
                        PriorityIcon(priority: task.priority).accessibilityHidden(true)
                        Text(Priority(value: task.priority).label).font(.caption)
                    }
                    .foregroundStyle(Priority(value: task.priority).color)
                }
                TagEmojis(tags: task.resolvedTags)
                StatusBadge(status: task.status)
                DueBadge(dueAt: task.dueAt, completed: task.completed)
                if task.subtaskCount > 0 {
                    Label("\(task.subtaskDone)/\(task.subtaskCount)", systemImage: "list.bullet")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
