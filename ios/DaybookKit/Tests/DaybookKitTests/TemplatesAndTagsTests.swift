import Foundation
import Testing
@testable import DaybookKit

@Suite("Templates and tags")
struct TemplatesAndTagsTests {
    @Test func decodesTemplates() throws {
        let templates = try decode([TaskTemplate].self, "templates")
        let t = try #require(templates.first)
        #expect(t.name == "Weekly review")
        #expect(t.priority == 3)
        #expect(t.tags == ["growth"])
        #expect(t.subtasks.map(\.title) == ["Inbox zero", "Plan next week"])
        #expect(t.subtasks[0].priority == nil)
        #expect(t.subtasks[1].priority == 1)
        #expect(t.subtasks[1].tags == ["x"])
    }

    @Test func decodesTags() throws {
        let tags = try decode([TagSummary].self, "tags")
        let growth = try #require(tags.first { $0.key == "growth" })
        #expect(growth.builtin && growth.label == "Growth & reach" && growth.name == "Growth" && growth.emojiOverride == "🚀")
        let custom = try #require(tags.first { $0.key == "manual:q4 plan" })
        #expect(!custom.builtin && custom.archived && custom.taskCount == 1 && custom.variants == ["Q4-Plan"])
        #expect(custom.usage == "1 task")
    }

    @Test func manualKeysMatchTheWeb() {
        #expect(TaskTags.manualKey("Data stack") == "data-stack")
        #expect(TaskTags.manualKey("doc") == "content")
        #expect(TaskTags.manualKey("Q4-Plan") == "manual:q4 plan")
        #expect(TaskTags.manualKey("q4_plan") == "manual:q4 plan")
        #expect(TaskTags.manualKey("  ") == nil)
        #expect(TaskTags.isBuiltIn("growth") && !TaskTags.isBuiltIn("manual:q4 plan"))
    }

    @Test func overridesApplyAndArchivedTagsLeaveThePicker() throws {
        let overrides = TagOverrides(try decode([TagSummary].self, "tags"))
        let growth = ResolvedTag(key: "growth", label: "Growth", emoji: "📈", sources: [.manual], matchedTerms: ["growth"])
        #expect(overrides.present(growth).label == "Growth & reach")
        #expect(overrides.present(growth).emoji == "🚀")
        #expect(overrides.isArchived("q4 plan"))
        #expect(!overrides.pickerOptions(selected: []).contains { $0.key == "manual:q4 plan" })
        // Still offered when the task already has it, so it can be removed.
        #expect(overrides.pickerOptions(selected: ["Q4-Plan"]).contains { $0.key == "manual:q4 plan" })
        // Without settings the picker is the built-in catalog.
        #expect(TagOverrides().pickerOptions(selected: []).map(\.key) == TaskTags.catalog.map(\.key))
        let option = try #require(overrides.pickerOptions(selected: ["Q4-Plan"]).first { $0.key == "manual:q4 plan" })
        #expect(TaskTags.toggle(option, in: ["q4 plan", "keep"]) == ["keep"])
        #expect(TaskTags.toggle(option, in: ["keep"]) == ["keep", "Q4-Plan"])
    }

    @Test func templateFromTaskStoresInheritedPriorityAsNil() throws {
        let tasks = try decode(TaskItem.self, "task_detail")
        var subs = tasks.subtasks ?? []
        if subs.isEmpty { return }
        subs[0].priority = tasks.priority
        let template = TaskTemplate.from(task: tasks, subtasks: subs, name: "  ")
        #expect(template.name == tasks.title)
        #expect(template.subtasks.first?.priority == nil)
        #expect(template.body["subtasks"] != nil && template.body["workspace_id"] != nil)
    }
}

@Suite("Templates through the queue")
@MainActor
struct TemplateRepositoryTests {
    @Test func createsTaskThenSubtasksInOrder() async throws {
        let server = FakeSyncServer()
        var rows = PullResponse.Rows()
        rows.workspaces = [WorkspaceRow(id: "ws-work", name: "Work", emoji: "💼", position: 1)]
        await server.queuePull(PullResponse(cursor: 10, rows: rows))
        let store = SyncStore(transport: server, directory: nil, drafts: InMemoryDraftStore(), userId: "u1", now: { Date() })
        await store.sync()
        await server.setOffline(true)
        let repo = Repository(store: store)
        let template = TaskTemplate(id: "t", name: "Review", title: "Weekly review", priority: 3, tags: ["growth"],
                                    subtasks: [.init(title: "One"), .init(title: "Two", priority: 1), .init(title: "  ")])
        let task = try await repo.createTasks(from: template, workspaceId: "ws-work", status: .now)
        #expect(task.title == "Weekly review" && task.priority == 3 && task.status == .now && task.tags == ["growth"])
        #expect(task.subtasks?.map(\.title) == ["One", "Two"])
        #expect(task.subtasks?.map(\.priority) == [3, 1]) // nil inherits the task's priority
        #expect(store.outbox.count == 3)
    }
}
