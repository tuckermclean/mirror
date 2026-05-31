# PR Convergence Contract

This document governs the **Reviewer** and **Fixer** roles in the
`pr-converge.yml` orchestrated loop. Both roles MUST obey all rules here,
in addition to their primary agent file and AGENTS.md.

> ⚠️ Do not push new commits to this PR branch while the convergence loop
> is running — it can desync the workspace and produce incorrect review results.

---

## Severity Taxonomy

Every finding MUST carry exactly one severity label:

- **🔴 Blocker** — correctness bugs, security vulnerabilities, failing or
  missing tests, AGENTS.md rule violations (e.g. missing auth check, raw PII
  read, production code without a failing test). Blocks merge.
- **🟡 Suggestion** — real improvements that would meaningfully improve
  maintainability, performance, or correctness but are not regressions.
  Acted on in round 1 only.
- **💭 Nit** — style, cosmetic, preference, minor naming. NEVER fixed
  in-loop. Always deferred to a follow-up issue.

When in doubt, prefer a lower severity. Inflating nits to blockers defeats
the entire point of the severity system.

---

## Round Rules

| Round | What the Fixer addresses      | Notes                        |
|-------|-------------------------------|------------------------------|
| 1     | 🔴 blockers + 🟡 suggestions  | Most thorough pass           |
| 2     | 🔴 blockers only              | Suggestions defer            |
| 3     | 🔴 blockers only              | Last chance; no fix step     |

💭 nits are **never** fixed in-loop under any circumstances.

---

## Reviewer Output Contract

After completing your analysis, you MUST write `.converge-verdict.json` to
`$GITHUB_WORKSPACE`. This is machine-parsed by the orchestrator — do NOT
deviate from the schema.

```json
{
  "blockers":           <integer — count of 🔴 findings>,
  "suggestions":        <integer — count of 🟡 findings>,
  "nits":               ["short one-line description of each nit", ...],
  "blocker_signatures": ["stable-slug-per-blocker", ...]
}
```

`blocker_signatures` are used for **no-progress detection**. They must be
stable across rounds for the same unfixed issue. Use a short, stable slug
that describes the problem, not the location:

- ✅ `missing-auth-check-in-route-handler`
- ✅ `unhandled-rejection-in-upload-action`
- ❌ `line-42-missing-check` (line numbers change)
- ❌ `round-2-blocker-1` (not stable)

Write `.converge-verdict.json` as your LAST action — after the PR comment —
so the orchestrator always reads a completed verdict.

### CI Failures Are Blockers

Before writing the verdict, check the live CI status of the PR:

```bash
gh pr checks $PR_NUMBER --json name,state
```

For each of the **six blocking checks** (Type Check, Lint, Integration Tests,
Docker Build & Scan, Helm Lint, Helm Kubeconform) whose state is NOT
`success`, `skipped`, or `neutral` — that is a **🔴 Blocker**. Fetch the
failure details so the Fixer knows exactly what to change:

```bash
# Get the run ID from the check name, then fetch failing log lines
RUN_ID=$(gh run list --branch <branch> --json databaseId,name,conclusion \
  --jq '.[] | select(.name == "<job-name>" and .conclusion == "failure") | .databaseId' | head -1)
gh run view "$RUN_ID" --log-failed 2>/dev/null | tail -80
```

Record it in the verdict with a **stable signature** `ci-fail:<job-slug>`:

- `ci-fail:type-check`
- `ci-fail:lint`
- `ci-fail:integration-tests`
- `ci-fail:docker-build`
- `ci-fail:helm-lint`
- `ci-fail:helm-kubeconform`

Include the root-cause error message in the PR comment finding so the Fixer
knows what code change is required. A CI failure you noticed but left out of the
verdict is a contract violation.

### Review Comment

Post (or update) a PR comment with all findings:

```bash
# Round 1 — post new comment:
gh pr comment $PR_NUMBER --body "..."

# Rounds 2+ — edit the previous one:
gh pr comment $PR_NUMBER --edit-last --body "..."
```

Format the comment with:
- A round indicator: `🔄 Round N of 3`
- Findings grouped by 🔴 / 🟡 / 💭, each with file:line citation
- A totals line: `🔴 N blockers | 🟡 N suggestions | 💭 N nits`
- For rounds 2+: note which round-1 items were fixed vs. still open

**DELIVERABLE** — post an initial "🔄 Round N in progress…" comment FIRST,
then rewrite it with `--edit-last` as you find issues, so a partial review
is still useful if you run out of turns.

---

## Fixer Contract

- Read `.converge-verdict.json` to understand what to address.
- Fix ONLY what the current round's rules allow (see Round Rules table).
- Do **not** touch 💭 nits. Do not opportunistically refactor adjacent code.
- Follow AGENTS.md TDD exactly: Red → Green → Refactor, one commit per step.
- Commit and push after each logical fix (not one giant commit at the end).
- Run `pnpm typecheck && pnpm lint && pnpm test:unit` before the final push.
  Report results honestly. If a check is red, say so and explain why.
- Do NOT claim "all checks green" unless you personally verified it.

---

## Termination (Orchestrator's logic — not agents)

The workflow stops when the first of these is true:

1. **Converged** — `blockers == 0` AND all blocking CI checks are green.
   → Approve the PR.
2. **No progress** — the same `blocker_signatures` appear in two consecutive
   rounds (fixer is stuck). → Label `needs-human`, escalate.
3. **Cap hit** — round 3 review completed. → Label `needs-human`, escalate.

---

## Deferral

On convergence or stop, all collected 💭 nits (and any 🟡 suggestions
not addressed by round 2+) are opened as a single follow-up GitHub issue:

> **Deferred polish from PR #N**

Labeled `agent-work` so it enters the normal dispatch queue. The issue body
lists each deferred item. The final PR comment cross-links it.
Deferred ≠ dropped — it is tracked and will be addressed, just not blocking
this merge.
