#!/usr/bin/env bash
# Audit PR-triggered GitHub Actions workflows for unsafe working-tree script execution.
#
# Security invariant: any `run:` step in a PR-triggered workflow that executes a
# repository script (scripts/, bin/, or ./) MUST stage it from origin/<default>
# before executing, not run it directly from the working tree.
#
# Why: pull_request triggers checkout the PR branch. A PR that modifies a script
# would get arbitrary code execution on the CI runner — with full access to the
# workflow token and runner-level secrets — if the script is run directly.
#
# The safe pattern:
#   git show "origin/${DEFAULT}:scripts/foo.sh" > "$RUNNER_TEMP/foo.sh"
#   bash "$RUNNER_TEMP/foo.sh" [args]
#
# Reference: pr-converge.yml "Setup — stage converge scripts" (the stage() helper).
#
# Usage:
#   bash scripts/ci/check-pr-workflow-script-staging.sh [--workflow-dir DIR]
#
# Exit codes:
#   0 — no violations found
#   1 — one or more violations found (or usage error)

set -euo pipefail

WORKFLOW_DIR="${1:-}"
# Allow --workflow-dir flag
if [[ "${1:-}" == "--workflow-dir" ]]; then
  WORKFLOW_DIR="${2:?--workflow-dir requires a path argument}"
  shift 2
elif [[ "${1:-}" == --workflow-dir=* ]]; then
  WORKFLOW_DIR="${1#--workflow-dir=}"
  shift
fi

# Default: .github/workflows relative to repo root
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
WORKFLOW_DIR="${WORKFLOW_DIR:-${REPO_ROOT}/.github/workflows}"

if [[ ! -d "$WORKFLOW_DIR" ]]; then
  echo "ERROR: workflow directory not found: $WORKFLOW_DIR" >&2
  exit 1
fi

# PR-triggering event types
PR_TRIGGER_PATTERN='pull_request\|pull_request_review\b\|pull_request_review_comment'

VIOLATIONS=0
CHECKED=0

echo "Auditing PR-triggered workflows in: $WORKFLOW_DIR"
echo ""

for workflow_file in "$WORKFLOW_DIR"/*.yml "$WORKFLOW_DIR"/*.yaml; do
  [[ -f "$workflow_file" ]] || continue

  # Skip workflows that have no PR triggers
  if ! grep -qE "^\s+(pull_request|pull_request_review|pull_request_review_comment)\s*:" "$workflow_file"; then
    continue
  fi

  CHECKED=$((CHECKED + 1))
  filename="$(basename "$workflow_file")"
  echo "Checking: $filename"

  # Look for lines that look like direct working-tree script invocations:
  #   bash scripts/...
  #   sh scripts/...
  #   ./scripts/...
  #   bash ./scripts/...
  #   sh bin/...
  #   etc.
  # We want to flag any execution that does NOT use $RUNNER_TEMP.
  #
  # Strategy: find candidate lines, then check if RUNNER_TEMP appears in a
  # reasonable window around them (indicating the script was staged first).
  # This is necessarily heuristic — a full YAML parser is not available here.

  # Extract line numbers of suspect direct invocations
  SUSPECTS=$(grep -nE \
    '(bash|sh|chmod\s+\+x)\s+(\./|scripts/|bin/)' \
    "$workflow_file" || true)

  if [[ -z "$SUSPECTS" ]]; then
    echo "  ✓ No direct working-tree script calls found."
    continue
  fi

  echo "  Candidate lines (working-tree script refs):"
  while IFS= read -r line; do
    lineno="${line%%:*}"
    content="${line#*:}"

    # Check: is RUNNER_TEMP mentioned anywhere in the nearby block (±20 lines)?
    # If yes, the script was staged — not a violation.
    # We scan the block because `chmod +x $RUNNER_TEMP/foo` and the bash call
    # may be on different lines.
    BLOCK_START=$((lineno > 20 ? lineno - 20 : 1))
    BLOCK_END=$((lineno + 10))
    CONTEXT=$(sed -n "${BLOCK_START},${BLOCK_END}p" "$workflow_file")

    if echo "$CONTEXT" | grep -qE 'RUNNER_TEMP|runner\.temp'; then
      echo "    line $lineno: OK (RUNNER_TEMP in context window) — $content"
    else
      echo "    line $lineno: VIOLATION — script run directly from working tree: $content"
      echo "    → Stage it: git show \"origin/\${DEFAULT}:path/to/script.sh\" > \"\$RUNNER_TEMP/script.sh\""
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done <<< "$SUSPECTS"
done

echo ""
echo "Summary: checked $CHECKED PR-triggered workflow(s), found $VIOLATIONS violation(s)."

if [[ $VIOLATIONS -gt 0 ]]; then
  echo ""
  echo "FAILED: Apply the staging pattern from pr-converge.yml to each violation above."
  echo "See issue #130 for background and the canonical reference implementation."
  exit 1
fi

echo "PASSED: All PR-triggered workflows stage scripts from origin/<default> before executing."
exit 0
