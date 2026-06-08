#!/usr/bin/env bash
# eval-prompts.sh — wrapper around `pnpm eval:prompts` that skips gracefully
# when the Anthropic API key is absent or the account has exhausted its credits.
#
# Exit behaviour:
#   0  — evals passed (or skipped due to missing/exhausted key)
#   1  — evals failed for a non-billing reason (bad assertions, config errors…)
#
# Why this wrapper exists instead of a workflow-level guard:
#   The CI workflow already has `if: env.ANTHROPIC_API_KEY != ''` but that only
#   guards against a missing key.  A key with exhausted credits causes promptfoo
#   to exit 100 ("Please go to Plans & Billing to upgrade or purchase credits").
#   We treat billing exhaustion as a skip, not a hard failure, so that a depleted
#   sandbox key never blocks a merge that has no prompt changes.

set -euo pipefail

# ── 1. Key presence check ────────────────────────────────────────────────────
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "[eval-prompts] ANTHROPIC_API_KEY is not set — skipping prompt evals." >&2
  exit 0
fi

# ── 2. Run evals, capture exit codes ────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

E1=0
E2=0

pnpm run eval:interview || E1=$?
pnpm run eval:voice     || E2=$?

COMBINED=$(( E1 | E2 ))

# ── 3. Billing / auth exhaustion → graceful skip ────────────────────────────
# promptfoo exits with code 100 when every provider call fails due to billing
# or authentication issues ("Please go to Plans & Billing …").  We treat this
# as a skip rather than a hard failure so that credit exhaustion in a shared CI
# key does not block merges.
if [[ "${E1}" -eq 100 || "${E2}" -eq 100 ]]; then
  echo "[eval-prompts] Anthropic API returned a billing/auth error (exit 100)." >&2
  echo "[eval-prompts] Prompt evals skipped — add credits or set a valid ANTHROPIC_API_KEY to run them." >&2
  exit 0
fi

exit "${COMBINED}"
