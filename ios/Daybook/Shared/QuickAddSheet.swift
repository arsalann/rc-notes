import DaybookKit
import SwiftUI

/// What QuickAdd hands back (web `QuickAdd` `add` event).
struct QuickAddResult {
    var title: String
    var dueAt: String?
    var subtasks: [String]
    var tags: [String]
    var priority: Int
    var status: TaskStatus
}

/// New task sheet: title with live hashtag capture, priority, status, due shortcuts, tags, subtasks.
struct QuickAddSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var defaultStatus: TaskStatus = .next
    /// Due day used when nothing is chosen (Today uses the selected page's day).
    var defaultDueDay: String?
    let onAdd: (QuickAddResult) async -> Void
    /// Creating from a template (Settings → Templates); the section shows when there are templates.
    var onTemplate: ((TaskTemplate) async -> Void)? = nil

    @State private var title = ""
    @State private var priority: Int = Priority.focus.rawValue
    @State private var status: TaskStatus = .next
    @State private var dueDay: String?
    @State private var customDue = Date()
    @State private var useCustomDue = false
    @State private var tags: [String] = []
    @State private var subtasks: [String] = []
    @State private var newSubtask = ""
    @State private var submitting = false
    @FocusState private var titleFocused: Bool

    private var parsed: ParsedTitle { Hashtags.parse(title, days: model.days) }

    private var captureSummary: [String] {
        var summary: [String] = []
        if let p = parsed.priority { summary.append(Priority(value: p).label) }
        if let s = parsed.status { summary.append(s.label) }
        if let d = parsed.dueDay { summary.append(model.days.shortLabel(d)) }
        let preview = TaskTags.resolve(title: parsed.title, manualTags: Hashtags.mergeManualTags(parsed.tags, tags)).resolved
        summary += preview.map { tag in tag.emoji.map { "\($0) \(tag.label)" } ?? "#\(tag.label)" }
        return summary
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What needs doing?", text: $title, axis: .vertical)
                        .focused($titleFocused)
                        .submitLabel(.done)
                        .accessibilityIdentifier("quickadd.title")
                    if !captureSummary.isEmpty {
                        Text("Will capture: " + captureSummary.joined(separator: " · "))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Tip: #critical #focus #snack · #now #next · #today #tomorrow #nextweek · any #tag")
                }

                if let onTemplate, !model.templates.isEmpty {
                    Section("From template") {
                        ForEach(model.templates) { template in
                            Button {
                                submitting = true
                                Task {
                                    await onTemplate(template)
                                    submitting = false
                                    dismiss()
                                }
                            } label: {
                                HStack {
                                    Label(template.name, systemImage: "square.on.square")
                                    Spacer()
                                    if !template.subtasks.isEmpty {
                                        Text("\(template.subtasks.count) subtask\(template.subtasks.count == 1 ? "" : "s")")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .disabled(submitting)
                            .accessibilityIdentifier("quickadd.template.\(template.name)")
                        }
                    }
                }

                Section("Subtasks") {
                    ForEach(subtasks.indices, id: \.self) { index in
                        Text(subtasks[index])
                    }
                    .onDelete { subtasks.remove(atOffsets: $0) }
                    HStack {
                        TextField("Add subtask", text: $newSubtask)
                            .onSubmit(addSubtask)
                            .accessibilityIdentifier("quickadd.subtask")
                        Button("Add", action: addSubtask)
                            .disabled(newSubtask.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                Section("Due") {
                    HStack {
                        dueChip("Today", model.days.today())
                        dueChip("Tomorrow", model.days.offsetFromToday(1))
                        dueChip("Next week", model.days.offsetFromToday(7))
                    }
                    Toggle("Pick date & time", isOn: $useCustomDue)
                    if useCustomDue {
                        DatePicker("Due", selection: $customDue)
                    }
                }

                Section {
                    Picker("Priority", selection: $priority) {
                        ForEach(Priority.options) { p in Label(p.label, systemImage: p.symbol).tag(p.rawValue) }
                        Label("None", systemImage: "minus").tag(0)
                    }
                    Picker("Status", selection: $status) {
                        ForEach(TaskStatus.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Tags") {
                    TagPicker(tags: $tags)
                }

            }
            .navigationTitle("New task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", action: submit)
                        .disabled(parsed.title.isEmpty || submitting)
                        .accessibilityIdentifier("quickadd.submit")
                }
            }
            .onAppear {
                status = defaultStatus
                titleFocused = true
            }
            // Recognised hashtags drive the controls, as on the web.
            .onChange(of: parsed.priority) { _, p in if let p { priority = p } }
            .onChange(of: parsed.status) { _, s in if let s { status = s } }
            .onChange(of: parsed.dueDay) { _, d in if let d { dueDay = d; useCustomDue = false } }
        }
    }

    private func dueChip(_ label: String, _ day: String) -> some View {
        Button(label) {
            dueDay = dueDay == day ? nil : day
            useCustomDue = false
        }
        .buttonStyle(.bordered)
        .tint(dueDay == day && !useCustomDue ? .accentColor : .secondary)
        .controlSize(.small)
    }

    private func addSubtask() {
        let text = newSubtask.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        subtasks.append(text)
        newSubtask = ""
    }

    private func submit() {
        let p = parsed
        guard !p.title.isEmpty else { return }
        addSubtask()
        let due: String?
        if let d = p.dueDay {
            due = model.days.dueISO(d)
        } else if useCustomDue {
            due = DayMath.isoString(customDue)
        } else if let d = dueDay ?? defaultDueDay {
            due = model.days.dueISO(d)
        } else {
            due = nil
        }
        let result = QuickAddResult(
            title: p.title, dueAt: due, subtasks: subtasks,
            tags: Hashtags.mergeManualTags(p.tags, tags),
            priority: p.priority ?? priority, status: p.status ?? status
        )
        submitting = true
        Task {
            await onAdd(result)
            submitting = false
            dismiss()
        }
    }
}

/// Catalog tag multi-select (web `TaskTagPicker`).
struct TagPicker: View {
    @Binding var tags: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(TaskTags.catalog, id: \.key) { tag in
                    let selected = TaskTags.isSelected(key: tag.key, in: tags)
                    Button {
                        tags = TaskTags.toggle(key: tag.key, in: tags)
                    } label: {
                        Text("\(tag.emoji) \(tag.label)")
                            .font(.subheadline)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(selected ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.1), in: Capsule())
                            .overlay(Capsule().strokeBorder(selected ? Color.accentColor : .clear))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.vertical, 2)
        }
    }
}
