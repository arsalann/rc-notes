import SwiftUI
#if os(iOS)
import UIKit
#else
import AppKit
#endif

// iOS-only SwiftUI API behind one name each, so the shared views read the same on both platforms.
// On iOS every helper is exactly the modifier it replaces; on macOS it is the closest native
// equivalent, or nothing.

extension View {
    /// `.navigationBarTitleDisplayMode(.inline)`; Mac windows have no large titles.
    func inlineNavigationTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    /// `.navigationBarTitleDisplayMode(.large)`.
    func largeNavigationTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.large)
        #else
        self
        #endif
    }

    /// `.keyboardType(.URL)`.
    func urlKeyboard() -> some View {
        #if os(iOS)
        keyboardType(.URL)
        #else
        self
        #endif
    }

    /// `.textInputAutocapitalization(.never)`.
    func noAutocapitalization() -> some View {
        #if os(iOS)
        textInputAutocapitalization(.never)
        #else
        self
        #endif
    }

    /// `.listStyle(.insetGrouped)`; the Mac's closest is `.inset`.
    func insetGroupedListStyle() -> some View {
        #if os(iOS)
        listStyle(.insetGrouped)
        #else
        listStyle(.inset)
        #endif
    }

    /// `.scrollDismissesKeyboard(.interactively)`; no on-screen keyboard on a Mac.
    func dismissKeyboardOnScroll() -> some View {
        #if os(iOS)
        scrollDismissesKeyboard(.interactively)
        #else
        self
        #endif
    }
}

extension ToolbarItemPlacement {
    /// Left of the navigation bar on iOS; the window toolbar's leading side on macOS.
    static var leadingBar: ToolbarItemPlacement {
        #if os(iOS)
        .topBarLeading
        #else
        .navigation
        #endif
    }

    /// Right of the navigation bar on iOS; the window toolbar's trailing side on macOS.
    static var trailingBar: ToolbarItemPlacement {
        #if os(iOS)
        .topBarTrailing
        #else
        .primaryAction
        #endif
    }

    /// The bottom toolbar on iOS; macOS has none, so the items join the window toolbar.
    static var bottomBarOrToolbar: ToolbarItemPlacement {
        #if os(iOS)
        .bottomBar
        #else
        .automatic
        #endif
    }
}

enum Pasteboard {
    static func copy(_ text: String) {
        #if os(iOS)
        UIPasteboard.general.string = text
        #else
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
    }
}

extension View {
    /// Multi-select mode for a `List(selection:)`. iOS: drives `editMode` (checkmarks appear only in
    /// edit mode). macOS: lists are always selectable, so the flag only changes the toolbar.
    func selectionMode(_ selecting: Binding<Bool>) -> some View {
        #if os(iOS)
        environment(\.editMode, Binding(get: { selecting.wrappedValue ? .active : .inactive },
                                        set: { selecting.wrappedValue = $0.isEditing }))
        #else
        self
        #endif
    }

    /// `EditButton()` for reordering a list; Mac lists reorder by drag without one.
    @ViewBuilder func withEditButton() -> some View {
        #if os(iOS)
        HStack { self; Spacer(); EditButton().font(.caption) }
        #else
        self
        #endif
    }
}

extension SearchFieldPlacement {
    /// Search field always shown under the navigation bar (iOS) / in the toolbar (macOS).
    static var alwaysVisible: SearchFieldPlacement {
        #if os(iOS)
        .navigationBarDrawer(displayMode: .always)
        #else
        .toolbar
        #endif
    }
}

extension Color {
    /// The system background (`UIColor.systemBackground` / `NSColor.windowBackgroundColor`).
    static var systemBackground: Color {
        #if os(iOS)
        Color(uiColor: .systemBackground)
        #else
        Color(nsColor: .windowBackgroundColor)
        #endif
    }
}
