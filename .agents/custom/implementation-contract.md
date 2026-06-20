# Implementation Contract

Rules every agent MUST follow when handling `implement`, `fix`, `design`, or `setup` tasks.
This file is versioned under `.agents/custom/` and can be updated without touching
`.github/workflows/` (which requires human approval).

---

## Durability — your work must survive running out of turns

Do this in order:

1. **If EXISTING BRANCH is set:** check it out and push additional work there. Do NOT open a new PR.

2. **If no existing branch:** create a new branch (`feat/<slug>`, `fix/<slug>`, `refactor/<slug>`, `docs/<slug>`, `chore/<slug>`, `test/<slug>`, or `design/<slug>` from `master`),
   make your **first commit as early as possible** (even a stub/scaffold), then **immediately**
   open a DRAFT PR whose description includes `Closes #<ISSUE NUMBER>`. Do **not** add the
   `converge` label yet — that label means "ready to converge" and you add it only at step 5
   once the work is complete:
   ```
   gh pr create --draft --base master --head <branch> --title "<title>" \
     --body "Closes #<ISSUE NUMBER>\n\n🚧 In progress."
   ```
   `<ISSUE NUMBER>` is the **issue you were dispatched on**. The PR body MUST keep
   `Closes #<ISSUE NUMBER>` — if that issue references *other* issues, also `Closes`
   them, but never drop the dispatched one. It is the only link the reconciler uses
   to know this work has a PR; omitting it gets the issue re-dispatched forever.

3. **Commit and `git push` after EACH meaningful step** — never batch all work into one final
   commit. Incremental pushes mean a turn/timeout cutoff still leaves your progress visible.

4. **Post a brief status comment early**, then keep it updated:
   ```
   gh issue comment <ISSUE NUMBER> --body "🚧 Started on branch <branch>, draft PR #<n> open."
   ```

5. **When the task is genuinely complete:**
   BEFORE calling `gh pr ready`, you MUST:
   1. Run `make typecheck` — fix ALL errors first. No type errors allowed.
   2. Run `make lint` — fix ALL errors/warnings first.
   3. Confirm both pass cleanly, then mark the PR ready:
      ```
      gh pr edit <n> --add-label converge
      gh pr ready <n>
      ```
   If you are running low on turns: leave the PR as a draft. The reconciler
   will detect it and re-dispatch. Do NOT spend your last turns polishing prose.

---

## Exit requirement (non-negotiable)

Before you exit for **any** reason — task complete, turn-limited, or blocked —
post a status comment on the issue or PR:

```
gh pr comment <n> --body "✅ Complete: <summary>"           # if done (or gh issue comment if no PR yet)
gh pr comment <n> --body "⏸ Paused at turn limit: completed <X>, remaining: <Y>"  # if not done (or gh issue comment if no PR yet)
```

A silent exit is a state machine violation. The reconciler uses this comment to detect
whether you finished or were cut off mid-task.

---

## For review / explain / plan tasks

- Post your response as a comment on the issue/PR FIRST (`gh issue comment`), then refine it.
- Do NOT create branches or PRs for these task types.

---

## Honest reporting — before posting any success/summary comment

- Run the project's own checks locally where possible (see `AGENTS.md`):
  `make typecheck`, `make lint`, `make test-unit`
  (and `make test-integration` if `DATABASE_URL` is set).
  Report each result factually.
- Then run `gh pr checks <PR NUMBER>` to see the PR's REAL CI status.
- Only mark a check ✅ if you actually verified it. If CI is still running, say so.
  If a check is failing, report it and state whether YOUR change caused it or it is
  a known pre-existing / non-blocking failure (e.g. the E2E job is non-blocking and
  red until Clerk/Anthropic secrets are set).
- **NEVER** claim "all acceptance criteria verified" or post an all-green summary while
  any check you did not personally verify is red.
