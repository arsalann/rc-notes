import Foundation
import Testing
@testable import DaybookKit

/// Fixtures are real responses captured from a local server (`ios/scripts/test-server.sh`).
func fixture(_ name: String) throws -> Data {
    let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
    return try Data(contentsOf: url)
}

func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
    try APIClient.decoder.decode(T.self, from: fixture(name))
}

@Suite struct DecodingTests {
    @Test func authCheck() throws {
        let check = try decode(AuthCheck.self, "auth_check")
        #expect(check.configured)
        #expect(check.user?.username == "master_tester")
        #expect(check.user?.isAdmin == true)
    }

    @Test func workspaces() throws {
        let list = try decode([Workspace].self, "workspaces")
        #expect(list.map(\.name) == ["Personal", "Work"])
        #expect(list[0].label == "🏠 Personal")
    }

    @Test func taskListRowsDecodeWithSubtaskCounts() throws {
        let list = try decode([TaskItem].self, "tasks_list")
        let task = try #require(list.first)
        #expect(task.displayId == "fixdo000")
        #expect(task.subtaskCount == 1)
        #expect(task.resolvedTags.first?.key == "content")
        #expect(task.emojiTags.first?.emoji == "✍️")
        #expect(task.dueAt == "2026-10-16 09:00:00")
    }

    @Test func hydratedTaskHasSubtasks() throws {
        let task = try decode(TaskItem.self, "task_detail")
        #expect(task.priority == 2)
        #expect(task.status == .next)
        #expect(task.subtasks?.count == 1)
        #expect(task.subtasks?.first?.parentId == task.id)
    }

    @Test func completeResponseSetsDoneStatus() throws {
        let task = try decode(TaskItem.self, "task_complete")
        #expect(task.completed)
        #expect(task.status == .done)
        #expect(task.completedAt != nil)
    }

    @Test func diaryEntryKeepsExactRevisionString() throws {
        let entry = try decode(DiaryEntry.self, "diary_get")
        #expect(entry.entryDate == "2026-10-16")
        // The revision token must survive byte-for-byte (microseconds included).
        let raw = try JSONSerialization.jsonObject(with: fixture("diary_get")) as! [String: Any]
        #expect(entry.updatedAt == raw["updated_at"] as? String)
        #expect(entry.links?.first?.targetType == "task")
        #expect(entry.tasks?.first?.subtasks?.count == 1)
    }

    @Test func calendarSearchNotesOutstanding() throws {
        let days = try decode([CalendarDay].self, "calendar")
        #expect(days.count == 5)
        let search = try decode([SearchResult].self, "search")
        #expect(search.first?.type == "task")
        let notes = try decode([Note].self, "notes_list")
        #expect(notes.first?.title == "Fixture note")
        let note = try decode(Note.self, "note_create")
        #expect(note.content.contains("@[Fixture child]"))
        let outstanding = try decode([TaskItem].self, "outstanding")
        #expect(outstanding.first?.isOverdue != nil)
    }

    @Test func completedTaskRows() throws {
        let json = #"[{"id":"s1","display_id":"abc00001","title":"Sub","completed_at":"2026-10-14 10:00:00","parent_id":"p1","parent_task_id":"p1","parent_display_id":"abc000","parent_title":"Parent","parent_completed":false}]"#
        let rows = try APIClient.decoder.decode([CompletedTask].self, from: Data(json.utf8))
        #expect(rows.first?.parentTitle == "Parent")
        #expect(rows.first?.parentId == "p1")
    }

    @Test func requestBodiesSendExplicitNulls() throws {
        let client = APIClient(baseURL: URL(string: "http://127.0.0.1:1")!)
        let request = try client.makeRequest("PUT", "/api/diary/2026-10-16", body: [
            "entry_id": "e1", "content": "x", "workspace_id": .optional(nil), "expected_updated_at": "2026-10-16 17:31:51.779438",
        ])
        let body = try JSONSerialization.jsonObject(with: try #require(request.httpBody)) as! [String: Any]
        #expect(body["workspace_id"] is NSNull)
        #expect(body["expected_updated_at"] as? String == "2026-10-16 17:31:51.779438")
        #expect(request.url?.absoluteString == "http://127.0.0.1:1/api/diary/2026-10-16")
    }

    @Test func queryOmitsNilValues() throws {
        let client = APIClient(baseURL: URL(string: "http://h:3000")!)
        let request = try client.makeRequest("GET", "/api/tasks", query: ["workspace_id": nil, "archived": "false"])
        #expect(request.url?.absoluteString == "http://h:3000/api/tasks?archived=false")
    }

    @Test func serverURLNormalization() {
        #expect(APIClient.normalizeServerURL("192.168.1.20:3000")?.absoluteString == "http://192.168.1.20:3000")
        #expect(APIClient.normalizeServerURL(" https://mac.tail.ts.net/ ")?.absoluteString == "https://mac.tail.ts.net")
        #expect(APIClient.normalizeServerURL("") == nil)
        #expect(APIClient.normalizeServerURL("ftp://x") == nil)
    }
}
