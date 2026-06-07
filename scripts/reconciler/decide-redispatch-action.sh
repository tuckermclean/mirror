#!/usr/bin/env bash
# Decide whether to re-dispatch an agent-work issue that has no open PR.
#
# Emits one decision token on stdout:
#   skip-has-pr   — an open PR already exists for this issue
#   skip-recent   — this issue was touched less than 15 minutes ago
#   escalate      — re-dispatch cap reached (>= 3 attempts)
#   redispatch    — issue needs a fresh dispatch attempt
#
# Usage: decide-redispatch-action.sh <has_open_pr> <seconds_since_last_activity> \
#                                     <redispatch_count>
#
#   has_open_pr                  0|1         1 if an open PR already references this issue
#   seconds_since_last_activity  integer|""  seconds since last dispatch/comment,
#                                            or "" if the issue was never touched
#   redispatch_count             integer     how many times reconciler re-dispatched
#
# Exit 2 on usage error (wrong argument count).
set -uo pipefail

if [ $# -ne 3 ]; then
  echo "usage: decide-redispatch-action.sh <has_open_pr> <seconds_since_last_activity> <redispatch_count>" >&2
  exit 2
fi

has_open_pr="$1"
seconds_since_last_activity="$2"
redispatch_count="$3"

# Priority 1: open PR already exists — nothing to dispatch.
if [ "$has_open_pr" -ne 0 ]; then
  echo "skip-has-pr"
  exit 0
fi

# Priority 2: issue was touched recently (< 15 min) — wait before re-dispatching.
# Only applies when seconds_since_last_activity is a non-empty value.
if [ -n "$seconds_since_last_activity" ] && [ "$seconds_since_last_activity" -lt 900 ]; then
  echo "skip-recent"
  exit 0
fi

# Priority 3: re-dispatch cap reached — escalate to human.
if [ "$redispatch_count" -ge 3 ]; then
  echo "escalate"
  exit 0
fi

# Priority 4: all other cases — re-dispatch.
echo "redispatch"
