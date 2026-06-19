// Tests for scripts/reconciler/decide-stale-action.sh
// Extracted from the "Recover stale agent:implementing PRs" step of agent-reconciler.yml.
// All inputs are positional args; no network, no files — nothing to stub.
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/reconciler/decide-stale-action.sh",
);

/**
 * Run the script with the given positional args.
 * Returns the trimmed stdout string.
 *
 * `has_diff` defaults to 1 (PR contains work) so the historical 5-arg call
 * sites keep their original meaning — only the new empty-PR cases pass 0.
 */
function decide(
  redispatch_count: number,
  ci_runs: number,
  has_converge: 0 | 1,
  failing_count: number,
  has_issue_num: 0 | 1,
  has_diff: 0 | 1 = 1,
): string {
  return execFileSync(
    "bash",
    [
      script,
      String(redispatch_count),
      String(ci_runs),
      String(has_converge),
      String(failing_count),
      String(has_issue_num),
      String(has_diff),
    ],
    { encoding: "utf8" },
  ).trim();
}

/** Run the script and return its exit code. */
function decideExit(args: string[]): number {
  const result = spawnSync("bash", [script, ...args], { encoding: "utf8" });
  return result.status ?? 1;
}

describe("reconciler decide-stale-action", () => {
  // ── Priority 1: escalate when redispatch_count >= 3 ───────────────────────

  it("escalates when redispatch_count is exactly 3", () => {
    expect(decide(3, 5, 0, 2, 1)).toBe("escalate");
  });

  it("escalates when redispatch_count is greater than 3", () => {
    expect(decide(5, 5, 0, 2, 1)).toBe("escalate");
  });

  it("does not escalate when redispatch_count is 2", () => {
    // With ci_runs>0, has_converge=0, failing>0, has_issue=1 → should redispatch
    expect(decide(2, 5, 0, 2, 1)).toBe("redispatch");
  });

  // ── Priority 2: trigger-ci when ci_runs == 0 ─────────────────────────────

  it("triggers CI when ci_runs is 0 and count < 3", () => {
    expect(decide(0, 0, 0, 0, 1)).toBe("trigger-ci");
  });

  it("triggers CI when ci_runs is 0 regardless of other inputs (except escalate)", () => {
    expect(decide(1, 0, 1, 3, 0)).toBe("trigger-ci");
  });

  // ── Priority 3: mark-ready when has_converge == 1 ────────────────────────

  it("marks ready when converge label present and CI has run", () => {
    expect(decide(0, 5, 1, 2, 1)).toBe("mark-ready");
  });

  it("marks ready when converge label present, ignoring failing count", () => {
    expect(decide(2, 3, 1, 10, 0)).toBe("mark-ready");
  });

  // ── Priority 4: mark-ready-and-converge when failing == 0, no converge label

  it("marks ready and adds converge when CI green and no converge label", () => {
    expect(decide(0, 5, 0, 0, 1)).toBe("mark-ready-and-converge");
  });

  it("marks ready and adds converge even without an issue number when CI green", () => {
    expect(decide(0, 5, 0, 0, 0)).toBe("mark-ready-and-converge");
  });

  // ── Priority 5: redispatch when failing > 0, no converge, has issue ───────

  it("redispatches when CI failing and issue number is available", () => {
    expect(decide(0, 5, 0, 3, 1)).toBe("redispatch");
  });

  it("redispatches when redispatch_count is 1 and CI failing with issue", () => {
    expect(decide(1, 5, 0, 1, 1)).toBe("redispatch");
  });

  // ── Priority 6: needs-human when failing > 0, no converge, no issue ──────

  it("needs-human when CI failing and no issue number to re-dispatch to", () => {
    expect(decide(0, 5, 0, 3, 0)).toBe("needs-human");
  });

  it("needs-human when redispatch_count is 2 and no issue number", () => {
    expect(decide(2, 5, 0, 1, 0)).toBe("needs-human");
  });

  // ── Empty PR guard: a no-diff draft PR is NOT "finished" ─────────────────
  // The converge label is added at draft-PR creation, so its presence does not
  // mean the agent did any work. An empty PR (has_diff=0) must resume the work,
  // never get marked ready for an empty converge.

  it("redispatches an empty PR even when it carries the converge label", () => {
    // Was previously mark-ready (Priority 3) — the bug that approved empty PRs.
    expect(decide(0, 5, 1, 0, 1, 0)).toBe("redispatch");
  });

  it("redispatches an empty PR with no converge label and CI green", () => {
    // Without the guard this was mark-ready-and-converge (Priority 4).
    expect(decide(0, 5, 0, 0, 1, 0)).toBe("redispatch");
  });

  it("needs-human for an empty PR when no issue number is available", () => {
    expect(decide(0, 5, 1, 0, 0, 0)).toBe("needs-human");
  });

  it("still marks a NON-empty converge PR ready (regression guard)", () => {
    expect(decide(0, 5, 1, 0, 1, 1)).toBe("mark-ready");
  });

  it("escalate still wins over the empty-PR guard at the redispatch cap", () => {
    expect(decide(3, 5, 1, 0, 1, 0)).toBe("escalate");
  });

  it("trigger-ci still wins over the empty-PR guard when CI never ran", () => {
    expect(decide(0, 0, 1, 0, 1, 0)).toBe("trigger-ci");
  });

  // ── Usage error: exit 2 on wrong arg count ────────────────────────────────

  it("exits 2 when no arguments are provided", () => {
    expect(decideExit([])).toBe(2);
  });

  it("exits 2 when too few arguments are provided", () => {
    expect(decideExit(["3", "5", "0"])).toBe(2);
  });

  it("exits 2 when too many arguments are provided", () => {
    expect(decideExit(["0", "5", "0", "0", "1", "1", "extra"])).toBe(2);
  });
});
