import DaybookKit
import SwiftUI

/// Shown on Today when changes are waiting and the last sync failed (usually: offline).
struct SyncBadge: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        if let status = app.store?.status, status.pendingCount > 0, status.lastError != nil || !app.isOnline {
            Button {
                Task { await app.syncNow() }
            } label: {
                Image(systemName: "icloud.slash")
            }
            .accessibilityLabel("\(status.pendingCount) change\(status.pendingCount == 1 ? "" : "s") waiting to sync")
            .accessibilityIdentifier("sync.offline")
        }
    }
}

/// The first download after signing in on this device: nothing local to show yet.
struct FirstSyncOverlay: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        if let store = app.store, !store.hasData {
            VStack(spacing: 14) {
                if let error = store.status.lastError, !store.status.isSyncing {
                    Image(systemName: "icloud.slash").font(.largeTitle).foregroundStyle(.secondary)
                    Text("Can't download your data").font(.headline)
                    Text(error).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button("Try again") { Task { await app.syncNow() } }
                        .buttonStyle(.borderedProminent)
                } else {
                    ProgressView().controlSize(.large)
                    Text("Downloading your data…").foregroundStyle(.secondary)
                }
            }
            .padding(32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.background)
            .accessibilityIdentifier("sync.firstDownload")
        }
    }
}

/// Settings → Sync: what is waiting, when it last synced, and a manual sync.
struct SyncSection: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Section {
            if let store = app.store {
                LabeledContent("Status", value: statusText(store.status))
                    .accessibilityIdentifier("sync.status")
                if let last = store.status.lastSyncedAt {
                    LabeledContent("Last synced") {
                        Text(last, format: .relative(presentation: .named))
                    }
                }
                if let error = store.status.lastError {
                    Text(error).font(.footnote).foregroundStyle(.secondary)
                }
                #if DEBUG
                Toggle("Simulate offline", isOn: Binding(get: { app.simulateOffline }, set: { app.simulateOffline = $0 }))
                    .accessibilityIdentifier("sync.simulateOffline")
                #endif
                Button {
                    Task { await app.syncNow() }
                } label: {
                    HStack {
                        Text("Sync now")
                        if store.status.isSyncing {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(store.status.isSyncing)
                .accessibilityIdentifier("sync.now")
            }
        } header: {
            Text("Sync")
        } footer: {
            Text("Everything is saved on this iPhone first and works offline. Changes reach the server within seconds when online.")
        }
    }

    private func statusText(_ status: SyncStore.Status) -> String {
        if status.isSyncing { return "Syncing…" }
        if status.pendingCount > 0 {
            let changes = "\(status.pendingCount) change\(status.pendingCount == 1 ? "" : "s") waiting"
            return status.lastError != nil || !app.isOnline ? "\(changes) (offline)" : changes
        }
        return status.lastError != nil ? "Offline" : "Up to date"
    }
}
