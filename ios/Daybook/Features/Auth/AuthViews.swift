import DaybookKit
import SwiftUI

/// Brand header shared by the server, setup and login screens.
struct BrandHeader: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "sun.max.fill")
                .font(.system(size: 44))
                .foregroundStyle(Color("Warm"))
                .accessibilityHidden(true)
            Text("daybook")
                .font(.system(.largeTitle, design: .serif).weight(.semibold))
            Text("A quiet place for your day")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .listRowBackground(Color.clear)
    }
}

/// Shown when the server can't be reached. Release builds offer a retry against the built-in server;
/// debug builds also let you type another address (local dev server, UI tests).
struct ServerView: View {
    @Environment(AppModel.self) private var model
    @State private var address = ""
    @State private var connecting = false
    @State private var error: String?

    var body: some View {
        if AppModel.allowsServerOverride { addressForm } else { unreachable }
    }

    private var unreachable: some View {
        NavigationStack {
            Form {
                BrandHeader()
                Section {
                    Label("Can't reach daybook", systemImage: "wifi.exclamationmark")
                        .font(.headline)
                } footer: {
                    Text("Check your internet connection and try again.")
                }
                if let message = model.authNotice {
                    Section { Text(message).font(.footnote).foregroundStyle(.secondary) }
                }
                Section {
                    Button {
                        guard !connecting else { return }
                        connecting = true
                        Task {
                            defer { connecting = false }
                            await model.checkAuth(silent: false)
                        }
                    } label: {
                        HStack {
                            Text("Try again")
                            Spacer()
                            if connecting { ProgressView() }
                        }
                    }
                    .disabled(connecting)
                    .accessibilityIdentifier("server.retry")
                }
            }
        }
    }

    private var addressForm: some View {
        NavigationStack {
            Form {
                BrandHeader()
                Section {
                    TextField("http://192.168.1.20:3000", text: $address)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .onSubmit(connect)
                        .accessibilityIdentifier("server.url")
                } header: {
                    Text("Server")
                } footer: {
                    Text("Enter the address you open daybook with in your browser.")
                }
                if let message = error ?? model.authNotice {
                    Section { Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(.red) }
                }
                Section {
                    Button(action: connect) {
                        HStack {
                            Text("Connect")
                            Spacer()
                            if connecting { ProgressView() }
                        }
                    }
                    .disabled(address.trimmingCharacters(in: .whitespaces).isEmpty || connecting)
                    .accessibilityIdentifier("server.connect")
                }
            }
            .onAppear { if address.isEmpty { address = model.serverURLString } }
        }
    }

    private func connect() {
        guard !connecting else { return }
        connecting = true
        error = nil
        Task {
            defer { connecting = false }
            do {
                try await model.connect(to: address)
            } catch {
                self.error = "Could not connect: \(error.localizedDescription)"
            }
        }
    }
}

private struct CredentialsForm: View {
    @Binding var username: String
    @Binding var password: String
    @Binding var confirm: String
    var needsConfirm: Bool

    var body: some View {
        Section {
            TextField("Username", text: $username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityIdentifier("auth.username")
            SecureField("Password", text: $password)
                .textContentType(needsConfirm ? .newPassword : .password)
                .accessibilityIdentifier("auth.password")
            if needsConfirm {
                SecureField("Confirm password", text: $confirm)
                    .textContentType(.newPassword)
                    .accessibilityIdentifier("auth.confirm")
            }
        } footer: {
            if needsConfirm { Text("At least 2 characters for the username and 8 for the password.") }
        }
    }
}

/// Sign in or create an account (web `/login`).
struct LoginView: View {
    enum Mode { case login, signup }

    @Environment(AppModel.self) private var model
    @State private var mode: Mode = .login
    @State private var username = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var submitting = false
    @State private var error: String?

    private var canSubmit: Bool {
        guard !username.isEmpty, !password.isEmpty else { return false }
        if mode == .signup { return username.count >= 2 && password.count >= 8 && password == confirm }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                BrandHeader()
                if let notice = model.authNotice {
                    Section { Label(notice, systemImage: "clock.badge.exclamationmark").foregroundStyle(Color("Warm")) }
                        .accessibilityIdentifier("auth.notice")
                }
                Picker("Mode", selection: $mode) {
                    Text("Sign in").tag(Mode.login)
                    Text("Create account").tag(Mode.signup)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                CredentialsForm(username: $username, password: $password, confirm: $confirm, needsConfirm: mode == .signup)
                if let error {
                    Section { Text(error).foregroundStyle(.red) }.accessibilityIdentifier("auth.error")
                }
                Section {
                    Button(mode == .login ? "Sign in" : "Create account", action: submit)
                        .disabled(!canSubmit || submitting)
                        .accessibilityIdentifier("auth.submit")
                }
                if AppModel.allowsServerOverride {
                    Section {
                        LabeledContent("Server", value: model.serverURLString)
                        Button("Change server") { Task { await model.changeServer() } }
                    }
                }
            }
            .onChange(of: mode) { error = nil; confirm = "" }
        }
    }

    private func submit() {
        guard canSubmit else { return }
        if mode == .signup && password != confirm {
            error = "Passwords do not match"
            return
        }
        submitting = true
        error = nil
        Task {
            defer { submitting = false }
            do {
                if mode == .login {
                    try await model.login(username: username, password: password)
                } else {
                    try await model.signup(username: username, password: password)
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Fresh server: create the first (admin) account, or sign in (web `/setup`).
struct SetupView: View {
    enum Mode { case setup, login }

    @Environment(AppModel.self) private var model
    @State private var mode: Mode = .setup
    @State private var username = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var submitting = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                BrandHeader()
                Section {
                    Text(mode == .setup ? "Create the first account for this daybook server." : "Sign in with an existing account.")
                        .foregroundStyle(.secondary)
                }
                Picker("Mode", selection: $mode) {
                    Text("Set up").tag(Mode.setup)
                    Text("Sign in").tag(Mode.login)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                CredentialsForm(username: $username, password: $password, confirm: $confirm, needsConfirm: mode == .setup)
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Section {
                    Button(mode == .setup ? "Create account" : "Sign in", action: submit)
                        .disabled(!canSubmit || submitting)
                        .accessibilityIdentifier("auth.submit")
                }
                if AppModel.allowsServerOverride {
                    Section {
                        LabeledContent("Server", value: model.serverURLString)
                        Button("Change server") { Task { await model.changeServer() } }
                    }
                }
            }
            .onChange(of: mode) { error = nil; confirm = "" }
        }
    }

    private var canSubmit: Bool {
        if mode == .login { return !username.isEmpty && !password.isEmpty }
        return username.count >= 2 && password.count >= 8 && password == confirm
    }

    private func submit() {
        guard canSubmit else { return }
        submitting = true
        error = nil
        Task {
            defer { submitting = false }
            do {
                if mode == .setup {
                    try await model.setup(username: username, password: password)
                } else {
                    try await model.login(username: username, password: password)
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
