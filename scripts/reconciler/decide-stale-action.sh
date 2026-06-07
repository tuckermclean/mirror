#!/usr/bin/env bash
# Decide what action to take for a stale draft PR with agent:implementing label.
#
# Given metadata about the stale PR, emits one decision token on stdout:
#   escalate              — redispatch cap reached (>= 3 attempts)
#   trigger-ci            — CI has never run on HEAD; trigger it first
#   mark-ready            — agent finished and added converge label; just mark ready
#   mark-ready-and-converge — CI green, agent forgot to mark ready + add converge
#   redispatch            — CI failing, agent didn't finish, issue number known
#   needs-human           — CI failing, agent didn't finish, no issue number found
#
# Usage: decide-stale-action.sh <redispatch_count> <ci_runs> <has_converge> \
#                                <failing_count> <has_issue_num>
#
#   redispatch_count  integer   how many times reconciler already re-dispatched
#   ci_runs           integer   how many CI check-runs on HEAD (0 = never ran)
#   has_converge      0|1       whether the PR already carries the converge label
#   failing_count     integer   count of failing blocking CI checks
#   has_issue_num     0|1       whether a closing issue number was found in PR body
#
# Exit 2 on usage error (wrong argument count).
set -uo pipefail

if [ $# -ne 5 ]; then
  echo "usage: decide-stale-action.sh <redispatch_count> <ci_runs> <has_converge> <failing_count> <has_issue_num>" >&2
  exit 2
fi

redispatch_count="$1"
ci_runs="$2"
has_converge="$3"
failing_count="$4"
has_issue_num="$5"

# Priority 1: redispatch cap reached — escalate regardless of other state.
if [ "$redispatch_count" -ge 3 ]; then
  echo "escalate"
  exit 0
fi

# Priority 2: CI never ran on HEAD — trigger it before making any other decision.
if [ "$ci_runs" -eq 0 ]; then
  echo "trigger-ci"
  exit 0
fi

# Priority 3: agent finished its work (added converge label) — just mark ready.
if [ "$has_converge" -ne 0 ]; then
  echo "mark-ready"
  exit 0
fi

# Priority 4: CI green, agent forgot to mark ready and add converge label.
if [ "$failing_count" -eq 0 ]; then
  echo "mark-ready-and-converge"
  exit 0
fi

# Priority 5: CI failing, agent didn't finish — re-dispatch if issue is known.
if [ "$has_issue_num" -ne 0 ]; then
  echo "redispatch"
  exit 0
fi

# Priority 6: CI failing, no issue number — human must intervene.
echo "needs-human"
