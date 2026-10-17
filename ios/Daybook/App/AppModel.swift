import DaybookKit
import Foundation
import Observation
import SwiftUI

enum AppTab: Hashable { case today, tasks, notes, settings }

/// Persisted view preferences (web `usePreferences`).
struct Preferences: Codable, Equatable {
    enum TaskGroupBy: String, Codable, CaseIterable { case none, status, priority, tag }
    enum TaskOrderBy: String, Codable, CaseIterable { case created, due }
    enum DiaryTaskSort: String, Codable, CaseIterable { case manual, created, priority }
    enum Appearance: String, Codable, CaseIterable { case system, light, dark }

    var defaultWorkspace: String?
    var taskGroupBy: TaskGroupBy = .status
    var taskOrderBy: TaskOrderBy = .created
    var taskShowDone = true
    var diaryHideDone = false
    var diaryJournalCollapsed = false
    var diaryGoalsCollapsed = false
    var diaryTaskSort: DiaryTaskSort = .manual
    var appearance: Appearance = .system

    init() {}

    // Tolerate older/newer stored blobs.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        defaultWorkspace = try c.decodeIfPresent(String.self, forKey: .defaultWorkspace)
        taskGroupBy = (try? c.decode(TaskGroupBy.self, forKey: .taskGroupBy)) ?? .status
        taskOrderBy = (try? c.decode(TaskOrderBy.self, forKey: .taskOrderBy)) ?? .created
        taskShowDone = (try? c.decode(Bool.self, forKey: .taskShowDone)) ?? true
        diaryHideDone = (try? c.decode(Bool.self, forKey: .diaryHideDone)) ?? false
        diaryJournalCollapsed = (try? c.decode(Bool.self, forKey: .diaryJournalCollapsed)) ?? false
        diaryGoalsCollapsed = (try? c.decode(Bool.self, forKey: .diaryGoalsCollapsed)) ?? false
        diaryTaskSort = (try? c.decode(DiaryTaskSort.self, forKey: .diaryTaskSort)) ?? .manual
        appearance = (try? c.decode(Appearance.self, forKey: .appearance)) ?? .system
    }
}

struct ToastMessage: Identifiable, Equatable {
    enum Style { case success, error, neutral }
    let id = UUID()
    var title: String
    var detail: String?
    var style: Style
}

@MainActor
@Observable
final class AppModel {
    /// `.server`: no server configured (debug builds only) or the server can't be reached.
    enum Phase: Equatable { case loading, server, setup, login, ready }

    /// The production server, built into every build. See DEPLOY.md.
    static let builtInServer = URL(string: "https://rc-notes-production-a50f.up.railway.app")!

