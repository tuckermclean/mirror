// Tests for scripts/converge/decide-cap-action.sh
// Bounds converge's re-dispatch loop: under the cap and with a closing issue →
// redispatch; otherwise escalate to a human. No network, no files.
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/converge/decide-cap-action.sh",
);

function decide(redispatch_count: number, has_issue_num: 0 | 1): string {
  return execFileSync(
    "bash",
    [script, String(redispatch_count), String(has_issue_num)],
    { encoding: "utf8" },
  ).trim();
}

function decideExit(args: string[]): number {
  return spawnSync("bash", [script, ...args], { encoding: "utf8" }).status ?? 1;
}

describe("converge decide-cap-action", () => {
  // ── Re-dispatch while under the cap and a closing issue exists ────────────
  it("re-dispatches on the first cap-reached with an issue", () => {
    expect(decide(0, 1)).toBe("redispatch");
  });

  it("re-dispatches on the second attempt (still under the cap of 2)", () => {
    expect(decide(1, 1)).toBe("redispatch");
  });

  // ── Escalate once the re-dispatch budget is exhausted ─────────────────────
  it("escalates when the re-dispatch cap (2) is reached", () => {
    expect(decide(2, 1)).toBe("escalate");
  });

  it("escalates when the re-dispatch count is above the cap", () => {
    expect(decide(5, 1)).toBe("escalate");
  });

  // ── No closing issue → a human must take over regardless of count ─────────
  it("escalates when there is no closing issue, even at count 0", () => {
    expect(decide(0, 0)).toBe("escalate");
  });

  it("escalates when there is no closing issue and the cap is hit", () => {
    expect(decide(2, 0)).toBe("escalate");
  });

  // ── Usage errors ──────────────────────────────────────────────────────────
  it("exits 2 when no arguments are provided", () => {
    expect(decideExit([])).toBe(2);
  });

  it("exits 2 when too few arguments are provided", () => {
    expect(decideExit(["0"])).toBe(2);
  });

  it("exits 2 when too many arguments are provided", () => {
    expect(decideExit(["0", "1", "extra"])).toBe(2);
  });
});
