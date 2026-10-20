import DaybookKit
import SwiftUI

/// Tasks completed per day in a Sunday–Saturday week, plus what is still outstanding.
struct WeekSummaryView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let model: TodayModel

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Button { Task { await model.shiftWeek(-1) } } label: { Image(systemName: "chevron.left") }
                            .accessibilityLabel("Previous week")
                        Spacer()
                        VStack {
                            Text(app.days.weekRangeLabel(model.weekStart.isEmpty ? model.currentWeekStart : model.weekStart))
                                .font(.headline)
                            Text("\(model.weekTotal) completed").font(.subheadline).foregroundStyle(.secondary)
                                .accessibilityIdentifier("week.total")
                        }
                        Spacer()
                        Button { Task { await model.shiftWeek(1) } } label: { Image(systemName: "chevron.right") }
                            .disabled(model.weekStart >= model.currentWeekStart)
                            .accessibilityLabel("Next week")
                    }
                    .buttonStyle(.borderless)
                }

                if model.weekLoading {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    ForEach(model.weekDays) { day in
                        Section {
                            if day.groups.isEmpty {
                                Text("Nothing completed").foregroundStyle(.tertiary)
                            }
                            ForEach(day.groups) { group in
                                VStack(alignment: .leading, spacing: 4) {
                                    if let title = group.parentTitle {
                                        HStack(spacing: 6) {
                                            Image(systemName: group.parentCompletedThisDay ? "checkmark.circle.fill" : "circle.dashed")
                                                .foregroundStyle(group.parentCompletedThisDay ? Color.accentColor : .secondary)
                                            Text(title)
                                            Spacer()
                                            if let displayId = group.parentDisplayId {
                                                Text(displayId).font(.caption2.monospaced()).foregroundStyle(.tertiary)
                                            }
                                        }
                                    }
                                    ForEach(group.subtasks) { sub in
                                        HStack(spacing: 6) {
                                            Image(systemName: "checkmark").font(.caption).foregroundStyle(Color.accentColor)
                                            Text(sub.title).font(.subheadline)
                                        }
                                        .padding(.leading, 22)
                                    }
                                }
                            }
                        } header: {
                            HStack {
                                Text(day.label)
                                if day.isToday { Text("Today").foregroundStyle(Color.accentColor) }
                                Spacer()
                                Text("\(day.count)").monospacedDigit()
                            }
                        }
                    }
                }

                Section("Outstanding") {
                    if model.outstandingLoading {
                        ProgressView()
                    } else if model.outstanding.isEmpty {
                        Text("Nothing is overdue or in Now.").foregroundStyle(.secondary)
                    } else {
                        ForEach(model.outstanding) { task in
                            HStack {
                                PriorityIcon(priority: task.priority)
                                Text(task.title)
                                Spacer()
                                let label = app.days.outstandingDueLabel(task.dueAt, isOverdue: task.isOverdue ?? false)
                                if !label.isEmpty {
                                    Text(label).font(.caption).foregroundStyle(task.isOverdue == true ? .red : .secondary)
                                } else {
                                    StatusBadge(status: task.status)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Week summary")
            .inlineNavigationTitle()
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { await model.openWeekSummary() }
        }
    }
}

/// Unified search across tasks and notes, scoped to the active workspace (300 ms debounce).
struct SearchView: View {
    @Environment(AppModel.self) private var app
    @State private var query = ""
    @State private var results: [SearchResult] = []
    @State private var searching = false

    var body: some View {
        List {
            if searching { ProgressView().frame(maxWidth: .infinity) }
            ForEach(results) { result in
                NavigationLink(value: result.type == "note" ? Route.note(result.id) : Route.task(result.id)) {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: result.type == "note" ? "doc.text" : (result.completed ? "checkmark.circle.fill" : "circle"))
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(result.title)
                            if !result.detail.isEmpty {
                                Text(result.detail).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                        }
                        Spacer()
                        Text(result.type == "note" ? "Note" : "Task").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .accessibilityIdentifier("search.result.\(result.title)")
            }
            if !query.trimmingCharacters(in: .whitespaces).isEmpty && results.isEmpty && !searching {
                ContentUnavailableView.search(text: query)
            }
        }
        .navigationTitle("Search")
        .searchable(text: $query, placement: .alwaysVisible, prompt: "Tasks and notes")
        .task(id: query) {
            let q = query.trimmingCharacters(in: .whitespaces)
            guard !q.isEmpty else {
                results = []
                return
            }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled, let repo = app.repo else { return }
            searching = true
            defer { searching = false }
            results = (try? await repo.search(q, workspaceId: app.activeWorkspaceId)) ?? []
        }
    }
}
