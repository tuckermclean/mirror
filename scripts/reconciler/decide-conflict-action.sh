#!/usr/bin/env bash
# Decide what action to take for a PR with a merge conflict.
#
# Emits one decision token on stdout:
#   escalate  — PR is conflicting and not yet labeled needs-human
#   skip      — PR is not conflicting, or already labeled needs-human
#
# Usage: decide-conflict-action.sh <mergeable> <already_needs_human>
#
#   mergeable           string   GitHub mergeable state: CONFLICTING or other
#   already_needs_human integer  count of needs-human labels already on PR (0 = not labeled)
#
# Exit 2 on usage error (wrong argument count).
set -uo pipefail

if [ $# -ne 2 ]; then
  echo "usage: decide-conflict-action.sh <mergeable> <already_needs_human>" >&2
  exit 2
fi

mergeable="$1"
already_needs_human="$2"

if [ "$mergeable" = "CONFLICTING" ] && [ "$already_needs_human" -eq 0 ]; then
  echo "escalate"
else
  echo "skip"
fi
