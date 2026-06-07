#!/usr/bin/env bash
# Decide the convergence action for one round of the pr-converge loop.
#
# Collapses the triple copy-pasted R1/R2/R3 "Check CI / Decide" blocks from
# pr-converge.yml into a single, testable decision function.
#
# Inputs (env vars — all required):
#   ROUND     — 1, 2, or 3
#   BLOCKERS  — non-negative integer, or "unknown" (no machine verdict)
#   CI_GREEN  — "true" | "false"
#   PREV_SIGS — sorted JSON array of blocker_signatures from the PRIOR round
#               (pass "[]" for round 1 — unused)
#   CURR_SIGS — sorted JSON array of blocker_signatures from the CURRENT round
#
# Output (stdout): one action token
#   approve              — 0 blockers AND CI green; safe to approve the PR
#   fix                  — continue to the fix step (blockers remain, not stuck)
#   escalate:no-progress — same blocker signatures two consecutive rounds
#   escalate:no-verdict  — reviewer left no machine verdict (BLOCKERS == "unknown")
#   escalate:ci-red      — blockers cleared but a required CI check is not green
#   escalate:cap-reached — round-3 cap hit with blockers still open
#
# Exit codes:
#   0 — action written to stdout
#   2 — usage error (missing or invalid required env vars)
#
# Testing: set ROUND, BLOCKERS, CI_GREEN, PREV_SIGS, CURR_SIGS directly —
# no network calls, no file I/O, nothing to stub.
set -uo pipefail

err() { echo "$*" >&2; }

# Validate required inputs.
for var in ROUND BLOCKERS CI_GREEN PREV_SIGS CURR_SIGS; do
  val="${!var:-}"
  if [ -z "$val" ]; then
    err "usage: ROUND=<1|2|3> BLOCKERS=<int|unknown> CI_GREEN=<true|false> \\"
    err "       PREV_SIGS=<json-array> CURR_SIGS=<json-array> decide-round.sh"
    exit 2
  fi
done

case "$ROUND" in
  1|2|3) ;;
  *) err "ROUND must be 1, 2, or 3 (got: $ROUND)"; exit 2 ;;
esac

case "$CI_GREEN" in
  true|false) ;;
  *) err "CI_GREEN must be 'true' or 'false' (got: $CI_GREEN)"; exit 2 ;;
esac

case "$BLOCKERS" in
  [0-9]* | unknown) ;;
  *) err "BLOCKERS must be a non-negative integer or 'unknown' (got: $BLOCKERS)"; exit 2 ;;
esac

# Approve when fully clear — blockers gone AND CI green.
if [ "$BLOCKERS" = "0" ] && [ "$CI_GREEN" = "true" ]; then
  echo "approve"
  exit 0
fi

# Round 1: only fix or approve — no escalation paths at this stage.
if [ "$ROUND" = "1" ]; then
  echo "fix"
  exit 0
fi

# Rounds 2 and 3: detect no-progress (same non-empty blocker signatures, still blocked).
# Exclude the both-empty case: two reviewers both omitting blocker_signatures is not evidence
# of being stuck — it means the reviewer didn't emit signatures, not that progress stalled.
if [ "$CURR_SIGS" = "$PREV_SIGS" ] && [ "$CURR_SIGS" != "[]" ] && \
   [ "$BLOCKERS" != "0" ] && [ "$BLOCKERS" != "unknown" ]; then
  echo "escalate:no-progress"
  exit 0
fi

# Round 2: still has room for another fix pass.
if [ "$ROUND" = "2" ]; then
  echo "fix"
  exit 0
fi

# Round 3 (final round — no fix step): enumerate remaining escalation reasons.
if [ "$BLOCKERS" = "unknown" ]; then
  # Reviewer wrote no machine verdict and the comment couldn't be parsed.
  # Escalate honestly — never claim blockers that may not exist.
  echo "escalate:no-verdict"
elif [ "$BLOCKERS" = "0" ]; then
  # Blockers cleared but CI is not green (would have approved above if both clear).
  echo "escalate:ci-red"
else
  echo "escalate:cap-reached"
fi
