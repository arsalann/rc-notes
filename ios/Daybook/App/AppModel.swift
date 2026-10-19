import DaybookKit
import Foundation
import Network
import Observation
import SwiftUI
import Synchronization
import UIKit

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
    /// Settings → Today page: show the journal / weekly goals cards (per device, like the web).
    var todayShowJournal = true
    var todayShowGoals = true

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
        todayShowJournal = (try? c.decode(Bool.self, forKey: .todayShowJournal)) ?? true
        todayShowGoals = (try? c.decode(Bool.self, forKey: .todayShowGoals)) ?? true
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
        /// The signed-in user, so the app opens offline with the local copy.
        static let sessionUser = "sessionUser"
    }

    var phase: Phase = .loading
    private(set) var api: APIClient?
    private(set) var user: SessionUser?
    var authNotice: String?
    /// The local copy and its sync queue; screens read and write through `repo`.
    private(set) var store: SyncStore?
    private(set) var repo: Repository?
    private(set) var isOnline = true
    private var syncLoop: Task<Void, Never>?
    private let pathMonitor = NWPathMonitor()
    var workspaces: [Workspace] { repo?.workspaces() ?? [] }
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
        pathMonitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in self?.connectivityChanged(online) }
        }
        pathMonitor.start(queue: DispatchQueue(label: "daybook.path"))
    }

    /// `Application Support/Sync/<server>/<user>`: one local copy per server and account.
    static var syncRoot: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Sync", isDirectory: true)
    }

    /// `daybook-ios/0.1.0 (iPhone17,2; iOS 26.0)`: the server records the client kind from the prefix,
    /// and the event log keeps the model and OS.
    static var userAgent: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        var info = utsname()
        uname(&info)
        let model = withUnsafeBytes(of: &info.machine) { raw in
            String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
        }
        return "daybook-ios/\(version) (\(model); iOS \(UIDevice.current.systemVersion))"
    }

    /// Clears everything this app stores locally (UI tests start from a clean slate).
    static func resetLocalState() {
        if let domain = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: domain)
        }
        HTTPCookieStorage.shared.cookies?.forEach(HTTPCookieStorage.shared.deleteCookie)
        FileDraftStore.standard().removeAll()
        SessionCookieVault.clearAll()
        try? FileManager.default.removeItem(at: syncRoot)
    }

    var serverURLString: String { api?.baseURL.absoluteString ?? "" }

    var activeWorkspace: Workspace? { workspaces.first { $0.id == activeWorkspaceId } }

    func workspace(_ id: String?) -> Workspace? { workspaces.first { $0.id == id } }

    private func makeClient(_ url: URL) -> APIClient {
        SessionCookieVault.restore(for: url)
        return APIClient(baseURL: url, userAgent: Self.userAgent, deviceId: UIDevice.current.identifierForVendor?.uuidString.lowercased()) { [weak self] in
            Task { @MainActor in self?.handleUnauthorized() }
        }
    }

    // MARK: Local copy & sync

    /// Opens (or keeps) the local copy for this server and user and starts syncing it.
    private func startSync(for sessionUser: SessionUser) {
        guard let api else { return }
        let host = [api.baseURL.host ?? "server", api.baseURL.port.map(String.init)].compactMap { $0 }.joined(separator: "_")
        let safeUser = sessionUser.id.filter { $0.isLetter || $0.isNumber || $0 == "-" }
        let directory = Self.syncRoot.appendingPathComponent(host, isDirectory: true).appendingPathComponent(safeUser, isDirectory: true)
        if store == nil || storeDirectory != directory {
            #if DEBUG
            let transport: any SyncTransport = SimulatedNetwork(base: api, switch: simulatedOffline)
            #else
            let transport: any SyncTransport = api
            #endif
            let store = SyncStore(transport: transport, directory: directory, drafts: draftStore, userId: sessionUser.id)
            store.onEvent = { [weak self] event in self?.handle(event) }
            self.store = store
            repo = Repository(store: store, days: days)
            storeDirectory = directory
        }
        startSyncLoop()
        Task { await store?.sync() }
    }

    private var storeDirectory: URL?

    #if DEBUG
    /// Debug builds: Settings → Sync → Simulate offline makes every sync fail as if there were no
    /// network (the offline UI test uses it too).
    private let simulatedOffline = OfflineSwitch()
    var simulateOffline: Bool {
        get { simulatedOfflineValue }
        set {
            simulatedOfflineValue = newValue
            simulatedOffline.set(newValue)
            if !newValue { Task { await syncNow() } }
        }
    }
    private var simulatedOfflineValue = false
    #endif

    /// Every 30 s while signed in and in the foreground; changes also sync ~2 s after they are made.
    private func startSyncLoop() {
        syncLoop?.cancel()
        syncLoop = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard let self, !Task.isCancelled else { return }
                if self.phase == .ready, UIApplication.shared.applicationState == .active { await self.store?.sync() }
            }
        }
    }

    /// Sync now (pull to refresh, Settings → Sync now, coming back to the app).
    func syncNow() async {
        guard phase == .ready else { return }
        await store?.sync()
    }

    /// Going to the background: send queued changes while iOS gives the app a few seconds.
    func syncBeforeBackground() {
        guard let store, !store.outbox.isEmpty else { return }
        var taskId: UIBackgroundTaskIdentifier = .invalid
        taskId = UIApplication.shared.beginBackgroundTask(withName: "daybook-sync") {
            UIApplication.shared.endBackgroundTask(taskId)
        }
        Task {
            await store.sync()
            UIApplication.shared.endBackgroundTask(taskId)
        }
    }

    private func connectivityChanged(_ online: Bool) {
        let cameBack = online && !isOnline
        isOnline = online
        if cameBack { Task { await syncNow() } }
    }

    private func handle(_ event: SyncStore.Event) {
        switch event {
        case .journalConflict(let date):
            showToast("Journal for \(days.relativeDayLabel(date)) changed elsewhere",
                      detail: "Your writing is kept on that page as a draft: Restore or Discard it.", style: .error)
        case .rejected(let summary, let message):
            showToast("A change could not be saved", detail: message.isEmpty ? summary : "\(summary): \(message)", style: .error)
        }
    }

    private var cachedUser: SessionUser? {
        get {
            defaults.data(forKey: Keys.sessionUser).flatMap { try? JSONDecoder().decode(SessionUser.self, from: $0) }
        }
        set {
            if let newValue, let data = try? JSONEncoder().encode(newValue) {
                defaults.set(data, forKey: Keys.sessionUser)
            } else {
                defaults.removeObject(forKey: Keys.sessionUser)
            }
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
        store = nil
        repo = nil
        storeDirectory = nil
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
                cachedUser = sessionUser
                authNotice = nil
                phase = .ready
                startSync(for: sessionUser)
            } else {
                SessionCookieVault.clear(for: api.baseURL)
                user = nil
                if wasReady { authNotice = "Your session expired. Sign in to keep working." }
                phase = .login
            }
            return check.user != nil
        } catch {
            // A transient network failure is not proof the session expired. Offline with a known
            // user: open with the local copy; changes queue until the server is reachable.
            if !silent && !wasReady {
                if let cached = cachedUser {
                    user = cached
                    authNotice = nil
                    phase = .ready
                    startSync(for: cached)
                    return true
                }
                phase = .server
                authNotice = "Could not reach \(api.baseURL.absoluteString). \(error.localizedDescription)"
            }
            return wasReady
        }
    }

    private func handleUnauthorized() {
        guard phase == .ready else { return }
        syncLoop?.cancel()
        user = nil
        authNotice = "Your session expired. Sign in to keep working."
        phase = .login
    }

    private func signedIn(_ sessionUser: SessionUser) async {
        if let api { SessionCookieVault.capture(for: api.baseURL) }
        user = sessionUser
        cachedUser = sessionUser
        authNotice = nil
        phase = .ready
        startSync(for: sessionUser)
    }

    func login(username: String, password: String) async throws {
        guard let api else { throw APIError.invalidURL }
        await signedIn(try await api.login(username: username, password: password))
    }

    func setup(username: String, password: String) async throws {
        guard let api else { throw APIError.invalidURL }
        await signedIn(try await api.setup(username: username, password: password))
    }

    /// Sends queued changes first. The local copy stays on the device (per account), so signing back
    /// in continues where it left off; anything still queued is sent then.
    func logout() async {
        await store?.sync()
        syncLoop?.cancel()
        try? await api?.logout()
        if let api { SessionCookieVault.clear(for: api.baseURL) }
        user = nil
        cachedUser = nil
        authNotice = nil
        if api != nil { phase = .login }
    }

    // MARK: Workspaces

    /// Workspaces come from the local copy; this syncs it and drops a filter whose workspace is gone.
    func fetchWorkspaces() async {
        await store?.sync()
        let list = workspaces
        if !list.isEmpty, let active = activeWorkspaceId, !list.contains(where: { $0.id == active }) {
            activeWorkspaceId = nil
        }
    }

    /// Online only (rare, and the server assigns the position).
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

#if DEBUG
final class OfflineSwitch: Sendable {
    private let state = Mutex(false)
    func set(_ value: Bool) { state.withLock { $0 = value } }
    var isOn: Bool { state.withLock { $0 } }
}

/// Sync transport that fails like a dropped connection while the switch is on.
struct SimulatedNetwork: SyncTransport {
    let base: APIClient
    let `switch`: OfflineSwitch

    func push(_ ops: [PushOp]) async throws -> PushResponse {
        if `switch`.isOn { throw APIError.transport("Offline (simulated)") }
        return try await base.push(ops)
    }

    func pull(since: Int64, limit: Int) async throws -> PullResponse {
        if `switch`.isOn { throw APIError.transport("Offline (simulated)") }
        return try await base.pull(since: since, limit: limit)
    }
}
#endif
