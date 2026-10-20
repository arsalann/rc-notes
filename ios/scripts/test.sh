#!/usr/bin/env bash
# Full iOS pipeline: DaybookKit unit tests → project generation → app build → XCUITest E2E
# against an isolated local server (throwaway embedded Postgres, never a real database; see test-server.sh).
#
# Usage: ios/scripts/test.sh [-only-testing:DaybookUITests/JournalE2ETests ...]
# Env:   DAYBOOK_SIMULATOR (default "iPhone Duo"), DAYBOOK_TEST_PORT (default 3457)
set -euo pipefail

IOS="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$IOS/.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SIM="${DAYBOOK_SIMULATOR:-iPhone Duo}"
PORT="${DAYBOOK_TEST_PORT:-3457}"
SHOTS="$ROOT/.context/ios-screenshots"
RESULT="$IOS/build/TestResults.xcresult"

echo "==> DaybookKit unit tests"
(cd "$IOS/DaybookKit" && swift test)

echo "==> Generate Xcode project"
(cd "$IOS" && xcodegen generate --quiet)

echo "==> Start isolated test server"
DAYBOOK_TEST_PORT="$PORT" "$IOS/scripts/test-server.sh" start
trap 'DAYBOOK_TEST_PORT="$PORT" "$IOS/scripts/test-server.sh" stop >/dev/null' EXIT

mkdir -p "$SHOTS" "$IOS/build"
rm -rf "$RESULT"
xcrun simctl boot "$SIM" >/dev/null 2>&1 || true

echo "==> Build and run XCUITest E2E on $SIM"
TEST_RUNNER_DAYBOOK_TEST_SERVER="http://127.0.0.1:$PORT" \
TEST_RUNNER_DAYBOOK_SCREENSHOT_DIR="$SHOTS" \
xcodebuild test \
  -project "$IOS/Daybook.xcodeproj" \
  -scheme Daybook \
  -destination "platform=iOS Simulator,name=$SIM" \
  -derivedDataPath "$IOS/build/DerivedData" \
  -resultBundlePath "$RESULT" \
  "$@" >"$IOS/build/xcodebuild-test.log" 2>&1 && STATUS=0 || STATUS=$?
grep -E "^(Test Case|\*\*)|error:|Executed" "$IOS/build/xcodebuild-test.log" || true
echo "Screenshots: $SHOTS"
echo "Result bundle: $RESULT (full log: $IOS/build/xcodebuild-test.log)"
exit "$STATUS"
