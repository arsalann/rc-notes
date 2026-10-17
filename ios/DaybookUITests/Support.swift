import Foundation
import XCTest

/// Direct HTTP access to the isolated test server (`ios/scripts/test-server.sh`), used to arrange
/// state and to assert what the app actually wrote. Never points at real data.
final class TestServer: @unchecked Sendable {
    static let baseURL = URL(string: ProcessInfo.processInfo.environment["DAYBOOK_TEST_SERVER"] ?? "http://127.0.0.1:3457")!
    private let session: URLSession
    /// `rc-session=…` captured from the login response (kept separate from the app's cookies).
    private var cookie: String?

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        session = URLSession(configuration: config)
    }

    func request(_ method: String, _ path: String, query: [String: String] = [:], body: [String: Any]? = nil) throws -> Any {
        var components = URLComponents(url: Self.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("curl/ui-tests", forHTTPHeaderField: "User-Agent")
        if let cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let semaphore = DispatchSemaphore(value: 0)
        nonisolated(unsafe) var result: Result<(Data, HTTPURLResponse), Error>!
        session.dataTask(with: request) { data, response, error in
            if let error { result = .failure(error) } else { result = .success((data ?? Data(), response as! HTTPURLResponse)) }
            semaphore.signal()
        }.resume()
        semaphore.wait()
        let (data, response) = try result.get()
        if let setCookie = response.value(forHTTPHeaderField: "Set-Cookie"),
           let pair = setCookie.split(separator: ";").first, pair.hasPrefix("rc-session=") {
            cookie = String(pair)
        }
        guard (200..<300).contains(response.statusCode) else {
            throw NSError(domain: "TestServer", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: String(decoding: data, as: UTF8.self)])
        }
        return data.isEmpty ? [:] : try JSONSerialization.jsonObject(with: data)
    }

    func login() throws {
        _ = try request("POST", "/api/auth/login", body: ["username": "master_tester", "password": "password123"])
    }

    func workspaceId(named name: String) throws -> String {
        let list = try request("GET", "/api/workspaces") as! [[String: Any]]
        return list.first { $0["name"] as? String == name }!["id"] as! String
    }

    /// Journal entry for a date + workspace, or nil.
    func diary(_ date: String, workspaceId: String) throws -> [String: Any]? {
        do {
            return try request("GET", "/api/diary/\(date)", query: ["workspace_id": workspaceId]) as? [String: Any]
        } catch let error as NSError where error.code == 404 {
            return nil
        }
    }

    func diaryContent(_ date: String, workspaceId: String) throws -> String {
        try diary(date, workspaceId: workspaceId)?["content"] as? String ?? ""
    }

    /// Writes an entry as another device would (compare-and-swap on the current revision).
    func externalWrite(_ date: String, workspaceId: String, content: String) throws {
        let entry = try request("POST", "/api/diary", body: ["entry_date": date, "workspace_id": workspaceId]) as! [String: Any]
        let fresh = try diary(date, workspaceId: workspaceId) ?? entry
        _ = try request("PUT", "/api/diary/\(date)", body: [
            "entry_id": fresh["id"] as! String, "content": content, "workspace_id": workspaceId,
            "expected_updated_at": fresh["updated_at"] as! String,
        ])
    }

    func tasks(workspaceId: String? = nil, archived: Bool = false) throws -> [[String: Any]] {
        var query = ["archived": archived ? "true" : "false"]
        if let workspaceId { query["workspace_id"] = workspaceId }
        return try request("GET", "/api/tasks", query: query) as! [[String: Any]]
    }

    func task(titled title: String) throws -> [String: Any]? {
        try tasks().first { $0["title"] as? String == title }
    }
}

enum Day {
    static func string(_ offset: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: offset, to: Date())!
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
}