    /// Debug builds can point at another server (a local dev server, the UI-test server); release
    /// builds always use `builtInServer`.
    static var allowsServerOverride: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }

    /// UI tests pass `-uiTesting` and must never fall back to the production server.
    private static let isUITesting = ProcessInfo.processInfo.arguments.contains("-uiTesting")

    private enum Keys {
        static let serverURL = "serverURL"
        static let workspace = "workspace"
        static let preferences = "preferences"
    }

    var phase: Phase = .loading
    private(set) var api: APIClient?
    private(set) var user: SessionUser?
    var authNotice: String?
    private(set) var workspaces: [Workspace] = []
    var activeWorkspaceId: String? {
        didSet {
            guard oldValue != activeWorkspaceId else { return }
            defaults.set(activeWorkspaceId ?? "", forKey: Keys.workspace)
        }
    }
    var prefs = Preferences() {
        didSet {
            guard oldValue != prefs, let data = try? JSONEncoder().encode(prefs) else { return }
            defaults.set(data, forKey: Keys.preferences)
        }
    }
    var toast: ToastMessage?
    var selectedTab: AppTab = .today
    /// Set by other tabs (e.g. a diary note in Notes) to open a day on Today.
    var requestedDiaryDate: String?

    let days = DayMath.current
    let draftStore = FileDraftStore.standard()
    private let defaults = UserDefaults.standard

    init() {
        if ProcessInfo.processInfo.arguments.contains("-uiTestReset") {
            Self.resetLocalState()
        }
        if let data = defaults.data(forKey: Keys.preferences), let stored = try? JSONDecoder().decode(Preferences.self, from: data) {
            prefs = stored
        }
        if let stored = defaults.string(forKey: Keys.workspace) {
            activeWorkspaceId = stored.isEmpty ? nil : stored
        } else {
            activeWorkspaceId = prefs.defaultWorkspace
        }
        if Self.allowsServerOverride, let raw = defaults.string(forKey: Keys.serverURL), let url = APIClient.normalizeServerURL(raw) {
            api = makeClient(url)
        } else if !Self.isUITesting {
            // Release builds drop any address stored by older builds that asked for one.
            if !Self.allowsServerOverride { defaults.removeObject(forKey: Keys.serverURL) }
            api = makeClient(Self.builtInServer)
        }
    }

    /// Clears everything this app stores locally (UI tests start from a clean slate).
    static func resetLocalState() {
        if let domain = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: domain)
        }
        HTTPCookieStorage.shared.cookies?.forEach(HTTPCookieStorage.shared.deleteCookie)
        FileDraftStore.standard().removeAll()
        SessionCookieVault.clearAll()
    }

    var serverURLString: String { api?.baseURL.absoluteString ?? "" }

    var activeWorkspace: Workspace? { workspaces.first { $0.id == activeWorkspaceId } }

    func workspace(_ id: String?) -> Workspace? { workspaces.first { $0.id == id } }

    private func makeClient(_ url: URL) -> APIClient {
        SessionCookieVault.restore(for: url)
        return APIClient(baseURL: url) { [weak self] in
            Task { @MainActor in self?.handleUnauthorized() }
        }
    }

    // MARK: Auth flow (web `useAuth`)

    func bootstrap() async {
        // A server URL passed as a launch argument (UI tests) wins over the stored one (debug only).
        if Self.allowsServerOverride,
           let raw = defaults.volatileDomain(forName: UserDefaults.argumentDomain)[Keys.serverURL] as? String,
           let url = APIClient.normalizeServerURL(raw), api?.baseURL != url {
            api = makeClient(url)
        }
        guard api != nil else {
            phase = .server
            return
        }
        await checkAuth(silent: false)
    }

    /// Validates a typed server address against `/api/setup/status` before saving it (debug only).
    func connect(to raw: String) async throws {
        guard Self.allowsServerOverride else { throw APIError.invalidURL }
        guard let url = APIClient.normalizeServerURL(raw) else { throw APIError.invalidURL }
        let client = makeClient(url)
        _ = try await client.setupStatus()
        api = client
        defaults.set(url.absoluteString, forKey: Keys.serverURL)
        await checkAuth(silent: false)
    }

    func changeServer() async {
        guard Self.allowsServerOverride else { return }
        await logout()
        api = nil
        user = nil
        workspaces = []
        defaults.removeObject(forKey: Keys.serverURL)
        phase = .server
    }

    @discardableResult
    func checkAuth(silent: Bool) async -> Bool {
        guard let api else {
            phase = .server
            return false
        }
        let wasReady = phase == .ready && user != nil
        if !silent { phase = .loading }
        do {
            let check = try await api.authCheck()
            if !check.configured {
                phase = .setup
                user = nil
                authNotice = nil
            } else if let sessionUser = check.user {
                SessionCookieVault.capture(for: api.baseURL)
                user = sessionUser
                authNotice = nil
                phase = .ready
                await fetchWorkspaces()
            } else {
                SessionCookieVault.clear(for: api.baseURL)
                user = nil
                if wasReady { authNotice = "Your session expired. Sign in to keep working." }
                phase = .login
            }
            return check.user != nil
        } catch {
            // A transient network failure is not proof the session expired.
            if !silent && !wasReady {
                phase = .server
                authNotice = "Could not reach \(api.baseURL.absoluteString). \(error.localizedDescription)"
            }
            return wasReady
        }
    }

    private func handleUnauthorized() {
        guard phase == .ready else { return }
        user = nil
        authNotice = "Your session expired. Sign in to keep working."
        phase = .login
    }

    private func signedIn(_ sessionUser: SessionUser) async {
        if let api { SessionCookieVault.capture(for: api.baseURL) }
        user = sessionUser
        authNotice = nil
        phase = .ready
        await fetchWorkspaces()
    }

    func login(username: String, password: String) async throws {
        guard let api else { throw APIError.invalidURL }
        await signedIn(try await api.login(username: username, password: password))
    }

    func setup(username: String, password: String) async throws {
        guard let api else { throw APIError.invalidURL }
        await signedIn(try await api.setup(username: username, password: password))
    }

    func logout() async {
        try? await api?.logout()
        if let api { SessionCookieVault.clear(for: api.baseURL) }
        user = nil
        authNotice = nil
        if api != nil { phase = .login }
    }

    // MARK: Workspaces

    func fetchWorkspaces() async {
        guard let api else { return }
        if let list = try? await api.workspaces() {
            workspaces = list.sorted { $0.position < $1.position }
            if let active = activeWorkspaceId, !list.contains(where: { $0.id == active }) {
                activeWorkspaceId = nil
            }
        }
    }

    @discardableResult
    func createWorkspace(name: String, emoji: String) async throws -> Workspace {
        guard let api else { throw APIError.invalidURL }
        let created = try await api.createWorkspace(name: name, emoji: emoji.isEmpty ? "📁" : emoji)
        await fetchWorkspaces()
        return created
    }

    // MARK: Feedback

    func showToast(_ title: String, detail: String? = nil, style: ToastMessage.Style = .neutral) {
        toast = ToastMessage(title: title, detail: detail, style: style)
    }

    func showError(_ title: String, _ error: Error) {
        if error is CancellationError { return }
        showToast(title, detail: error.localizedDescription, style: .error)
    }
}
