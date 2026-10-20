import XCTest

/// Web-parity flows (PR #53): multi-select on Today, templates, Today page switches, tag settings.
final class ParityE2ETests: DaybookUITestCase {
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    /// Puts the cursor at the end (a tap lands mid-text), deletes everything, types `text`.
    private func replaceText(_ field: XCUIElement, with text: String) {
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
        let current = (field.value as? String) ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 5) + text)
    }

    private func dueToday() -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        var parts = DateComponents()
        parts.year = c.year; parts.month = c.month; parts.day = c.day; parts.hour = 9
        return ISO8601DateFormatter().string(from: Calendar.current.date(from: parts)!)
    }

    @discardableResult
    private func createTask(_ title: String, workspace: String, extra: [String: Any] = [:]) throws -> String {
        var body: [String: Any] = ["title": title, "workspace_id": workspace, "due_at": dueToday(), "status": "now"]
        body.merge(extra) { $1 }
        return (try server.request("POST", "/api/tasks", body: body) as! [String: Any])["id"] as! String
    }

    private func taskById(_ id: String) throws -> [String: Any]? {
        do { return try server.request("GET", "/api/tasks/\(id)") as? [String: Any] } catch let e as NSError where e.code == 404 { return nil }
    }

    func testTodaySelectMarkArchiveAndDelete() throws {
        let work = try server.workspaceId(named: "Work")
        let a = try createTask("\(runTag) sel A", workspace: work)
        let b = try createTask("\(runTag) sel B", workspace: work)
        let c = try createTask("\(runTag) sel C", workspace: work)
        launchSignedIn()
        selectWorkspaceChip("Work")
        waitFor(element("task.row.\(runTag) sel C"))

        waitFor(app.buttons["today.select"]).tap()
        waitFor(app.staticTexts["0 selected"])
        for name in ["sel A", "sel B"] {
            let row = element("today.selectRow.\(runTag) \(name)")
            scrollTo(row)
            waitFor(row).tap()
        }
        snapshot("20-today-select")
        app.buttons["bulk.status"].tap()
        waitFor(app.buttons["bulk.status.done"]).tap()
        eventually("A and B done on the server") {
            try taskById(a)?["completed"] as? Bool == true && taskById(b)?["completed"] as? Bool == true
        }

        // Still selected: archive them; they leave the page.
        app.buttons["bulk.archive"].tap()
        eventually("A and B archived") { try taskById(a)?["archived"] as? Bool == true && taskById(b)?["archived"] as? Bool == true }
        XCTAssertFalse(element("task.row.\(runTag) sel A").waitForExistence(timeout: 2))

        waitFor(app.buttons["today.select"]).tap()
        let rowC = element("today.selectRow.\(runTag) sel C")
        scrollTo(rowC)
        waitFor(rowC).tap()
        app.buttons["bulk.delete"].tap()
        snapshot("21-today-delete-confirm")
        waitFor(app.buttons["Delete"].firstMatch).tap()
        eventually("C deleted on the server", timeout: 25) { try taskById(c) == nil }
    }

    func testSaveTemplateAndCreateFromIt() throws {
        let work = try server.workspaceId(named: "Work")
        let title = "\(runTag) tpl source"
        let id = try createTask(title, workspace: work, extra: ["priority": 3])
        _ = try server.request("POST", "/api/tasks", body: ["title": "\(runTag) step one", "parent_id": id])
        let name = "\(runTag) Template"
        launchSignedIn()
        tab("Tasks").tap()
        waitFor(element("task.row.\(title)")).tap()
        waitFor(app.buttons["detail.saveTemplate"]).tap()
        // SwiftUI alerts drop the field's identifier; it is the alert's only text field.
        let field = waitFor(app.alerts.textFields.firstMatch)
        replaceText(field, with: name)
        snapshot("22-save-template")
        app.alerts.buttons["Save"].tap()
        eventually("template saved with its subtask") {
            let list = try self.server.request("GET", "/api/templates") as! [[String: Any]]
            return list.contains { $0["name"] as? String == name && ($0["subtasks"] as? [[String: Any]])?.count == 1 }
        }

        tab("Tasks").tap()
        if !app.buttons["tasks.add"].waitForExistence(timeout: 3) { tab("Tasks").tap() }
        waitFor(app.buttons["tasks.add"]).tap()
        let pick = app.buttons["quickadd.template.\(name)"]
        scrollTo(pick)
        waitFor(pick).tap()
        eventually("a second task with the subtask was created") {
            let made = try self.server.tasks().filter { $0["title"] as? String == title }
            return made.count == 2 && made.allSatisfy { $0["subtask_count"] as? Int == 1 && $0["priority"] as? Int == 3 }
        }
    }

    func testTodayPageSwitchHidesJournal() throws {
        launchSignedIn()
        waitFor(app.buttons["journal.preview"])
        tab("Settings").tap()
        let toggle = app.switches["settings.todayShowJournal"]
        scrollTo(toggle)
        waitFor(toggle).coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        snapshot("23-settings-today-page")
        tab("Today").tap()
        XCTAssertFalse(app.buttons["journal.preview"].waitForExistence(timeout: 3))
        tab("Settings").tap()
        scrollTo(toggle)
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        tab("Today").tap()
        waitFor(app.buttons["journal.preview"])
    }

    func testRenameCustomTagWarnsAndRewritesTasks() throws {
        let work = try server.workspaceId(named: "Work")
        let tag = "\(runTag)-old".lowercased()
        let id = try createTask("\(runTag) tagged", workspace: work, extra: ["tags": [tag]])
        launchSignedIn()
        tab("Settings").tap()
        let link = app.buttons["settings.tags"]
        scrollTo(link)
        waitFor(link).tap()
        let row = element("tag.\(tag)")
        scrollTo(row)
        waitFor(row).tap()
        let name = waitFor(app.textFields["tagedit.name"])
        replaceText(name, with: "\(tag)x")
        waitFor(element("tagedit.warning"))
        snapshot("24-tag-rename-warning")
        app.buttons["tagedit.save"].tap()
        waitFor(app.buttons["Rename & overwrite"].firstMatch).tap()
        eventually("task tag rewritten") {
            (try taskById(id)?["tags"] as? [String]) == ["\(tag)x"]
        }
    }
}
