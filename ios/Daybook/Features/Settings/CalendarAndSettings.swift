import DaybookKit
import SwiftUI

/// Five-day window (today ±2) of scheduled tasks (web `/calendar`).
struct CalendarView: View {
    @Environment(AppModel.self) private var app
    @State private var data: [CalendarDay] = []
    @State private var selected = ""
    @State private var loading = false

    private var windowDays: [String] { (-2...2).map { app.days.offsetFromToday($0) } }
    private var selectedTasks: [TaskItem] { data.first { $0.date == selected }?.tasks ?? [] }

    var body: some View {
        List {
            Section {
                HStack(spacing: 4) {
                    ForEach(windowDays, id: \.self) { date in
                        let count = data.first { $0.date == date }?.tasks.count ?? 0
                        Button { selected = date } label: {
                            VStack(spacing: 4) {
                                Text(app.days.weekdayShort(date)).font(.caption).foregroundStyle(.secondary)
                                Text("\(app.days.dayNumber(date))")
                                    .font(.title3.weight(date == app.days.today() ? .bold : .regular))
                                    .foregroundStyle(date == app.days.today() ? Color.accentColor : .primary)
                                HStack(spacing: 2) {
                                    ForEach(0..<min(count, 4), id: \.self) { _ in Circle().fill(Color("Warm")).frame(width: 4, height: 4) }
                                }
                                .frame(height: 4)
                            }
                            .frame(maxWidth: .infinity, minHeight: 64)
                            .background(selected == date ? Color.accentColor.opacity(0.15) : .clear, in: RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(app.days.longLabel(date)), \(count) task\(count == 1 ? "" : "s")")
                        .accessibilityIdentifier("calendar.\(date)")
                    }
                }
            }
            Section(app.days.relativeDayLabel(selected.isEmpty ? app.days.today() : selected)) {
                if loading && data.isEmpty {
                    ProgressView()
                } else if selectedTasks.isEmpty {
                    Text("Nothing scheduled.").foregroundStyle(.secondary)
                }
                ForEach(selectedTasks) { task in
                    HStack(spacing: 10) {
                        CompletionButton(completed: task.completed) { Task { await toggle(task) } }
                        NavigationLink(value: Route.task(task.id)) { TaskRow(task: task) }
                    }
                }
            }
        }
        .navigationTitle("Calendar")
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: app.activeWorkspaceId) { Task { await load() } }
    }

    private func load() async {
        if selected.isEmpty { selected = app.days.today() }
        loading = true
        defer { loading = false }
        data = (try? await app.api?.calendar(workspaceId: app.activeWorkspaceId)) ?? data
    }

    /// Optimistic toggle (web flips `status` between done and now here).
    private func toggle(_ task: TaskItem) async {
        func set(_ update: (inout TaskItem) -> Void) {
            for d in data.indices {
                if let t = data[d].tasks.firstIndex(where: { $0.id == task.id }) { update(&data[d].tasks[t]) }
            }
        }
        set { $0.completed.toggle(); $0.status = $0.completed ? .done : .now }
        if let saved = await app.setCompleted(task, !task.completed) {
            set { $0 = $0.merged(with: saved) }
        }
    }
}

/// Account, server, password, users (admin), workspaces, default views, appearance.
struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var changingPassword = false
    @State private var users: [AdminUser] = []
    @State private var newUsername = ""
    @State private var newUserPassword = ""
    @State private var addingUser = false
    @State private var creatingWorkspace = false
    @State private var confirmSignOut = false
    @State private var confirmChangeServer = false
    @State private var userToDelete: AdminUser?

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            Form {
                Section("Account") {
                    LabeledContent("Username", value: app.user?.username ?? "")
                    LabeledContent("Role", value: app.user?.isAdmin == true ? "Admin" : "Member")
                    LabeledContent("User ID") {
                        Text(app.user?.id ?? "").font(.caption.monospaced()).textSelection(.enabled)
                    }
                    Button("Sign out", role: .destructive) { confirmSignOut = true }
                        .accessibilityIdentifier("settings.signOut")
                }

                Section("Server") {
                    LabeledContent("Address", value: app.serverURLString)
                    Button("Change server…") { confirmChangeServer = true }
                }

                Section("Change password") {
                    SecureField("Current password", text: $currentPassword).textContentType(.password)
                    SecureField("New password (8+ characters)", text: $newPassword).textContentType(.newPassword)
                    SecureField("Confirm new password", text: $confirmPassword).textContentType(.newPassword)
                    Button("Update password") { Task { await changePassword() } }
                        .disabled(currentPassword.isEmpty || newPassword.count < 8 || changingPassword)
                }

                if app.user?.isAdmin == true {
                    Section("Users") {
                        ForEach(users) { user in
                            HStack {
                                Text(user.username)
                                if user.isAdmin { Text("Admin").font(.caption).foregroundStyle(.secondary) }
                                Spacer()
                            }
                            .swipeActions {
                                if user.id != app.user?.id {
                                    Button("Delete", role: .destructive) { userToDelete = user }
                                }
                            }
                        }
                        TextField("New username", text: $newUsername)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecureField("Password (8+ characters)", text: $newUserPassword)
                        Button("Add user") { Task { await addUser() } }
                            .disabled(newUsername.isEmpty || newUserPassword.count < 8 || addingUser)
                    }
                }

                Section("Workspaces") {
                    ForEach(app.workspaces) { ws in Text(ws.label) }
                    Button("New workspace", systemImage: "plus") { creatingWorkspace = true }
                }

                Section("Default views") {
                    Picker("Default workspace", selection: Binding(
                        get: { app.prefs.defaultWorkspace },
                        set: { app.prefs.defaultWorkspace = $0; app.activeWorkspaceId = $0 }
                    )) {
                        Text("All").tag(String?.none)
                        ForEach(app.workspaces) { Text($0.label).tag(Optional($0.id)) }
                    }
                    Picker("Group tasks by", selection: $app.prefs.taskGroupBy) {
                        Text("Status").tag(Preferences.TaskGroupBy.status)
                        Text("Priority").tag(Preferences.TaskGroupBy.priority)
                        Text("Tag").tag(Preferences.TaskGroupBy.tag)
                        Text("None").tag(Preferences.TaskGroupBy.none)
                    }
                    Picker("Order tasks by", selection: $app.prefs.taskOrderBy) {
                        Text("Newest").tag(Preferences.TaskOrderBy.created)
                        Text("Due date").tag(Preferences.TaskOrderBy.due)
                    }
                    Toggle("Show done tasks", isOn: $app.prefs.taskShowDone)
                }

                Section("Appearance") {
                    Picker("Theme", selection: $app.prefs.appearance) {
                        ForEach(Preferences.Appearance.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
                }
            }
            .navigationTitle("Settings")
            .task {
                await app.fetchWorkspaces()
                if app.user?.isAdmin == true { users = (try? await app.api?.users()) ?? [] }
            }
            .sheet(isPresented: $creatingWorkspace) { NewWorkspaceSheet() }
            .confirmationDialog("Sign out of daybook?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Task { await app.logout() } }
            }
            .confirmationDialog("Change server?", isPresented: $confirmChangeServer, titleVisibility: .visible) {
                Button("Sign out and change server", role: .destructive) { Task { await app.changeServer() } }
            }
            .confirmationDialog("Delete \(userToDelete?.username ?? "user")?", isPresented: Binding(
                get: { userToDelete != nil }, set: { if !$0 { userToDelete = nil } }
            ), titleVisibility: .visible) {
                Button("Delete user", role: .destructive) {
                    if let user = userToDelete { Task { await deleteUser(user) } }
                }
            } message: {
                Text("Their account is removed permanently.")
            }
        }
    }

    private func changePassword() async {
        guard newPassword == confirmPassword else {
            app.showToast("Passwords do not match", style: .error)
            return
        }
        changingPassword = true
        defer { changingPassword = false }
        do {
            try await app.api?.changePassword(current: currentPassword, new: newPassword)
            app.showToast("Password updated", style: .success)
            currentPassword = ""
            newPassword = ""
            confirmPassword = ""
        } catch {
            app.showError("Failed", error)
        }
    }

    private func addUser() async {
        addingUser = true
        defer { addingUser = false }
        do {
            try await app.api?.createUser(username: newUsername, password: newUserPassword)
            app.showToast("User \"\(newUsername)\" created", style: .success)
            newUsername = ""
            newUserPassword = ""
            users = (try? await app.api?.users()) ?? users
        } catch {
            app.showError("Failed", error)
        }
    }

    private func deleteUser(_ user: AdminUser) async {
        do {
            try await app.api?.deleteUser(id: user.id)
            app.showToast("User deleted", style: .success)
            users = (try? await app.api?.users()) ?? users
        } catch {
            app.showError("Failed", error)
        }
    }
}
