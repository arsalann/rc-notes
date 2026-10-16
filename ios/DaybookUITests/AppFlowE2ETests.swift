import XCTest

/// End-to-end flows through every tab against the isolated test server.
final class AppFlowE2ETests: DaybookUITestCase {
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    func testServerSetupAndSignInSignOut() throws {
        // Fresh install: no server stored, no launch argument.
        app.launchArguments = ["-uiTestReset"]
        app.launch()
        let url = waitFor(app.textFields["server.url"])
        snapshot("00-server")
        url.tap()
        url.typeText(TestServer.baseURL.absoluteString)
        app.buttons["server.connect"].tap()
        snapshot("01-login")
        signIn()
        snapshot("02-today")

        tab("Settings").tap()
        waitFor(app.staticTexts["master_tester"])
        snapshot("08-settings")
        app.buttons["settings.signOut"].tap()
        app.buttons["Sign out"].firstMatch.tap()
        waitFor(app.textFields["auth.username"])

        // Session survives a relaunch once signed in.
        signIn()
        app.terminate()
        launch(reset: false)
        XCTAssertTrue(tab("Today").waitForExistence(timeout: 20))
    }

    func testTaskLifecycleFromTasksTab() throws {
        launchSignedIn()
        tab("Tasks").tap()
        let title = "\(runTag) ship build"
        waitFor(app.buttons["tasks.add"]).tap()
        let field = waitFor(app.textFields["quickadd.title"])
        field.typeText("\(title) #critical #launch")
        waitFor(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Will capture'")).firstMatch)
        snapshot("04-quick-add")
        let sub = app.textFields["quickadd.subtask"]
        sub.tap()
        sub.typeText("write notes\n")
        app.buttons["quickadd.submit"].tap()

        eventually("task created with parsed priority and tag") {
            guard let task = try server.task(titled: title) else { return false }
            return task["priority"] as? Int == 3 && (task["tags"] as? [String]) == ["launch"] && task["subtask_count"] as? Int == 1
        }
        let row = waitFor(element("task.row.\(title)"))
        snapshot("03-tasks")

        app.buttons["task.toggle.\(title)"].firstMatch.tap()
        eventually("completed on server") { try server.task(titled: title)?["completed"] as? Bool == true }
        app.buttons["task.toggle.\(title)"].firstMatch.tap()
        eventually("reopened on server") { try server.task(titled: title)?["completed"] as? Bool == false }

        row.tap()
        waitFor(app.textFields["detail.title"])
        app.segmentedControls["detail.status"].buttons["Now"].tap()
        eventually("status now") { try server.task(titled: title)?["status"] as? String == "now" }
        let newSub = app.textFields["detail.newSubtask"]
        scrollTo(newSub)
        newSub.tap()
        newSub.typeText("tag release\n")
        eventually("second subtask") { try server.task(titled: title)?["subtask_count"] as? Int == 2 }
        snapshot("05-task-detail")
    }

    func testAddTaskFromTodayLinksItToThePage() throws {
        let work = try server.workspaceId(named: "Work")
        launchSignedIn()
        selectWorkspaceChip("Work")
        let title = "\(runTag) today task"
        let add = app.buttons["today.addTask"]
        scrollTo(add)
        add.tap()
        waitFor(app.textFields["quickadd.title"]).typeText(title)
        app.buttons["quickadd.submit"].tap()

        waitFor(element("task.row.\(title)"))
        eventually("task linked to today's page") {
            let entry = try server.diary(Day.string(0), workspaceId: work)
            let links = entry?["links"] as? [[String: Any]] ?? []
            return links.contains { $0["target_title"] as? String == title }
        }
        let task = try XCTUnwrap(server.task(titled: title))
        XCTAssertEqual(task["status"] as? String, "now")
        XCTAssertTrue((task["due_at"] as? String ?? "").count > 0)

        app.buttons["task.toggle.\(title)"].firstMatch.tap()
        eventually("completed") { try server.task(titled: title)?["completed"] as? Bool == true }
        snapshot("02b-today-with-task")
    }

    func testNoteMentionCreatesLinkAndEmbedsTask() throws {
        let title = "\(runTag) mention target"
        _ = try server.request("POST", "/api/tasks", body: ["title": title])
        launchSignedIn()
        tab("Notes").tap()
        waitFor(app.buttons["notes.add"]).tap()

        let editor = waitFor(app.textViews["note.editor"])
        editor.tap()
        editor.typeText("Plan for today @\(runTag)")
        let suggestion = waitFor(app.buttons["mention.\(title)"])
        snapshot("07-note-mention")
        suggestion.tap()
        app.buttons["note.toggleEdit"].tap()
        waitFor(app.buttons["task.row.\(title)"])
        snapshot("07b-note-preview")

        eventually("note saved with mention and link") {
            let notes = try self.server.request("GET", "/api/notes") as! [[String: Any]]
            guard let id = notes.first(where: { ($0["preview"] as? String ?? "").contains("@[\(title)]") })?["id"] as? String else { return false }
            let note = try self.server.request("GET", "/api/notes/\(id)") as! [String: Any]
            return (note["links"] as? [[String: Any]] ?? []).contains { $0["target_title"] as? String == title }
        }
        app.navigationBars.buttons.element(boundBy: 0).tap()
        snapshot("06-notes")
    }

    func testChecklistInJournalBecomesTasks() throws {
        let work = try server.workspaceId(named: "Work")
        launchSignedIn()
        selectWorkspaceChip("Work")
        let parent = "\(runTag) checklist parent"
        waitFor(app.buttons["journal.preview"]).tap()
        let editor = waitFor(app.textViews["journal.editor"])
        editor.tap()
        editor.typeText("\n- [ ] \(parent) #snack\n  - [ ] \(runTag) child\n")
        app.buttons["journal.done"].tap()

        eventually("checklist turned into a task with a subtask") {
            guard let task = try server.task(titled: parent) else { return false }
            return task["priority"] as? Int == 1 && task["subtask_count"] as? Int == 1
        }
        eventually("checklist line replaced by a mention") {
            try server.diaryContent(Day.string(0), workspaceId: work).contains("@[\(parent)]")
        }
        waitFor(element("task.row.\(parent)"))
    }

    func testSearchCalendarAndWeekSummary() throws {
        let title = "\(runTag) searchable"
        let due = ISO8601DateFormatter().string(from: Date())
        _ = try server.request("POST", "/api/tasks", body: ["title": title, "due_at": due])
        launchSignedIn()

        app.navigationBars.buttons["Search"].tap()
        let field = waitFor(app.searchFields.firstMatch)
        field.tap()
        field.typeText(runTag)
        waitFor(app.buttons["search.result.\(title)"])
        snapshot("09-search")
        app.buttons["search.result.\(title)"].tap()
        waitFor(app.textFields["detail.title"])

        tab("Tasks").tap()
        app.buttons["tasks.calendar"].tap()
        waitFor(app.buttons["calendar.\(Day.string(0))"])
        waitFor(element("task.row.\(title)"))
        snapshot("10-calendar")

        tab("Today").tap()
        app.buttons["today.week"].tap()
        waitFor(app.staticTexts["week.total"])
        snapshot("11-week-summary")
    }
}
