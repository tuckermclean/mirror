# Mirror — Orchestration Reference

> The canonical doc for how Mirror's autonomous agent pipeline operates.
> See [ADR-0001](docs/adr/0001-ci-autonomy-strategy-review.md) for strategic context.
> Note: The NEXUS doctrine (`agency-agents` repo) is the conceptual ancestor of this loop
> but is **not** what runs here. Mirror re-implemented a leaner, GitHub-native version.

---

## State Machine

```
                       ┌──────────────────────────────────────────┐
                       │           ISSUE QUEUE                     │
                       │  Any filed issue → label: agent-work      │
                       │  (all .github/ISSUE_TEMPLATE/ carry it)   │
                       └──────────────────┬───────────────────────┘
                                          │ labeled: agent-work
                                          ▼
                       ┌──────────────────────────────────────────┐
                       │           dispatch.yml                    │
                       │  Haiku reads issue → writes .dispatch.json│
                       │  Posts "🪼 Routing to X on model" comment │
                       └──────────────────┬───────────────────────┘
                                          │ execute job
                                          ▼
                       ┌──────────────────────────────────────────┐
                       │         IMPLEMENTATION                    │
                       │  Specialist agent (Sonnet/Opus)           │
                       │  • checks out or creates feat/issue-N-... │
                       │  • opens DRAFT PR (Closes #N, converge)   │
                       │  • commits after each step                │
                       │  • runs make typecheck && make lint       │
                       │  • calls gh pr ready                      │
                       │  label: agent:implementing                │
                       └──────────────────┬───────────────────────┘
                                          │ gh pr ready
                                          ▼
                       ┌──────────────────────────────────────────┐
                       │           pr-converge.yml                 │
                       │  3-round loop: Review → CheckCI → Decide  │
                       │                                           │
                       │  R1: fix 🔴 blockers + 🟡 suggestions     │
                       │  R2: fix 🔴 blockers only                 │
                       │  R3: decide only — no fix step            │
                       │  💭 nits: never fixed → deferred issue     │
                       └──────┬────────────────────────┬──────────┘
                              │ approve                 │ escalate
                              ▼                         ▼
              ┌───────────────────────┐   ┌─────────────────────────┐
              │   label: agent:ready  │   │  label: needs-human      │
              │   Ready for human     │   │  + escalation comment    │
              │   merge               │   │  (typed reason)          │
              └───────────────────────┘   └─────────────────────────┘
```

---

## Label Lifecycle

| Label | Meaning | Set by |
|-------|---------|--------|
| `agent-work` | Issue is queued for dispatch | Issue template / human |
| `agent:implementing` | Draft PR open, agent building | `implementation-contract.md` |
| `converge` | Triggers the convergence loop | `implementation-contract.md` |
| `agent:ready` | Converge approved, CI green | `pr-converge.yml` on approval |
| `needs-human` | Human decision genuinely required | `pr-converge.yml` / `agent-reconciler.yml` |

**Only four legitimate `needs-human` triggers:**
1. Protected-path change (`.github/workflows/`, `ARCHITECTURE.md`, `THREAT_MODEL.md`,
   `COMPLIANCE.md`) — caught by converge's protected-path check.
2. No-progress: same `blocker_signatures` in two consecutive rounds — agent is stuck.
3. Build-failure-cap: reconciler re-dispatched ≥3 times, CI still fails.
4. Merge conflict: branch cannot auto-rebase.

Everything else is auto-recovered by `agent-reconciler.yml`.

---

## Workflow Inventory

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to master, `workflow_dispatch` | Type check, lint, test, build, helm gate |
| `dispatch.yml` | issue labeled `agent-work`; `@claude` comment | Route issue to specialist, execute |
| `pr-converge.yml` | PR `ready_for_review`/labeled `converge`; `workflow_dispatch` | 3-round Dev↔QA loop |
| `agent-reconciler.yml` | `cron: */15`; PR push/open | Self-heal stranded work |
| `review.yml` | PR events (non-`converge` PRs) | Standalone code review |
| `trivial-fix.yml` | PR events | Haiku auto-fixes formatter/typo issues |
| `release.yml` | tag `v*.*.*` | Docker multi-arch + Helm OCI push + staging deploy |

---

## Blocking CI Checks

The following six checks must be green for a PR to converge. These are the gates
the converge loop polls and the reconciler tracks:

1. Type Check
2. Lint
3. Integration Tests
4. Docker Build & Scan
5. Helm Lint
6. Helm Kubeconform

Non-blocking (continue-on-error or secret-gated): Unit Tests, E2E Tests, Trivy, Prompt Evals.

---

## Agent Contracts

The orchestration behavior is defined by three files in `.agents/custom/`:

| File | Governs |
|------|---------|
| `receptionist-dispatcher.md` | Issue-to-agent routing: 24-agent roster, 3-tier model map, 18 keyword rules, turn-budget table |
| `implementation-contract.md` | Durability rules: checkout, draft PR, commit-per-step, `make typecheck && make lint`, `gh pr ready`, exit sentinel |
| `converge-orchestrator.md` | Reviewer + Fixer roles: severity taxonomy (🔴/🟡/💭), round rules, `.converge-verdict.json` schema, `blocker_signatures` stability contract, termination conditions |

---

## Escalation Reasons

The `pr-converge.yml` finalize step writes one of these to `.converge-final-action`:

| Token | Meaning |
|-------|---------|
| `approve` | 0 blockers + CI green — PR approved, label `agent:ready` |
| `escalate:no-progress` | Same `blocker_signatures` two consecutive rounds — fixer stuck |
| `escalate:no-verdict` | Reviewer wrote no machine verdict; comment unparseable |
| `escalate:ci-red` | Blockers cleared but a blocking CI check is not green |
| `escalate:cap-reached` | 3-round cap with blockers remaining — reconciler re-dispatches once |

---

## Reconciler Self-Healing

`agent-reconciler.yml` (`cron: */15`) performs four recovery steps each tick:

1. **Stale draft recovery** — `agent:implementing` drafts whose last dispatch run completed
   >20 min ago are re-dispatched.
2. **Merge conflict flagging** — branches that fail `git merge-base` checks get `needs-human`.
3. **CI re-arm** — Actions-token pushes suppress `synchronize` events; the reconciler
   explicitly re-triggers CI and re-arms the converge loop after each agent push.
4. **Orphan re-dispatch** — `agent-work` issues with no open PR are re-dispatched, capped
   at 3 attempts before escalating to `needs-human`.

---

## Protected Paths

The converge loop short-circuits to `needs-human` (without running review rounds) when a
PR diff touches any of these paths, per `pr-converge.yml` lines 68–80:

- `.github/workflows/**`
- `ARCHITECTURE.md`
- `THREAT_MODEL.md`
- `COMPLIANCE.md`

Changes to these paths require explicit human review and an ADR.

---

## Local Development

```bash
# Full local CI gate (should match ci.yml blocking checks — see ADR-0001 for gap notes)
make ci

# Secrets-free smoke test (standalone boot)
make smoke

# Test orchestration scripts in isolation (the testable-scripts philosophy)
pnpm infra:test
```

The model for orchestration scripts is `scripts/converge/resolve-blockers.sh`:
- Pure bash, `set -uo pipefail`, args + usage/exit-2 guard
- Dependency-injectable via env var (no network required for tests)
- Single clear stdout contract
- Vitest test in `tests/infra/` via `execFileSync("bash", [script, ...])`

Every new orchestration decision should be extracted to a script matching this pattern.
