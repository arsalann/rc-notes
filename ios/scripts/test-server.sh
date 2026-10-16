#!/usr/bin/env bash
# Start an isolated daybook API server for iOS tests.
#
# Safety: this NEVER talks to MotherDuck. MOTHERDUCK_NOTEBOOK_RC is unset for the child process and
# the database is a throwaway DuckDB file under $TMPDIR. A first admin user `master_tester`
# (password `password123`) is created through /api/setup.
#
# Usage: ios/scripts/test-server.sh [start|stop|status]   (env: DAYBOOK_TEST_PORT, default 3457)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${DAYBOOK_TEST_PORT:-3457}"
STATE_DIR="${TMPDIR:-/tmp}/daybook-ios-test-$PORT"
PID_FILE="$STATE_DIR/server.pid"
LOG_FILE="$STATE_DIR/server.log"
BASE="http://127.0.0.1:$PORT"

stop() {
  if [[ -f "$PID_FILE" ]]; then
    local pid; pid="$(cat "$PID_FILE")"
    # Kill the whole process group started by `setsid`-less nohup: nuxt spawns a child worker.
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  # Belt and braces: anything still bound to the port from a previous run.
  local stale; stale="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -n "$stale" ]] && kill -TERM $stale 2>/dev/null || true
}

start() {
  stop
  rm -rf "$STATE_DIR"
  mkdir -p "$STATE_DIR"
  if [[ ! -d "$ROOT/app/node_modules" ]]; then
    (cd "$ROOT/app" && npm ci >/dev/null)
  fi
  (
    cd "$ROOT/app"
    env -u MOTHERDUCK_NOTEBOOK_RC \
      DUCKDB_PATH="$STATE_DIR/test.db" \
      SESSION_SECRET="daybook-ios-test-secret-$(date +%s)-0123456789abcdef" \
      NUXT_TELEMETRY_DISABLED=1 \
      nohup npx nuxt dev --host 127.0.0.1 --port "$PORT" >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )
  for _ in $(seq 1 120); do
    if curl -fsS "$BASE/api/setup/status" >/dev/null 2>&1; then break; fi
    sleep 1
  done
  if ! curl -fsS "$BASE/api/setup/status" >/dev/null 2>&1; then
    echo "server failed to start; log: $LOG_FILE" >&2
    tail -40 "$LOG_FILE" >&2
    exit 1
  fi
  curl -fsS -X POST "$BASE/api/setup" -H 'Content-Type: application/json' \
    -d '{"username":"master_tester","password":"password123"}' >/dev/null
  echo "daybook test server ready at $BASE (db: $STATE_DIR/test.db)"
}

case "${1:-start}" in
  start) start ;;
  stop) stop; echo "stopped" ;;
  status) curl -fsS "$BASE/api/setup/status" && echo ;;
  *) echo "usage: $0 [start|stop|status]" >&2; exit 2 ;;
esac
