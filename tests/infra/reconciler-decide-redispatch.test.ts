// Tests for scripts/reconciler/decide-redispatch-action.sh
// Extracted from the "Re-dispatch agent-work issues with no open PR" step of
// agent-reconciler.yml.
// All inputs are positional args; no network, no files — nothing to stub.
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/reconciler/decide-redispatch-action.sh",
);

/**
 * Run the script with the given positional args.
 * Returns the trimmed stdout string.
 */
function decide(
  has_open_pr: 0 | 1,
  seconds_since_last_activity: number | "",
  redispatch_count: number,
): string {
  return execFileSync(
    "bash",
    [
      script,
      String(has_open_pr),
      String(seconds_since_last_activity),
      String(redispatch_count),
    ],
    { encoding: "utf8" },
  ).trim();
}

/** Run the script and return its exit code. */
function decideExit(args: string[]): number {
  const result = spawnSync("bash", [script, ...args], { encoding: "utf8" });
  return result.status ?? 1;
}

describe("reconciler decide-redispatch-action", () => {
  // ── Priority 1: skip-has-pr when open PR exists ───────────────────────────

  it("skips when has_open_pr is 1", () => {
    expect(decide(1, 600, 0)).toBe("skip-has-pr");
  });

  it("skips even when redispatch_count >= 3 if PR exists", () => {
    expect(decide(1, 9999, 5)).toBe("skip-has-pr");
  });

  // ── Priority 2: skip-recent when last activity < 900 seconds ago ──────────

  it("skips as recent when seconds < 900", () => {
    expect(decide(0, 100, 0)).toBe("skip-recent");
  });

  it("skips as recent when seconds is exactly 0", () => {
    expect(decide(0, 0, 0)).toBe("skip-recent");
  });

  it("skips as recent when seconds is 899", () => {
    expect(decide(0, 899, 0)).toBe("skip-recent");
  });

  it("does NOT skip-recent when seconds is exactly 900", () => {
    // 900 seconds is the boundary: >= 900 means NOT recent
    expect(decide(0, 900, 0)).not.toBe("skip-recent");
  });

  it("does NOT skip-recent when seconds is > 900", () => {
    expect(decide(0, 1200, 0)).not.toBe("skip-recent");
  });

  // ── Priority 3: escalate when redispatch_count >= 3 ──────────────────────

  it("escalates when count is exactly 3 and not recent", () => {
    expect(decide(0, 9999, 3)).toBe("escalate");
  });

  it("escalates when count is > 3 and not recent", () => {
    expect(decide(0, 9999, 7)).toBe("escalate");
  });

  // ── Priority 4: redispatch — the default ─────────────────────────────────

  it("redispatches when no PR, not recent, and count < 3", () => {
    expect(decide(0, 9999, 0)).toBe("redispatch");
  });

  it("redispatches when no PR, not recent, count = 2", () => {
    expect(decide(0, 9999, 2)).toBe("redispatch");
  });

  it("redispatches when no PR, never touched (empty seconds), and count < 3", () => {
    expect(decide(0, "", 0)).toBe("redispatch");
  });

  it("redispatches when no PR, never touched, count = 2", () => {
    expect(decide(0, "", 2)).toBe("redispatch");
  });

  // ── Usage error: exit 2 on wrong arg count ────────────────────────────────

  it("exits 2 when no arguments are provided", () => {
    expect(decideExit([])).toBe(2);
  });

  it("exits 2 when too few arguments are provided", () => {
    expect(decideExit(["0", "9999"])).toBe(2);
  });

  it("exits 2 when too many arguments are provided", () => {
    expect(decideExit(["0", "9999", "0", "extra"])).toBe(2);
  });
});
