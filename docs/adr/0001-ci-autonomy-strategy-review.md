# ADR-0001: CI Strategy Review — Autonomous SWE Org Hardening

- **Date:** 2026-06-06
- **Status:** Accepted
- **Deciders:** Tucker McLean

---

## Context

A full-stack review of the CI pipeline and autonomous-agent development loop was conducted
against the stated philosophy ("CI as testable scripts + thin YAML dispatcher, agent-iterable")
and the NEXUS doctrine in the sibling `agency-agents` repo.

### What is actually running

Mirror operates a GitHub-native, closed-loop autonomous development pipeline:

```
issue [agent-work]
  → dispatch.yml  (Haiku classifies → .dispatch.json → routes to specialist)
  → execute       (Sonnet/Opus implements, opens draft PR with Closes #N + converge label)
  → pr-converge.yml  (3-round Review→CheckCI→Decide→Fix loop)
  → agent:ready   (converge approves, CI green)
  → human merge
```

A `cron: */15` reconciler (`agent-reconciler.yml`) self-heals: recovers stale drafts,
re-arms CI when Actions-token pushes suppress `synchronize`, flags conflicts, and
re-dispatches orphaned issues with a 3-attempt cap.

As of this review: 23 of the last 30 merged PRs are authored by `app/claude`. Master is
consistently green. The pipeline is real, not aspirational.

### What NEXUS is

The `agency-agents` repo contains the NEXUS doctrine — a 1,100-line, 7-phase deployment
framework. Mirror did **not** implement NEXUS. Mirror borrowed its conceptual DNA ("max 3
retries → escalate," "evidence over claims," "quality gates," "single source of truth") and
re-implemented a leaner, executable version. `agency-agents` supplies persona `.md` files
cloned at CI runtime; mirror supplies all orchestration logic.

### Four structural problems found

**1. The orchestration brain violates the repo's own philosophy.**

`pr-converge.yml` (29KB) and `agent-reconciler.yml` (16KB) are embedded-bash state machines.
The R1/R2/R3 Check-CI/Decide logic is triple copy-pasted inline. Only one piece of
orchestration logic is extracted and tested: `scripts/converge/resolve-blockers.sh`. This is
the model citizen — but it's the only one.

Consequence: recent commits are `fix:feat ≈ 2.5:1`, dominated by `fix(reconciler/…)`,
`fix(dispatch/…)`, `fix(converge/…)`. The pipeline debugs itself via 15-minute CI
round-trips because the orchestration brain cannot run locally. TDD is enforced on agents'
*output*; it is exempted from the agents' *own machinery*.

**2. Gating theater — AGENTS.md promises gates that never fire.**

Agents navigate by AGENTS.md as ground truth. Doc-vs-reality drift is a correctness bug:
- `tests/visual`, `tests/a11y`, `tests/perf` are wired into no workflow.
- Coverage thresholds (`src/ ≥80%`, `src/lib/crypto/ =100%`) are documented but not
  configured in `vitest.config.ts`. `--coverage` is never run in CI.
- "CI blocks merges on prompt eval regression" — only 1 of 6 eval configs is invoked.
- Unit tests are `continue-on-error` (gate nothing).
- `make ci` comment claims it matches CI's blocking set; it does not
  (omits docker/helm/e2e/eval; treats unit as blocking when CI does not).

**3. Unpinned supply chain.**

Every agent run does `git clone --depth 1 …/agency-agents` with no pinned ref, then runs
with `--dangerously-skip-permissions`. A change to the upstream repo's `master` silently
rewrites agent behavior with no review.

**4. Doctrine fragmentation.**

The real loop lives only in scattered workflow header comments and `.agents/custom/*.md`.
No single orchestration overview exists in mirror. The polished overview (NEXUS) is in
another repo and is not what runs.

---

## Decision

**Harden mirror now; keep a future framework-extraction cheap.**

The working loop is the asset. The plan is:

### P0 — Extract + test the orchestration brain

1. `scripts/converge/decide-round.sh` — collapse the triple-pasted R1/R2/R3 Decide blocks
   into one env-injectable script; test all branches in `tests/infra/`.
2. `scripts/reconciler/*.sh` — one script per reconciler decision, each tested.
3. `scripts/git/strip-attribution.sh` — the `prepare-commit-msg` heredoc duplicated in
   dispatch/converge/trivial-fix workflows. Commit once; workflows install it.
4. De-dupe the standalone-server boot: have `ci.yml`'s e2e job call `scripts/smoke.sh`.

### P0 — One source of truth for "what gates"

5. Align `make ci` with `ci.yml`'s actual blocking set, or document the intentional
   differences. Remove the false "matches blocking checks" comment.

### P1 — Kill the gating theater

6. Wire coverage into CI (add `--coverage`) and configure the thresholds AGENTS.md promises,
   or correct AGENTS.md. Today coverage never runs.
7. Wire visual / a11y / perf into a workflow, or downgrade the AGENTS.md claims to "planned."
8. Loop `eval:prompts` over all 6 eval configs, or correct the "CI blocks merges" claim.
9. Revisit `continue-on-error: true` on unit tests once intentionally-RED suites are gone.

### P1 — Pin the supply chain

10. Pin the `agency-agents` clone to a commit SHA. Record the ref so persona changes are
    reviewed rather than silently inherited.

### P2 — Test routing + consolidate doctrine

11. Golden-file routing test for `receptionist-dispatcher.md`.
12. `ORCHESTRATION.md` — single canonical doc for the loop (state diagram, label lifecycle,
    escalation reasons, gate list). This is the portable doctrine NEXUS only describes.
13. `CODEOWNERS` + required-checks backed by GitHub, not only the converge job's grep.

### Approval guardrails

Items touching `.github/workflows/**` and `AGENTS.md` trigger the converge protected-path
guard (→ `needs-human`). This ADR is the sanctioned justification for those changes.
Items 1–3, 11, 12 (new scripts/tests/docs) need no protected-path approval.

---

## Consequences

- The `fix:feat` ratio should fall back toward parity as orchestration bugs become
  unit-test failures caught locally rather than CI round-trips.
- The orchestration scripts double as the extraction seed for a future "portable
  autonomous SWE org framework" that NEXUS only describes.
- Every documented gate must fire. Dead gates are a correctness bug for agent operators.
