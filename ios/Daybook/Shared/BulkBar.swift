import DaybookKit
import SwiftUI

/// The multi-select actions shown in the bottom toolbar on Today and Tasks: select all, mark as,
/// priority, archive (or restore) and delete. Delete only asks; the screen confirms and deletes.
struct BulkBar: View {
    var allSelected: Bool
    var count: Int
    var busy: Bool = false
    var archiveLabel = "Archive"
    var onToggleAll: () -> Void
    var onStatus: (TaskStatus) -> Void
    var onPriority: (Int) -> Void
    var onArchive: () -> Void
    var onDelete: () -> Void

    private var disabled: Bool { count == 0 || busy }

    var body: some View {
        HStack {
            Button(allSelected ? "None" : "All", action: onToggleAll)
                .accessibilityIdentifier("bulk.all")
            Spacer()
            Menu("Mark as") {
                Button("Next", systemImage: "circle") { onStatus(.next) }
                Button("Now", systemImage: "circle.inset.filled") { onStatus(.now) }
                Button("Done", systemImage: "checkmark.circle") { onStatus(.done) }
            }
            .disabled(disabled)
            .accessibilityIdentifier("bulk.status")
            Spacer()
            Menu("Priority") {
                ForEach(Priority.options) { p in
                    Button(p.label, systemImage: p.symbol) { onPriority(p.rawValue) }
                }
                Button("None", systemImage: "minus") { onPriority(0) }
            }
            .disabled(disabled)
            .accessibilityIdentifier("bulk.priority")
            Spacer()
            Button(archiveLabel, action: onArchive)
                .disabled(disabled)
                .accessibilityIdentifier("bulk.archive")
            Spacer()
            Button(role: .destructive, action: onDelete) {
                Image(systemName: "trash")
            }
            .tint(.red)
            .disabled(disabled)
            .accessibilityLabel("Delete selected")
            .accessibilityIdentifier("bulk.delete")
        }
    }
}

extension View {
    /// "Delete N tasks?" confirmation shared by the bulk bars.
    func bulkDeleteConfirmation(count: Int, isPresented: Binding<Bool>, onDelete: @escaping () -> Void) -> some View {
        confirmationDialog("Delete \(count) task\(count == 1 ? "" : "s")?", isPresented: isPresented, titleVisibility: .visible) {
            Button("Delete", role: .destructive, action: onDelete)
        } message: {
            Text("The selected tasks and their subtasks are deleted everywhere. Archive instead if you may want them back.")
        }
    }
}
