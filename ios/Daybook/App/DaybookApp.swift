import DaybookKit
import SwiftUI

@main
struct DaybookApp: App {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(model.prefs.appearance.colorScheme)
                .task { await model.bootstrap() }
                #if os(macOS)
                .frame(minWidth: 900, minHeight: 600)
                #endif
        }
        #if os(macOS)
        .commands { DaybookCommands(model: model) }
        #endif
        .onChange(of: scenePhase) { _, phase in
            // Web parity: session heartbeat on focus / visibility change; then sync.
            if phase == .active, model.phase == .ready {
                Task {
                    await model.checkAuth(silent: true)
                    await model.syncNow()
                }
            }
            if phase == .background { model.syncBeforeBackground() }
        }
    }
}

extension Preferences.Appearance {
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .server:
                ServerView()
            case .setup:
                SetupView()
            case .login:
                LoginView()
            case .ready:
                MainTabView()
                    .overlay { FirstSyncOverlay() }
            }
        }
        .toastOverlay()
        .animation(.default, value: model.phase)
    }
}

struct MainTabView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.selectedTab) {
            Tab("Today", systemImage: "book", value: AppTab.today) {
                TodayView()
            }
            Tab("Tasks", systemImage: "checkmark.circle", value: AppTab.tasks) {
                TasksView()
            }
            Tab("Notes", systemImage: "doc.text", value: AppTab.notes) {
                NotesView()
            }
            Tab("Settings", systemImage: "gearshape", value: AppTab.settings) {
                SettingsView()
            }
        }
        #if os(macOS)
        // The same tabs as a sidebar: the Mac's navigation idiom.
        .tabViewStyle(.sidebarAdaptable)
        #endif
    }
}

#if os(macOS)
/// Mac menu commands: new task, sync, and a shortcut per section.
struct DaybookCommands: Commands {
    let model: AppModel

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Task") {
                model.selectedTab = .tasks
                model.requestedNewTask = true
            }
            .keyboardShortcut("n")
            .disabled(model.phase != .ready)
        }
        CommandMenu("Go") {
            Button("Today") { model.selectedTab = .today }.keyboardShortcut("1")
            Button("Tasks") { model.selectedTab = .tasks }.keyboardShortcut("2")
            Button("Notes") { model.selectedTab = .notes }.keyboardShortcut("3")
            Button("Settings") { model.selectedTab = .settings }.keyboardShortcut("4")
            Divider()
            Button("Sync Now") { Task { await model.syncNow() } }
                .keyboardShortcut("r")
                .disabled(model.phase != .ready)
        }
    }
}
#endif
