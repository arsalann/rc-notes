import DaybookKit
import SwiftUI

/// Multi-line editor that detects `@query` at the cursor and offers tasks/notes to mention.
/// Picking one replaces the query with `@[Title]` and calls `onPick` so the caller can create the link.
struct MentionEditor: View {
    @Environment(AppModel.self) private var model
    @Binding var text: String
    var placeholder: String
    var minHeight: CGFloat = 160
    var identifier: String
    var onPick: (MentionResult) -> Void

    @State private var selection: TextSelection?
    @State private var active: (query: String, atOffset: Int)?
    @State private var results: [MentionResult] = []
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
                        .foregroundStyle(.tertiary)
                        .padding(.top, 8)
                        .padding(.leading, 5)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $text, selection: $selection)
                    .focused($focused)
                    .frame(minHeight: minHeight)
                    .scrollContentBackground(.hidden)
                    .accessibilityIdentifier(identifier)
            }
            if active != nil && !results.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(results) { item in
                        Button { pick(item) } label: {
                            HStack {
                                Image(systemName: item.type == "note" ? "doc.text" : (item.completed ? "checkmark.circle.fill" : "circle"))
                                    .foregroundStyle(.secondary)
                                Text(item.title).lineLimit(1)
                                Spacer()
                                Text(item.displayId).font(.caption.monospaced()).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("mention.\(item.title)")
                        Divider()
                    }
                }
                .padding(.horizontal, 10)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .onChange(of: text) { updateQuery() }
        .onChange(of: selection) { updateQuery() }
        .task(id: active?.query) {
            guard let query = active?.query else {
                results = []
                return
            }
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled, let api = model.api else { return }
            results = (try? await api.mention(query)) ?? []
        }
        .onAppear { focused = true }
    }

    private var cursorOffset: Int {
        guard let selection, case .selection(let range) = selection.indices,
              range.upperBound <= text.endIndex else { return (text as NSString).length }
        return text.utf16.distance(from: text.startIndex, to: range.upperBound)
    }

    private func updateQuery() {
        if let next = Mentions.activeQuery(in: text, cursor: cursorOffset) {
            if active?.query != next.query || active?.atOffset != next.atOffset { active = next }
        } else if active != nil {
            active = nil
        }
    }

    private func pick(_ item: MentionResult) {
        guard let active else { return }
        let result = Mentions.insert(title: item.title, in: text, atOffset: active.atOffset, cursor: cursorOffset)
        self.active = nil
        results = []
        text = result.text
        let index = String.Index(utf16Offset: min(result.cursor, (result.text as NSString).length), in: result.text)
        selection = TextSelection(insertionPoint: index)
        onPick(item)
    }
}
