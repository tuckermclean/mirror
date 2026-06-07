// Tests for scripts/reconciler/decide-rearm-action.sh
// Extracted from the "Trigger CI / re-arm converge on non-draft converge PRs"
// step of agent-reconciler.yml.
// All inputs are positional args; no network, no files — nothing to stub.
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/reconciler/decide-rearm-action.sh",
);

/**
 * Run the script with the given positional args.
 * Returns the trimmed stdout string.
 */
function decide(
  ci_runs: number,
  converge_state: string,
  has_terminal_label: 0 | 1,
  seconds_since_last_run: number | "",
): string {
  return execFileSync(
    "bash",
    [
      script,
      String(ci_runs),
      converge_state,
      String(has_terminal_label),
      String(seconds_since_last_run),
    ],
    { encoding: "utf8" },
  ).trim();
}

/** Run the script and return its exit code. */
function decideExit(args: string[]): number {
  const result = spawnSync("bash", [script, ...args], { encoding: "utf8" });
  return result.status ?? 1;
}

describe("reconciler decide-rearm-action", () => {
  // ── Priority 1: trigger-ci when ci_runs == 0 ─────────────────────────────

  it("triggers CI when ci_runs is 0", () => {
    expect(decide(0, "none:none", 0, "")).toBe("trigger-ci");
  });

  it("triggers CI when ci_runs is 0 regardless of converge state", () => {
    expect(decide(0, "completed:success", 1, 600)).toBe("trigger-ci");
  });

  // ── Priority 2: skip-in-progress when converge is running ─────────────────

  it("skips when converge is in_progress", () => {
    expect(decide(5, "in_progress:", 0, "")).toBe("skip-in-progress");
  });

  // ── Priority 3: skip-done when completed:success + terminal label ──────────

  it("skips as done when converge completed:success and PR has terminal label", () => {
    expect(decide(5, "completed:success", 1, 600)).toBe("skip-done");
  });

  it("skips as done regardless of seconds when terminal label is set", () => {
    expect(decide(5, "completed:success", 1, 50)).toBe("skip-done");
  });

  // ── Priority 4: skip-recent when finished < 300 seconds ago ───────────────

  it("skips as recent when completed:success, no terminal label, and seconds < 300", () => {
    expect(decide(5, "completed:success", 0, 100)).toBe("skip-recent");
  });

  it("skips as recent when seconds is exactly 0", () => {
    expect(decide(5, "completed:success", 0, 0)).toBe("skip-recent");
  });

  it("skips as recent when seconds is 299", () => {
    expect(decide(5, "completed:success", 0, 299)).toBe("skip-recent");
  });

  // ── Priority 5: rearm in all remaining cases ──────────────────────────────

  it("rearms when completed:success, no terminal label, and seconds >= 300", () => {
    expect(decide(5, "completed:success", 0, 300)).toBe("rearm");
  });

  it("rearms when completed:success, no terminal label, and seconds >> 300", () => {
    expect(decide(5, "completed:success", 0, 9000)).toBe("rearm");
  });

  it("rearms when converge state is none:none (never ran)", () => {
    expect(decide(5, "none:none", 0, "")).toBe("rearm");
  });

  it("rearms when completed:success, no terminal label, and no prior time (empty string)", () => {
    expect(decide(5, "completed:success", 0, "")).toBe("rearm");
  });

  it("rearms when converge state is completed:failure (not in-progress, not success)", () => {
    expect(decide(5, "completed:failure", 0, "")).toBe("rearm");
  });

  // ── Usage error: exit 2 on wrong arg count ────────────────────────────────

  it("exits 2 when no arguments are provided", () => {
    expect(decideExit([])).toBe(2);
  });

  it("exits 2 when too few arguments are provided", () => {
    expect(decideExit(["5", "none:none", "0"])).toBe(2);
  });

  it("exits 2 when too many arguments are provided", () => {
    expect(decideExit(["5", "none:none", "0", "", "extra"])).toBe(2);
  });
});
