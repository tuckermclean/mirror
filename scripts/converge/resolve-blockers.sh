#!/usr/bin/env bash
# Resolve the effective blocker count for one convergence round.
#
# The machine-readable verdict JSON written by the reviewer is the source of
# truth. But each round pre-seeds that file with a sentinel
#   {"blockers":1,"blocker_signatures":["verdict-file-not-written"]}
# so a crashed/incomplete reviewer fails safe. The reviewer is told to overwrite
# it LAST; when it posts its human-readable verdict comment but never rewrites
# the JSON (turn/timeout cutoff), the sentinel survives and the loop escalates a
# perfectly clean PR with a phantom "blockers remaining" message.
#
# This resolver closes that gap: when the sentinel is detected, it falls back to
# parsing the blocker count from the reviewer's latest PR comment footer, e.g.
#   "🔴 0 blockers | 🟡 0 suggestions | 💭 2 nits"
# so the gate agrees with what a human reads.
#
# Output: the blocker count (an integer) on stdout, or "unknown" when neither
# the JSON verdict nor the comment yields a number. Callers treat "unknown" as
# "no verdict" — escalate honestly, never claim blockers exist.
#
# Usage:   resolve-blockers.sh <verdict.json> <pr-number>
# Testing: set CONVERGE_COMMENT_BODY to bypass the `gh` network call.
set -uo pipefail

verdict_file="${1:-}"
pr_number="${2:-}"

if [ -z "$verdict_file" ] || [ -z "$pr_number" ]; then
  echo "usage: resolve-blockers.sh <verdict.json> <pr-number>" >&2
  exit 2
fi

# Extract a blocker count from a verdict comment's machine-readable footer.
parse_comment_blockers() {
  printf '%s' "$1" \
    | grep -oE '🔴[[:space:]]*[0-9]+[[:space:]]*blockers?' \
    | head -1 \
    | grep -oE '[0-9]+' \
    | head -1
}

# Emit a value only if it is a non-negative integer, else "unknown".
emit_int_or_unknown() {
  case "${1:-}" in
    "" | *[!0-9]*) echo "unknown" ;;
    *) echo "$1" ;;
  esac
}

is_sentinel="false"
if [ -f "$verdict_file" ] \
  && jq -e '(.blocker_signatures // []) | index("verdict-file-not-written")' \
       "$verdict_file" >/dev/null 2>&1; then
  is_sentinel="true"
fi

# Trust the JSON verdict whenever the reviewer actually wrote one.
if [ "$is_sentinel" = "false" ]; then
  emit_int_or_unknown "$(jq -r '.blockers // "unknown"' "$verdict_file" 2>/dev/null)"
  exit 0
fi

# Sentinel present: the JSON was never overwritten. Fall back to the comment.
if [ -n "${CONVERGE_COMMENT_BODY:-}" ]; then
  body="$CONVERGE_COMMENT_BODY"
else
  body="$(gh pr view "$pr_number" --json comments \
    --jq '[.comments[] | select(.body | test("🔴[[:space:]]*[0-9]+[[:space:]]*blockers?"))] | last | .body' \
    2>/dev/null || echo "")"
fi

if [ -n "$body" ] && [ "$body" != "null" ]; then
  emit_int_or_unknown "$(parse_comment_blockers "$body")"
  exit 0
fi

echo "unknown"
