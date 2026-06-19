#!/usr/bin/env bash
# Decide whether to re-dispatch or escalate when the converge loop cannot finish
# a PR on its own — i.e. the 3-round cap was reached with blockers still open, OR
# the gate found an empty (no-diff) PR.
#
# Both situations historically thrashed: the cap-reached path re-dispatched the
# implementing agent on every converge run with no count, and a re-dispatched
# agent that exited without a status comment let the reconciler re-arm converge,
# which hit cap-reached again — an unbounded loop. The empty-PR gate, conversely,
# escalated straight to a terminal `needs-human`, stranding a PR that later gained
# real work. This script gives both a single bounded, recoverable policy.
#
# Emits one decision token on stdout:
#   redispatch  — re-dispatch the closing issue's implementing agent (under cap)
#   escalate    — give up auto-recovery; a human must take over (needs-human)
#
# Usage: decide-cap-action.sh <redispatch_count> <has_issue_num>
#
#   redispatch_count  integer  how many times converge already re-dispatched this
#                              PR (counted from <!-- converge-redispatch --> markers)
#   has_issue_num     0|1      whether a closing issue number was found in the PR body
#
# Exit 2 on usage error (wrong argument count).
set -uo pipefail

# Maximum converge-initiated re-dispatches before escalating to a human. The loop
# has already run 3 review rounds by the time this is consulted, so a small bound
# is plenty — past it, repeated re-dispatch is thrash, not progress.
#
# Source of truth for this cap. Two spots in .github/workflows/pr-converge.yml
# embed the same `2` independently (the empty-PR gate, which has no checkout to
# call this script, and the stage-step inline fallback) — update both if you
# change this value. They reference this constant by name in their comments.
MAX_REDISPATCHES=2

if [ $# -ne 2 ]; then
  echo "usage: decide-cap-action.sh <redispatch_count> <has_issue_num>" >&2
  exit 2
fi

redispatch_count="$1"
has_issue_num="$2"

# No closing issue → nothing to re-dispatch to; a human must intervene.
if [ "$has_issue_num" -eq 0 ]; then
  echo "escalate"
  exit 0
fi

# Re-dispatch budget exhausted → escalate once, cleanly, instead of looping.
if [ "$redispatch_count" -ge "$MAX_REDISPATCHES" ]; then
  echo "escalate"
  exit 0
fi

echo "redispatch"
