# ADR-0002: Autonomous SWE Org — Gap Analysis, Round 2

- **Date:** 2026-06-07
- **Status:** Accepted
- **Deciders:** Tucker McLean
- **Supersedes:** None — extends [ADR-0001](0001-ci-autonomy-strategy-review.md)

---

## Context

ADR-0001 diagnosed four structural problems with Mirror's autonomous CI loop and defined a
P0/P1/P2 hardening roadmap. P0 *scripts* landed on master (#129, #132):
`decide-round.sh`, `resolve-blockers.sh`, `strip-attribution.sh`, `smoke.sh`, and a
workflow script-staging audit tool, plus `ORCHESTRATION.md`.

This ADR completes a second review: finishing the ADR-0001 backlog, comparing the running
loop against the NEXUS doctrine in `agency-agents/strategy/`, and introducing the
**in-org agent swarm** as a first-class analysis dimension.

### Reference models compared

| Model | What it is |
|---|---|
| **ADR-0001 backlog** | Mirror's own sanctioned hardening roadmap; partially executed |
| **NEXUS** | A 7-phase, gate-kept, business-oriented product delivery doctrine in the sibling `agency-agents` repo. Conceptual ancestor of Mirror's loop — Mirror borrowed its DNA ("max 3 retries", "evidence over claims", "quality gates") and re-implemented a leaner, executable version |

---

## What changed this round

### Executed now (on this branch)

| Stream | What was built | Tests added |
|---|---|---|
| A — Reconciler scripts | `scripts/reconciler/decide-stale-action.sh`, `decide-conflict-action.sh`, `decide-rearm-action.sh`, `decide-redispatch-action.sh` | 57 new infra tests |
| B — make ci + coverage | Fixed false Makefile comment; added `make coverage` / `pnpm coverage`; extended `vitest.config.ts` to global src coverage config; installed missing `@vitest/coverage-v8` | — |
| C — Routing golden-file test | `src/lib/orchestration/route-issue.ts` — deterministic TypeScript router matching the 18 keyword rules; `evals/golden/routing-fixtures.json` — 31 documented fixture cases | 76 unit tests |
| D — Pipeline Status Report | `scripts/status/pipeline-status.sh` — markdown health snapshot (ON_TRACK / AT_RISK / BLOCKED); env-injectable for tests | 7 new infra tests |
| E — Supply-chain pin | `agency-agents` clone pinned to SHA `4e905cff` in `dispatch.yml`, `pr-converge.yml`, `review.yml` | — |

**Total new tests this round:** 140 (57 infra reconciler + 76 unit routing + 7 infra status).
Combined with the 58 tests already in `tests/infra/` from ADR-0001 P0: **198 orchestration tests**.

---

## NEXUS gap analysis — the disposition table

| NEXUS idea | Mirror's current state | Disposition |
|---|---|---|
| Named gate-keeper per transition | Implicit (roles defined in workflow comments) | **Adopt (doc-level):** added Gate-Keeper Map to ORCHESTRATION.md |
| Pipeline Status Report artifact | None | **Adopted:** `scripts/status/pipeline-status.sh` |
| "Reviewer defaults to NEEDS WORK", evidence-over-claims | ✅ converge reviewer + CI gates enforce this | Already have it |
| Max-3-retries → escalate | ✅ 3-round converge + reconciler 3-attempt cap | Already have it |
| Self-healing controller | ✅ `agent-reconciler.yml` (cron */15) | Mirror exceeds NEXUS — NEXUS relies on a human Orchestrator |
| LLM token cost caps | ✅ `llm_spend_ledger` + $20 monthly cap | Mirror exceeds NEXUS — NEXUS is silent on this |
| SHA-pinned supply chain | ✅ Pinned in this branch | Mirror exceeds NEXUS — NEXUS doesn't address supply chain |
| Testable orchestration scripts | ✅ 198 tests over bash decision scripts | Mirror exceeds NEXUS — NEXUS doesn't address this |
| In-org agent swarms (parallel tracks, concurrent Dev↔QA loops) | ❌ Not implemented (see below) | **Genuine gap — design proposal in this ADR** |
| Finance Tracker / ROI / LTV:CAC / 7-phase product lifecycle / launch campaigns | N/A — code org | **Rejected** — not a code org's concern |

---

## In-org agent swarm orchestration (the main NEXUS gap)

### Current state: cross-issue concurrency only

Mirror has **cross-issue concurrency**: many issues → many PRs in flight simultaneously, each
running its own converge loop and reconciled by `cron */15`. The pipeline processes multiple
independent tasks concurrently and self-heals them. This is **more reliable** than NEXUS's
prescribed model, which uses a human Orchestrator manually running Dev↔QA loops.

What Mirror does **not** have: **intra-task swarming**. The unit of work is always:
```
one issue → one specialist agent → one PR → converge (reviewer + fixer, sequential)
```

NEXUS prescribes:
- **4 parallel tracks** (Core Product, Growth, Quality, Brand), each with a track manager
- **Concurrent Dev↔QA loops** merged in dependency order by the Orchestrator
- **Issue fan-out**: a large issue decomposed into sub-issues dispatched in parallel to
  multiple specialists whose outputs are merged
- **Multi-specialist collaboration** on a single complex task (e.g. Frontend Developer +
  UI Designer working the same PR simultaneously)

### Why it matters for Mirror

The current 1-issue-1-agent model works well for most tasks. It breaks down when:
1. A large feature requires coordinated changes across frontend, backend, and database — the
   single specialist produces a sprawling PR that fails code review in multiple domains
2. The dispatcher routes "wrong" (e.g. a frontend issue with a backend schema change goes
   to frontend-developer, who can't fix the schema correctly)
3. Review feedback is simultaneously architectural AND implementation-level — the single
   fixer must be a generalist

### Design proposal for in-org swarming (approved follow-up)

**Model: issue fan-out via orchestrator**

A new orchestrator role (either a dedicated agent or a workflow step) intercepts large/
cross-cutting issues and decomposes them into a dependency graph of sub-issues before
dispatching. The orchestrator is triggered by a new label: `orchestrate`.

```
issue [agent-work + orchestrate]
  → orchestrator agent (Opus, 30 turns)
      reads issue body + ORCHESTRATION.md
      identifies domains: frontend / backend / db / infra / etc.
      creates sub-issues (gh issue create) with:
        - scope-limited body
        - Closes #parent in body (traceability)
        - agent-work label (enters normal dispatch queue)
        - dependency: metadata in body ("depends on #N")
      posts decomposition comment on parent issue
  → normal dispatch queue picks up each sub-issue independently
  → reconciler merges: when all sub-PRs are agent:ready, re-arms parent issue
    for a "merge sweep" step (optional: an agent rebases and creates a coordinating PR)
```

**Phase 1 implementation (minimal, approved for follow-up PR):**
1. New workflow trigger: issue labeled `orchestrate`
2. Orchestrator agent prompt: reads issue body, creates sub-issues, posts plan comment
3. Reconciler extension: detect when all sub-PRs for a parent issue are `agent:ready`
   and post a summary comment on the parent issue for human merge
4. No automated merge of sub-PRs (human verifies the decomposition made sense)

**Phase 2 (requires more trust):**
- Dependency ordering: reconciler dispatches sub-issues in topological order, not all at once
- Automated merge sweep: reconciler merges sub-PRs in order after all are agent:ready + CI green

**Why Phase 1 is safe:** The orchestrator only creates issues and comments — it doesn't push
code or merge PRs. The decomposed sub-issues flow through the existing, hardened pipeline.
The `orchestrate` label is a new entry point that doesn't change the existing `agent-work` path.

---

## Coverage gap documentation (from Stream B)

Coverage was not measured before this branch. Stream B ran `pnpm coverage` (unit + infra tests;
integration tests excluded — they require `DATABASE_URL`):

| Scope | Lines | Branches | Functions | Statements |
|---|---|---|---|---|
| `src/` (global) | 59.6% | 83.0% | 59.1% | 59.6% |
| `src/lib/parsers/**` | 98.8% | 86.5% | 100% | 98.8% |
| `src/lib/crypto/**` | N/A — module not yet implemented | | | |

**Gap to AGENTS.md promises:**
- `src/ ≥ 80%` — actual 59.6% for lines/functions. Gap of ~20pp. Primary drivers: many
  `src/` files are React components + Next.js layouts (require jsdom/Playwright to test),
  several modules are stubs (`src/lib/voice/extract.ts`, `src/lib/llm/cost-guard.ts`).
- `src/lib/parsers/ = 100%` — already failing pre-branch at 98.8% lines / 86.5% branches.
  Specific uncovered paths: `linkedin-pdf.ts` conditional branches, `types.ts` (type-only file
  counted as 0% by v8).
- `src/lib/crypto/ = 100%` — module doesn't exist yet (RED test suite for unimplemented feature).

**Action:** Thresholds in `vitest.config.ts` are set to current actual values (55% lines, 80%
branches) with TODO comments. They should be raised as coverage improves, not all at once.

**Missing dependency fixed:** `@vitest/coverage-v8` was absent from `package.json` —
`pnpm coverage` would fail immediately. Installed in this branch.

---

## Routing test notes (from Stream C)

The deterministic keyword router (`src/lib/orchestration/route-issue.ts`) surfaced two genuine
ambiguities in the dispatcher's 18 rules:

1. **Word-boundary collisions for short tokens.** `ci` fires in "hallucinated", `adr` fires
   in "quadrant", `ui` fires in "fluid". The production LLM dispatcher handles these via context
   reasoning; the deterministic router uses `\bword\b` regex for all 1-4-char alphabetic tokens.
   This is the canonical behaviour for a local regression test — the LLM dispatcher can deviate
   for edge cases, which is correct.

2. **"information architecture" collides with rule 3 ("architecture" → software-architect).**
   Rule 7 intends "information architecture" → ux-architect, but the word "architecture" triggers
   rule 3 first. Documented in `evals/golden/routing-fixtures.json`. Fixing this requires either
   ordering rule 7 above rule 3 or making rule 3 require "system design" or "adr" context.
   **Not fixed in this branch** — this is a dispatcher behaviour question for the product owner.

---

## Remaining proposals (not applied — need-human or future PR)

### P1 — Kill the gating theater (ADR-0001 items 7-9)

These require workflow changes that should be reviewed carefully:

**Remove `continue-on-error: true` from unit tests in `ci.yml`** once the intentionally-RED
test suites (`cookie-crypto.spec.ts`, `extraction.spec.ts`) are cleaned up or removed.
Currently 4 known-RED tests gate nothing. When they're resolved, flip the flag.

**Wire `--coverage` into `ci.yml`** so the configured thresholds block merges. Suggested step
after "Unit Tests":
```yaml
- name: Coverage
  run: pnpm coverage
  # Thresholds enforced in vitest.config.ts — see ADR-0002 for current gap.
```
Block this until the 80% target is realistic (i.e. React/Next.js components have jsdom tests
or the threshold is deliberately lowered to ~60% for now).

**Loop `eval:prompts` over all 6 eval configs** (currently only runs 2):
```yaml
- name: Prompt Evals
  run: |
    pnpm run eval:interview
    pnpm run eval:voice
    # Add when configs exist:
    # pnpm exec promptfoo eval --config evals/prompts/profile_generation.yaml
    # pnpm exec promptfoo eval --config evals/prompts/rationale.yaml
    # pnpm exec promptfoo eval --config evals/prompts/recruiter_eye.yaml
```

**Wire visual/a11y/perf** into a workflow (currently no workflow runs these). Can be a
non-blocking step on master pushes: `pnpm test:a11y`, `pnpm test:visual`, `pnpm test:perf`.

### P1 — Wire reconciler decision scripts into `agent-reconciler.yml`

The 4 scripts in `scripts/reconciler/` are not yet called from the workflow. The workflow's
inline bash still contains the full decision logic. The wiring pattern (for each step):

```yaml
# Before: inline decision logic embedded in a 30-line run: block
# After: two lines:
ACTION=$(bash scripts/reconciler/decide-stale-action.sh \
  "$REDISPATCH_COUNT" "$CI_RUNS" "$HAS_CONVERGE" "$FAILING" "$HAS_ISSUE")
case "$ACTION" in
  escalate)           ... ;;
  trigger-ci)         ... ;;
  mark-ready)         ... ;;
  mark-ready-and-converge) ... ;;
  redispatch)         ... ;;
  needs-human)        ... ;;
esac
```

This requires reading each reconciler step, extracting the data-fetching `gh` calls into
variables, and passing those variables into the script. Estimated: one focused PR, ~150 LOC
change to `agent-reconciler.yml`. **Can be dispatched as an `orchestrate`-labeled issue once
the orchestrator workflow exists, or done manually.**

### P2 — CODEOWNERS + required checks

```
# .github/CODEOWNERS
/.github/workflows/   @tucker-mclean  # Protected: no agent can merge workflow changes
/ARCHITECTURE.md      @tucker-mclean
/THREAT_MODEL.md      @tucker-mclean
/COMPLIANCE.md        @tucker-mclean
/AGENTS.md            @tucker-mclean
```

Set these as required reviewers in GitHub → Settings → Branches → master protection rules.
This promotes the current soft "protected-path → needs-human" guard into a hard GitHub
enforcement that blocks merge even if an agent bypasses the converge check.

### P2 — Routing rule fix for "information architecture" ambiguity

Move rule 7 (ux) to appear before rule 3 (architecture) in `receptionist-dispatcher.md`, OR
tighten rule 3 to require "system design" OR "adr" OR "scalability" to co-occur with "architecture"
so that bare "architecture" in a UX context doesn't mis-route.

---

## Consequences

- The `fix:feat` ratio should continue falling as more orchestration decisions become
  unit-test failures caught locally.
- The reconciler scripts (`scripts/reconciler/`) are the extraction seed for the Phase 1
  in-org swarm orchestrator — the decomposition logic will live alongside them.
- Coverage thresholds are now measured and honest rather than aspirational and invisible.
- `agency-agents` persona updates now require a human to update the pinned SHA — a deliberate
  review gate, not accidental drift.
- Every documented gate must fire. Dead gates are correctness bugs for agent operators.
