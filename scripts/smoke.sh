#!/usr/bin/env bash
# smoke.sh — secrets-free standalone boot test.
#
# Lifts the standalone start sequence from ci.yml and asserts that the
# critical endpoints respond correctly. Run after `make build`.
#
# Usage: bash scripts/smoke.sh
# Requires: node, curl — no Anthropic/Clerk/Inngest secrets needed.
set -euo pipefail

PORT=3000
BASE="http://localhost:${PORT}"
APP_PID=""

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

cleanup() {
  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── 1. Verify the standalone build exists ────────────────────────────────────
if [[ ! -d ".next/standalone" ]]; then
  fail ".next/standalone not found — run 'make build' first"
fi

# ── 2. Copy static assets into standalone (mirrors ci.yml:207-213) ──────────
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# ── 3. Start the standalone server ───────────────────────────────────────────
echo "Starting standalone server on port ${PORT}…"
PORT="${PORT}" node .next/standalone/server.js &
APP_PID=$!

# ── 4. Wait for liveness (up to 60 s) ────────────────────────────────────────
echo "Waiting for ${BASE}/api/health/live …"
timeout 60 bash -c "until curl -sf ${BASE}/api/health/live > /dev/null 2>&1; do sleep 2; done" \
  || fail "Server did not become live within 60 s"

# ── 5. Assert /api/health/live returns 200 ───────────────────────────────────
LIVE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/health/live")
[[ "$LIVE_STATUS" == "200" ]] || fail "/api/health/live returned HTTP ${LIVE_STATUS} (expected 200)"
pass "/api/health/live → 200"

# ── 6. Assert GET /api/inngest is < 500 and JSON ─────────────────────────────
# This is the primary regression guard: Inngest serve() must not 500 when
# INNGEST_SIGNING_KEY is absent (the bug from PR #22).
INNGEST_STATUS=$(curl -s -o /tmp/smoke_inngest.json -w "%{http_code}" "${BASE}/api/inngest")
[[ "$INNGEST_STATUS" -lt 500 ]] \
  || fail "/api/inngest returned HTTP ${INNGEST_STATUS} (expected < 500); body: $(cat /tmp/smoke_inngest.json)"

# Verify the response is valid JSON
if ! node -e "JSON.parse(require('fs').readFileSync('/tmp/smoke_inngest.json','utf8'))" 2>/dev/null; then
  fail "/api/inngest did not return valid JSON; body: $(cat /tmp/smoke_inngest.json)"
fi
pass "/api/inngest → ${INNGEST_STATUS} (JSON)"

# ── 7. Assert /api/health/ready — accept 200 or 503 (DB may not be present) ──
# In smoke context there may be no postgres; 503 means the server booted correctly
# but DB is unreachable, which is expected. 500+ from the route itself is a bug.
READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/health/ready")
[[ "$READY_STATUS" -lt 500 ]] \
  || fail "/api/health/ready returned HTTP ${READY_STATUS} (expected < 500)"
pass "/api/health/ready → ${READY_STATUS}"

echo ""
echo "Smoke check passed."
