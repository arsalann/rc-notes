import XCTest

/// AGENTS.md "Daybook Journal Write Safety": distinct journal contents must never cross dates or
/// workspaces, and recovered drafts must never write without an explicit choice.
final class JournalE2ETests: DaybookUITestCase {
    private var preview: XCUIElement { app.buttons["journal.preview"] }
    private var editor: XCUIElement { app.textViews["journal.editor"] }

    private func previewText() -> String {
        waitFor(preview)
        return preview.value as? String ?? ""
    }

    /// Opens the editor, appends text, and leaves edit mode (which saves).
    private func write(_ text: String, done: Bool = true) {
        if !editor.exists {
            waitFor(preview).tap()
        }
        waitFor(editor).tap()
        editor.typeText(text)
        if done {
            app.buttons["journal.done"].tap()
            waitFor(preview)
        }
    }

    private func dismissSaveAlertIfShown() {
        let alert = app.alerts["Diary could not be saved"]
        if alert.waitForExistence(timeout: 3) { alert.buttons["OK"].tap() }
    }

    func testContentNeverCrossesDates() throws {
        let work = try server.workspaceId(named: "Work")
        let today = Day.string(0), yesterday = Day.string(-1)
        launchSignedIn()
        selectWorkspaceChip("Work")

        let a = "A_\(runTag)", b = "B_\(runTag)", c = "C_\(runTag)"
        write(" \(a)")
        eventually("today saved") { try server.diaryContent(today, workspaceId: work).contains(a) }

        tapDayButton("day.previous")
        XCTAssertTrue(app.navigationBars["Yesterday"].waitForExistence(timeout: 10))
        XCTAssertFalse(previewText().contains(a), "today's writing leaked into yesterday")
        write(" \(b)")
        eventually("yesterday saved") { try server.diaryContent(yesterday, workspaceId: work).contains(b) }

        // Navigate away while still typing (no Done): the pending text belongs to yesterday.
        write(" \(c)", done: false)
        tapDayButton("day.next")
        XCTAssertTrue(app.navigationBars["Today"].waitForExistence(timeout: 10))
        eventually("in-flight writing saved to the day it was typed on") {
            try server.diaryContent(yesterday, workspaceId: work).contains(c)
        }
        let todayContent = try server.diaryContent(today, workspaceId: work)
        XCTAssertTrue(todayContent.contains(a))
        XCTAssertFalse(todayContent.contains(b) || todayContent.contains(c), "yesterday's writing reached today: \(todayContent)")
        XCTAssertTrue(previewText().contains(a))
        XCTAssertFalse(previewText().contains(c))
        snapshot("journal-today")
    }

    func testContentNeverCrossesWorkspaces() throws {
        let work = try server.workspaceId(named: "Work")
        let personal = try server.workspaceId(named: "Personal")
        let today = Day.string(0)
        launchSignedIn()

        let w = "W_\(runTag)", p = "P_\(runTag)"
        selectWorkspaceChip("Work")
        write(" \(w)")
        eventually("work saved") { try server.diaryContent(today, workspaceId: work).contains(w) }

        selectWorkspaceChip("Personal")
        eventually("personal page shown") { !self.previewText().contains(w) }
        write(" \(p)", done: false)
        // Switch workspace mid-edit: the text must land in Personal, not Work.
        selectWorkspaceChip("Work")
        eventually("personal saved") { try server.diaryContent(today, workspaceId: personal).contains(p) }
        eventually("work page shown") { self.previewText().contains(w) }
        XCTAssertFalse(previewText().contains(p))
        XCTAssertFalse(try server.diaryContent(today, workspaceId: work).contains(p))
        XCTAssertFalse(try server.diaryContent(today, workspaceId: personal).contains(w))
    }

    /// A save rejected by compare-and-swap keeps the local copy; after relaunch it is offered
    /// (never auto-written) and only an explicit Restore overwrites the server copy.
    func testConflictedDraftIsOfferedAndRestoredOnlyOnRequest() throws {
        let work = try server.workspaceId(named: "Work")
        let today = Day.string(0)
        launchSignedIn()
        selectWorkspaceChip("Work")
        waitFor(preview)

        let laptop = "laptop_\(runTag)", phone = "phone_\(runTag)"
        try server.externalWrite(today, workspaceId: work, content: laptop)
        write(" \(phone)", done: false)
        dismissSaveAlertIfShown()
        if app.buttons["journal.done"].exists { app.buttons["journal.done"].tap() }
        dismissSaveAlertIfShown()
        XCTAssertEqual(try server.diaryContent(today, workspaceId: work), laptop, "stale save overwrote another device's writing")

        app.terminate()
        launch(reset: false)
        let recovery = waitFor(app.buttons["journal.restore"], timeout: 20)
        snapshot("journal-recovery")
        // Offered, not written.
        XCTAssertEqual(try server.diaryContent(today, workspaceId: work), laptop)
        XCTAssertTrue(previewText().contains(laptop))

        recovery.tap()
        eventually("restored draft saved") { try server.diaryContent(today, workspaceId: work).contains(phone) }
        XCTAssertFalse(app.buttons["journal.restore"].exists)
    }

    func testDiscardLeavesServerUntouched() throws {
        let work = try server.workspaceId(named: "Work")
        let today = Day.string(0)
        launchSignedIn()
        selectWorkspaceChip("Work")
        waitFor(preview)

        let laptop = "laptop2_\(runTag)", phone = "phone2_\(runTag)"
        try server.externalWrite(today, workspaceId: work, content: laptop)
        write(" \(phone)", done: false)
        dismissSaveAlertIfShown()
        app.terminate()

        launch(reset: false)
        waitFor(app.buttons["journal.discard"], timeout: 20).tap()
        XCTAssertFalse(app.buttons["journal.restore"].exists)
        // Relaunching again must not offer (or write) the discarded copy.
        app.terminate()
        launch(reset: false)
        waitFor(preview, timeout: 20)
        XCTAssertFalse(app.buttons["journal.restore"].waitForExistence(timeout: 3))
        XCTAssertEqual(try server.diaryContent(today, workspaceId: work), laptop)
    }
}
