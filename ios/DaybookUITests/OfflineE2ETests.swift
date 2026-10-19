import XCTest

/// Offline first: changes made without a connection show at once, stay on the phone, and reach the
/// server when the connection is back. An older offline edit of one field never overwrites a newer
/// edit of another field made elsewhere meanwhile.
final class OfflineE2ETests: DaybookUITestCase {
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    /// Settings → Sync → Simulate offline (debug builds).
    private func setOffline(_ offline: Bool) {
        tab("Settings").tap()
        let toggle = app.switches["sync.simulateOffline"]
        scrollTo(toggle)
        waitFor(toggle)
        if (toggle.value as? String == "1") != offline {
            toggle.switches.firstMatch.exists ? toggle.switches.firstMatch.tap() : toggle.tap()
        }
        XCTAssertEqual(toggle.value as? String, offline ? "1" : "0")
    }

    func testChangesMadeOfflineSyncWhenBackOnline() throws {
        let work = try server.workspaceId(named: "Work")
        let shared = "\(runTag) shared task"
        let created = try server.request("POST", "/api/tasks", body: ["title": shared, "workspace_id": work]) as! [String: Any]
        let sharedId = created["id"] as! String
        launchSignedIn()
        tab("Tasks").tap()
        waitFor(element("task.row.\(shared)"), timeout: 20) // the first sync brought it

        setOffline(true)

        // A new task, a status change and journal writing, all offline.
        tab("Tasks").tap()
        let title = "\(runTag) offline task"
        waitFor(app.buttons["tasks.add"]).tap()
        waitFor(app.textFields["quickadd.title"]).typeText(title)
        app.buttons["quickadd.submit"].tap()
        waitFor(element("task.row.\(title)"))

        element("task.row.\(shared)").tap()
        waitFor(app.textFields["detail.title"])
        app.segmentedControls["detail.status"].buttons["Now"].tap()

        // Meanwhile another device raises the shared task's priority.
        _ = try server.request("PUT", "/api/tasks/\(sharedId)", body: ["priority": 3])

        tab("Today").tap()
        selectWorkspaceChip("Work")
        let words = "offline_\(runTag)"
        waitFor(app.buttons["journal.preview"]).tap()
        let editor = waitFor(app.textViews["journal.editor"])
        editor.tap()
        editor.typeText(" \(words)")
        app.buttons["journal.done"].tap()
        XCTAssertTrue(app.buttons["journal.preview"].waitForExistence(timeout: 10))
        XCTAssertTrue((app.buttons["journal.preview"].value as? String ?? "").contains(words))
        waitFor(app.buttons["sync.offline"], timeout: 20) // changes waiting, no connection
        snapshot("12-offline")

        // Nothing reached the server.
        XCTAssertNil(try server.task(titled: title))
        XCTAssertFalse(try server.diaryContent(Day.string(0), workspaceId: work).contains(words))
        let before = try server.request("GET", "/api/tasks/\(sharedId)") as! [String: Any]
        XCTAssertEqual(before["status"] as? String, "next")

        setOffline(false)
        eventually("offline task synced", timeout: 30) { try server.task(titled: title) != nil }
        eventually("journal synced") { try server.diaryContent(Day.string(0), workspaceId: work).contains(words) }
        eventually("both edits of the shared task kept") {
            let task = try server.request("GET", "/api/tasks/\(sharedId)") as! [String: Any]
            return task["status"] as? String == "now" && task["priority"] as? Int == 3
        }

        // The rows record the device that made them.
        let id = try XCTUnwrap(server.task(titled: title)?["id"] as? String)
        let full = try server.request("GET", "/api/tasks/\(id)") as! [String: Any]
        XCTAssertEqual(full["created_device_kind"] as? String, "ios")
        XCTAssertEqual(full["updated_by"] as? String, "user_in_ios_app")
        XCTAssertNotNil(full["created_device_id"] as? String)
        XCTAssertFalse(app.buttons["sync.offline"].exists)
    }
}