class DaybookUITestCase: XCTestCase {
    var app: XCUIApplication!
    let server = TestServer()
    /// Unique per run so rows are identifiable and never collide (AGENTS.md: prefix test data).
    let runTag = "MasterTester_ios_\(Int(Date().timeIntervalSince1970) % 1_000_000)"

    override func setUpWithError() throws {
        continueAfterFailure = false
        try server.login()
        app = XCUIApplication()
    }

    func launch(reset: Bool = true) {
        // `-uiTesting` stops the app from ever falling back to the built-in production server.
        app.launchArguments = ["-uiTesting", "-serverURL", TestServer.baseURL.absoluteString]
        if reset { app.launchArguments.append("-uiTestReset") }
        app.launch()
    }

    func signIn() {
        let username = app.textFields["auth.username"]
        XCTAssertTrue(username.waitForExistence(timeout: 20), "login screen did not appear")
        username.tap()
        username.typeText("master_tester")
        let password = app.secureTextFields["auth.password"]
        password.tap()
        password.typeText("password123")
        app.buttons["auth.submit"].tap()
        XCTAssertTrue(tab("Today").waitForExistence(timeout: 20), "did not reach the tab bar")
    }

    func launchSignedIn() {
        launch()
        signIn()
    }

    /// Saves a screenshot as a test attachment and, when `DAYBOOK_SCREENSHOT_DIR` is set, as a PNG.
    func snapshot(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["DAYBOOK_SCREENSHOT_DIR"] {
            try? shot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }

    @discardableResult
    func waitFor(_ element: XCUIElement, timeout: TimeInterval = 15, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "missing \(element)", file: file, line: line)
        return element
    }

    /// Polls a server-side condition (saves are debounced and asynchronous).
    func eventually(_ description: String, timeout: TimeInterval = 15, _ condition: () throws -> Bool,
                    file: StaticString = #filePath, line: UInt = #line) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if (try? condition()) == true { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        }
        let journal = app.buttons["journal.preview"]
        let visible = journal.exists ? (journal.value as? String ?? "") : "(journal not visible)"
        snapshot("timeout-\(description.replacingOccurrences(of: " ", with: "-"))")
        XCTFail("timed out waiting for: \(description); journal shows: \(visible)", file: file, line: line)
    }

    func scrollTo(_ element: XCUIElement, in container: XCUIElement? = nil, maxSwipes: Int = 8) {
        let scroller = container ?? app.collectionViews.firstMatch
        var swipes = 0
        while !element.isHittable && swipes < maxSwipes {
            scroller.swipeUp()
            swipes += 1
        }
    }

    /// Tab buttons: a bottom tab bar on most iPhones, a side rail on wide/foldable layouts.
    func tab(_ name: String) -> XCUIElement {
        let symbols = ["Today": "book", "Tasks": "checkmark.circle", "Notes": "doc.text", "Settings": "gearshape"]
        let inBar = app.tabBars.buttons[name]
        if inBar.exists { return inBar }
        return app.buttons.matching(NSPredicate(format: "label == %@ AND identifier == %@", name, symbols[name] ?? name)).firstMatch
    }

    /// Scrolls the page list back to the top until `element` can actually receive the tap.
    func revealAtTop(_ element: XCUIElement) {
        if app.keyboards.count > 0, app.buttons["journal.done"].exists == false {
            app.collectionViews.firstMatch.swipeDown()
        }
        var swipes = 0
        while !(element.exists && element.isHittable) && swipes < 6 {
            app.collectionViews.firstMatch.swipeDown()
            swipes += 1
        }
    }

    func selectWorkspaceChip(_ name: String) {
        let chip = app.buttons["workspace.chip.\(name)"]
        waitFor(chip)
        revealAtTop(chip)
        chip.tap()
        let selected = expectation(for: NSPredicate(format: "isSelected == true"), evaluatedWith: chip)
        wait(for: [selected], timeout: 10)
    }

    func tapDayButton(_ id: String) {
        let button = waitFor(app.buttons[id])
        revealAtTop(button)
        button.tap()
    }
}
