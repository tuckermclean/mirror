// Tests for scripts/reconciler/decide-conflict-action.sh
// Extracted from the "Flag merge conflicts" step of agent-reconciler.yml.
// All inputs are positional args; no network, no files — nothing to stub.
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/reconciler/decide-conflict-action.sh",
);

/**
 * Run the script with the given positional args.
 * Returns the trimmed stdout string.
 */
function decide(mergeable: string, already_needs_human: number): string {
  return execFileSync(
    "bash",
    [script, mergeable, String(already_needs_human)],
    { encoding: "utf8" },
  ).trim();
}

/** Run the script and return its exit code. */
function decideExit(args: string[]): number {
  const result = spawnSync("bash", [script, ...args], { encoding: "utf8" });
  return result.status ?? 1;
}

describe("reconciler decide-conflict-action", () => {
  // ── Escalate path: CONFLICTING + not yet labeled ──────────────────────────

  it("escalates when mergeable is CONFLICTING and not yet labeled", () => {
    expect(decide("CONFLICTING", 0)).toBe("escalate");
  });

  // ── Skip path: not conflicting ────────────────────────────────────────────

  it("skips when mergeable is MERGEABLE", () => {
    expect(decide("MERGEABLE", 0)).toBe("skip");
  });

  it("skips when mergeable is UNKNOWN", () => {
    expect(decide("UNKNOWN", 0)).toBe("skip");
  });

  it("skips when mergeable is an empty string", () => {
    expect(decide("", 0)).toBe("skip");
  });

  // ── Skip path: CONFLICTING but already labeled ────────────────────────────

  it("skips when CONFLICTING but already has needs-human label (count = 1)", () => {
    expect(decide("CONFLICTING", 1)).toBe("skip");
  });

  it("skips when CONFLICTING but already has needs-human label (count > 1)", () => {
    expect(decide("CONFLICTING", 5)).toBe("skip");
  });

  // ── Usage error: exit 2 on wrong arg count ────────────────────────────────

  it("exits 2 when no arguments are provided", () => {
    expect(decideExit([])).toBe(2);
  });

  it("exits 2 when only one argument is provided", () => {
    expect(decideExit(["CONFLICTING"])).toBe(2);
  });

  it("exits 2 when too many arguments are provided", () => {
    expect(decideExit(["CONFLICTING", "0", "extra"])).toBe(2);
  });
});
