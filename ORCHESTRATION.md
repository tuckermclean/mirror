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
                       │  • opens DRAFT PR (Closes #N)             │
                       │  • commits after each step                │
                       │  • runs make typecheck && make lint       │
                       │  • adds converge label, calls gh pr ready │
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
| `converge` | "Ready to converge" — triggers the loop. Added only at `gh pr ready` time, never at draft creation | `implementation-contract.md` / `orchestrator-contract.md` |
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

## Gate-Keeper Map

Every transition in the state machine has a named gate-keeper responsible for the pass/fail
decision. Gates are not aspirational — if a gate is listed here it must actually fire.

| Transition | Gate | Gate-Keeper | Evidence Required |
|---|---|---|---|
| Issue → Dispatch | Route gate | `receptionist-dispatcher.md` (Haiku, ≤5 turns) | `.dispatch.json` written; routing comment posted |
| Dispatch → Implementation | Tooling gate | `make typecheck && make lint` in implementation contract | Zero TS errors; zero lint warnings |
| Implementation → Converge | PR gate | `implementation-contract.md` | Draft PR → `gh pr ready`; exit sentinel ✅/⏸ posted |
| Converge R1/R2 → Fix | Review gate | `engineering-code-reviewer.md` + `converge-orchestrator.md` | `.converge-verdict.json` written; 🔴/🟡/💭 counts in comment footer |
| Converge → Approve | CI gate | `ci.yml` (6 blocking checks) | Type Check + Lint + Integration + Docker + Helm Lint + Helm Kubeconform all green |
| Approve → Human merge | Final gate | Human (Tucker) | PR labeled `agent:ready`; human reviews and merges |
| Any → needs-human | Escalation gate | `pr-converge.yml` / `agent-reconciler.yml` | One of the 4 legitimate triggers; typed escalation reason in comment |

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

## Pipeline Status

Run `scripts/status/pipeline-status.sh <repo>` at any time to get a live health snapshot:

```bash
bash scripts/status/pipeline-status.sh msitarzewski/mirror
```

Output (markdown, to stdout):
```
## Mirror Pipeline Status
| Label | Count |
|-------|-------|
| 🔨 agent:implementing | 2 |
| 🔄 converge | 1 |
| ✅ agent:ready | 3 |
| ⚠️ needs-human | 0 |

Stale drafts (>20 min, no CI): 0
Pipeline health: ON_TRACK
```

Health logic: `BLOCKED` if `needs-human > 0`; `AT_RISK` if `converge + implementing ≥ 5`; `ON_TRACK` otherwise.

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

---

## Orchestration Scripts Reference

| Script | Purpose | Inputs | Output tokens |
|---|---|---|---|
| `scripts/converge/resolve-blockers.sh` | Resolve effective blocker count from verdict JSON or current-round comment | `<verdict.json> <pr-number>` (env: `CONVERGE_ROUND_STARTED` to scope the comment fallback; `CONVERGE_COMMENT_BODY`/`CONVERGE_COMMENTS_JSON` for tests) | Integer or `unknown` |
| `scripts/converge/decide-round.sh` | Decide converge loop action for one round | Env: `ROUND`, `BLOCKERS`, `CI_GREEN`, `PREV_SIGS`, `CURR_SIGS` | `approve`, `fix`, `escalate:*` |
| `scripts/converge/decide-cap-action.sh` | Bound converge re-dispatch (cap-reached / empty-PR) so a truncated review or empty PR can't thrash | `<redispatch_count> <has_issue_num>` | `redispatch`, `escalate` |
| `scripts/reconciler/decide-stale-action.sh` | Stale draft recovery action | `<redispatch_count> <ci_runs> <has_converge> <failing_count> <has_issue> <has_diff>` | `escalate`, `trigger-ci`, `mark-ready`, `mark-ready-and-converge`, `redispatch`, `needs-human` |
| `scripts/reconciler/decide-conflict-action.sh` | Merge-conflict escalation decision | `<mergeable> <already_needs_human>` | `escalate`, `skip` |
| `scripts/reconciler/decide-rearm-action.sh` | Converge re-arm decision | `<ci_runs> <converge_state> <has_terminal_label> <seconds_since_last_run>` | `trigger-ci`, `skip-in-progress`, `skip-done`, `skip-recent`, `rearm` |
| `scripts/reconciler/decide-redispatch-action.sh` | Orphaned-issue re-dispatch decision | `<has_open_pr> <seconds_since_last_activity> <redispatch_count>` | `skip-has-pr`, `skip-recent`, `escalate`, `redispatch` |
| `scripts/status/pipeline-status.sh` | Live pipeline health snapshot | `<repo>` (env: `PIPELINE_PR_JSON`) | Markdown report to stdout |
| `scripts/git/strip-attribution.sh` | Strip agent attribution from commits | `--install` or used as prepare-commit-msg hook | Exit 0/1 |

All scripts: `set -uo pipefail`, args + exit-2 usage guard, env-injectable for tests, tested in `tests/infra/`.
