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
        }
        .onChange(of: scenePhase) { _, phase in
            // Web parity: session heartbeat on focus / visibility change.
            if phase == .active, model.phase == .ready {
                Task { await model.checkAuth(silent: true) }
            }
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
    }
}
