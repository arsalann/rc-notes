import SwiftUI

/// Transient banner for save failures and confirmations (the web app's toasts).
private struct ToastOverlay: ViewModifier {
    @Environment(AppModel.self) private var model

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let toast = model.toast {
                ToastBanner(toast: toast)
                    .padding(.horizontal)
                    .padding(.top, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onTapGesture { model.toast = nil }
                    .task(id: toast.id) {
                        try? await Task.sleep(for: .seconds(toast.style == .error ? 5 : 2.5))
                        if model.toast?.id == toast.id { model.toast = nil }
                    }
                    .sensoryFeedback(toast.style == .error ? .error : .success, trigger: toast.id)
            }
        }
        .animation(.snappy, value: model.toast)
    }
}

private struct ToastBanner: View {
    let toast: ToastMessage

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(tint)
                .font(.headline)
            VStack(alignment: .leading, spacing: 2) {
                Text(toast.title).font(.subheadline.weight(.semibold))
                if let detail = toast.detail {
                    Text(detail).font(.footnote).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("toast")
    }

    private var icon: String {
        switch toast.style {
        case .success: "checkmark.circle.fill"
        case .error: "exclamationmark.triangle.fill"
        case .neutral: "info.circle.fill"
        }
    }

    private var tint: Color {
        switch toast.style {
        case .success: .accentColor
        case .error: .red
        case .neutral: .secondary
        }
    }
}

extension View {
    func toastOverlay() -> some View { modifier(ToastOverlay()) }
}
