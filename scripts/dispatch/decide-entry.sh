#!/bin/sh
# decide-entry.sh — map a GitHub event name to orchestrator entry parameters.
#
# Usage: decide-entry.sh <event_name>
#
# Outputs KEY=VALUE lines to stdout:
#   model      — Claude model ID
#   max_turns  — turn budget for the orchestrator
#   contract   — path to the agent contract to load
#
# All events route to the orchestrator-contract. The only difference is model/budget:
#   issues                        → Opus, 40 turns (delegate to specialists + integrate)
#   issue_comment / review comment → Sonnet, 30 turns (usually 1 specialist + integrate)
#   unknown                       → Sonnet, 30 turns (safe default)
#
# Review and fix quality is owned by the converge swarm (converge-reviewer.md /
# converge-fixer.md), not by the build orchestrator.
#
# Tested by tests/infra/dispatch-decide-entry.test.ts.

set -eu

EVENT="${1:-}"
CONTRACT=".agents/custom/orchestrator-contract.md"

case "$EVENT" in
  issues)
    echo "model=claude-opus-4-8"
    echo "max_turns=40"
    echo "contract=${CONTRACT}"
    ;;
  issue_comment|pull_request_review_comment)
    echo "model=claude-sonnet-4-6"
    echo "max_turns=30"
    echo "contract=${CONTRACT}"
    ;;
  *)
    # Unknown event: safe default — Sonnet, 30 turns
    echo "model=claude-sonnet-4-6"
    echo "max_turns=30"
    echo "contract=${CONTRACT}"
    ;;
esac
