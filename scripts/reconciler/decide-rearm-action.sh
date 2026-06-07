#!/usr/bin/env bash
# Decide whether to trigger CI, re-arm converge, or skip for a non-draft converge PR.
#
# Emits one decision token on stdout:
#   trigger-ci       — CI has never run on HEAD; trigger it first
#   skip-in-progress — converge workflow is currently in_progress
#   skip-done        — converge completed:success and PR has a terminal label
#   skip-recent      — converge finished < 300 seconds ago (race-condition guard)
#   rearm            — converge needs to be re-armed (all other cases)
#
# Usage: decide-rearm-action.sh <ci_runs> <converge_state> <has_terminal_label> \
#                                <seconds_since_last_run>
#
#   ci_runs                integer     total CI check-runs on HEAD
#   converge_state         string      "<status>:<conclusion>" e.g. "in_progress:",
#                                      "completed:success", "none:none"
#   has_terminal_label     0|1         1 if PR has agent:ready or needs-human
#   seconds_since_last_run integer|""  seconds since converge last ran, or "" if never
#
# Exit 2 on usage error (wrong argument count).
set -uo pipefail

if [ $# -ne 4 ]; then
  echo "usage: decide-rearm-action.sh <ci_runs> <converge_state> <has_terminal_label> <seconds_since_last_run>" >&2
  exit 2
fi

ci_runs="$1"
converge_state="$2"
has_terminal_label="$3"
seconds_since_last_run="$4"

# Priority 1: CI never ran — trigger it before touching converge.
if [ "$ci_runs" -eq 0 ]; then
  echo "trigger-ci"
  exit 0
fi

# Priority 2: converge is currently running — leave it alone.
if [ "$converge_state" = "in_progress:" ]; then
  echo "skip-in-progress"
  exit 0
fi

# Priority 3: converge exited cleanly AND PR reached a terminal label — truly done.
if [ "$converge_state" = "completed:success" ] && [ "$has_terminal_label" -ne 0 ]; then
  echo "skip-done"
  exit 0
fi

# Priority 4: converge finished recently (< 5 min) — defer to avoid feedback loops.
# Only applies when seconds_since_last_run is a non-empty value.
if [ -n "$seconds_since_last_run" ] && [ "$seconds_since_last_run" -lt 300 ]; then
  echo "skip-recent"
  exit 0
fi

# Priority 5: all other cases — re-arm converge.
# Includes: completed:success with no terminal label (cap-reached non-terminal path),
# completed:failure, none:none (never ran), and completed:success with old timestamp.
echo "rearm"
