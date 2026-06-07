#!/usr/bin/env bash
# Emit a markdown Pipeline Status Report to stdout.
#
# Calls `gh pr list` to enumerate open PRs and computes a health verdict from
# label counts. The network call is bypassable in tests via PIPELINE_PR_JSON.
#
# Health verdict:
#   BLOCKED   — needs-human count > 0
#   AT_RISK   — needs-human == 0, but (converge + agent:implementing) >= 5
#   ON_TRACK  — everything else (including all-zero)
#
# Usage:   pipeline-status.sh <repo>
# Testing: set PIPELINE_PR_JSON to bypass the `gh pr list` network call.
set -uo pipefail

repo="${1:-}"

if [ -z "$repo" ]; then
  echo "usage: pipeline-status.sh <repo>" >&2
  exit 2
fi

# Fetch PR list — use injected JSON in tests, real gh otherwise.
if [ -n "${PIPELINE_PR_JSON:-}" ]; then
  pr_json="$PIPELINE_PR_JSON"
else
  pr_json="$(gh pr list --repo "$repo" --state open --json number,isDraft,labels)"
fi

# Count PRs that carry a specific label name.
count_label() {
  local label="$1"
  printf '%s' "$pr_json" \
    | jq --arg l "$label" '[.[] | select(.labels[].name == $l)] | length'
}

implementing="$(count_label "agent:implementing")"
converge="$(count_label "converge")"
ready="$(count_label "agent:ready")"
needs_human="$(count_label "needs-human")"

# Stale drafts: isDraft == true with agent:implementing label (simple count).
stale_drafts="$(printf '%s' "$pr_json" \
  | jq '[.[] | select(.isDraft == true and (.labels[].name == "agent:implementing"))] | length')"

# Compute in-flight total for AT_RISK threshold.
in_flight=$(( implementing + converge ))

if [ "$needs_human" -gt 0 ]; then
  verdict="BLOCKED"
elif [ "$in_flight" -ge 5 ]; then
  verdict="AT_RISK"
else
  verdict="ON_TRACK"
fi

generated="$(date -u '+%Y-%m-%d %H:%M UTC')"

cat <<REPORT
## Mirror Pipeline Status

**Generated:** $generated

| Label | Count |
|-------|-------|
| 🔨 agent:implementing | $implementing |
| 🔄 converge | $converge |
| ✅ agent:ready | $ready |
| ⚠️ needs-human | $needs_human |

**Stale drafts (>20 min, no CI):** $stale_drafts

**Pipeline health: $verdict**
REPORT
