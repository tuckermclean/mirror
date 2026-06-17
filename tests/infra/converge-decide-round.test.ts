// Tests for scripts/converge/decide-round.sh — the convergence-loop round decision.
// Extracted from the triple copy-pasted R1/R2/R3 "Decide" blocks in pr-converge.yml.
// All inputs are env vars; no network, no files — nothing to stub.
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/converge/decide-round.sh",
);

interface DecideInput {
  ROUND: string;
  BLOCKERS: string;
  CI_GREEN: string;
  PREV_SIGS?: string;
  CURR_SIGS?: string;
}

function decide(input: DecideInput): string {
  return execFileSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      ROUND: input.ROUND,
      BLOCKERS: input.BLOCKERS,
      CI_GREEN: input.CI_GREEN,
      PREV_SIGS: input.PREV_SIGS ?? "[]",
      CURR_SIGS: input.CURR_SIGS ?? "[]",
    },
  }).trim();
}

function decideExit(input: DecideInput): number {
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      ROUND: input.ROUND ?? "",
      BLOCKERS: input.BLOCKERS ?? "",
      CI_GREEN: input.CI_GREEN ?? "",
      PREV_SIGS: input.PREV_SIGS ?? "[]",
      CURR_SIGS: input.CURR_SIGS ?? "[]",
    },
  });
  return result.status ?? 1;
}

describe("converge decide-round", () => {
  // ── Approve path ─────────────────────────────────────────────────────────

  it("approves at R1 when blockers=0 and CI green", () => {
    expect(decide({ ROUND: "1", BLOCKERS: "0", CI_GREEN: "true" })).toBe("approve");
  });

  it("approves at R2 when blockers=0 and CI green", () => {
    expect(decide({ ROUND: "2", BLOCKERS: "0", CI_GREEN: "true" })).toBe("approve");
  });

  it("approves at R3 when blockers=0 and CI green", () => {
    expect(decide({ ROUND: "3", BLOCKERS: "0", CI_GREEN: "true" })).toBe("approve");
  });

  // ── Fix path (rounds 1 and 2) ─────────────────────────────────────────────

  it("returns fix at R1 when blockers remain", () => {
    expect(
      decide({ ROUND: "1", BLOCKERS: "2", CI_GREEN: "false", CURR_SIGS: '["missing-auth"]' }),
    ).toBe("fix");
  });

  it("returns fix at R1 when CI is red but no blockers (CI red = implicit blocker)", () => {
    expect(decide({ ROUND: "1", BLOCKERS: "0", CI_GREEN: "false" })).toBe("fix");
  });

  it("returns fix at R1 when blockers=unknown (unknown bypasses integer check, never approves)", () => {
    expect(decide({ ROUND: "1", BLOCKERS: "unknown", CI_GREEN: "false" })).toBe("fix");
  });

  it("returns fix at R2 when blockers=unknown (no-progress guard excludes unknown)", () => {
    expect(
      decide({
        ROUND: "2",
        BLOCKERS: "unknown",
        CI_GREEN: "false",
        PREV_SIGS: '["some-sig"]',
        CURR_SIGS: '["some-sig"]',
      }),
    ).toBe("fix");
  });

  it("returns fix at R2 when blockers differ from R1 (progress detected)", () => {
    expect(
      decide({
        ROUND: "2",
        BLOCKERS: "1",
        CI_GREEN: "false",
        PREV_SIGS: '["blocker-a","blocker-b"]',
        CURR_SIGS: '["blocker-b"]',
      }),
    ).toBe("fix");
  });

  // ── No-progress escalation ────────────────────────────────────────────────

  it("escalates no-progress at R2 when blocker signatures unchanged", () => {
    expect(
      decide({
        ROUND: "2",
        BLOCKERS: "1",
        CI_GREEN: "false",
        PREV_SIGS: '["missing-auth-check"]',
        CURR_SIGS: '["missing-auth-check"]',
      }),
    ).toBe("escalate:no-progress");
  });

  it("escalates no-progress at R3 when signatures unchanged from R2", () => {
    expect(
      decide({
        ROUND: "3",
        BLOCKERS: "2",
        CI_GREEN: "false",
        PREV_SIGS: '["unhandled-rejection","pii-read-direct"]',
        CURR_SIGS: '["unhandled-rejection","pii-read-direct"]',
      }),
    ).toBe("escalate:no-progress");
  });

  it("does NOT escalate no-progress when blockers=0 (already approved above)", () => {
    // When BLOCKERS=0 and CI_GREEN=true the approve path fires first.
    // This covers the guard condition in no-progress detection.
    expect(
      decide({
        ROUND: "2",
        BLOCKERS: "0",
        CI_GREEN: "true",
        PREV_SIGS: "[]",
        CURR_SIGS: "[]",
      }),
    ).toBe("approve");
  });

  // ── R3 terminal escalations ───────────────────────────────────────────────

  it("escalates no-verdict at R3 when blockers=unknown", () => {
    expect(
      decide({ ROUND: "3", BLOCKERS: "unknown", CI_GREEN: "false" }),
    ).toBe("escalate:no-verdict");
  });

  it("escalates ci-red at R3 when blockers=0 but CI not green", () => {
    expect(
      decide({
        ROUND: "3",
        BLOCKERS: "0",
        CI_GREEN: "false",
        PREV_SIGS: "[]",
        CURR_SIGS: "[]",
      }),
    ).toBe("escalate:ci-red");
  });

  it("escalates cap-reached at R3 when blockers remain and sigs differ", () => {
    expect(
      decide({
        ROUND: "3",
        BLOCKERS: "3",
        CI_GREEN: "false",
        PREV_SIGS: '["blocker-a"]',
        CURR_SIGS: '["blocker-b"]',
      }),
    ).toBe("escalate:cap-reached");
  });

  // ── Usage errors ──────────────────────────────────────────────────────────

  it("exits 2 when ROUND is missing", () => {
    expect(
      decideExit({ ROUND: "", BLOCKERS: "1", CI_GREEN: "false" }),
    ).toBe(2);
  });

  it("exits 2 when ROUND is invalid", () => {
    expect(
      decideExit({ ROUND: "4", BLOCKERS: "1", CI_GREEN: "false" }),
    ).toBe(2);
  });

  it("exits 2 when CI_GREEN is not true/false", () => {
    expect(
      decideExit({ ROUND: "1", BLOCKERS: "1", CI_GREEN: "yes" }),
    ).toBe(2);
  });

  it("exits 2 when BLOCKERS is not an integer or 'unknown'", () => {
    expect(
      decideExit({ ROUND: "1", BLOCKERS: "foo", CI_GREEN: "true" }),
    ).toBe(2);
  });

  it("exits 2 when BLOCKERS starts with a digit but is not a pure integer", () => {
    expect(
      decideExit({ ROUND: "1", BLOCKERS: "1foo", CI_GREEN: "true" }),
    ).toBe(2);
  });

  // ── Empty-signature false-positive guard ──────────────────────────────────
  // When reviewers omit blocker_signatures entirely both arrays default to [].
  // Two rounds of [] != "same signatures" — it means the reviewer didn't emit
  // signatures, not that the fixer is stuck.  Must return "fix", not "escalate".

  it("returns fix at R2 when both sig arrays are empty (reviewer omitted signatures)", () => {
    expect(
      decide({
        ROUND: "2",
        BLOCKERS: "2",
        CI_GREEN: "false",
        PREV_SIGS: "[]",
        CURR_SIGS: "[]",
      }),
    ).toBe("fix");
  });

  it("still escalates no-progress at R2 when both arrays are non-empty and equal", () => {
    expect(
      decide({
        ROUND: "2",
        BLOCKERS: "1",
        CI_GREEN: "false",
        PREV_SIGS: '["missing-auth-check"]',
        CURR_SIGS: '["missing-auth-check"]',
      }),
    ).toBe("escalate:no-progress");
  });

  // ── Sentinel false-positive guard ─────────────────────────────────────────
  // Each round seeds the verdict file with the init sentinel
  // ["verdict-file-not-written"].  When a reviewer step fails or no-ops and
  // never overwrites it, the saved verdict keeps the sentinel.  Two such rounds
  // are NOT evidence the fixer is stuck — the reviewer wrote no verdict.  The
  // sentinel must be treated like [], never as a repeated real blocker signature.

  it("returns fix at R2 when both arrays are the init sentinel (no verdict written twice)", () => {
    expect(
      decide({
        ROUND: "2",
        BLOCKERS: "1",
        CI_GREEN: "false",
        PREV_SIGS: '["verdict-file-not-written"]',
        CURR_SIGS: '["verdict-file-not-written"]',
      }),
    ).toBe("fix");
  });

  it("returns fix at R2 when prev is sentinel and curr is a real signature", () => {
    expect(
      decide({
        ROUND: "2",
        BLOCKERS: "1",
        CI_GREEN: "false",
        PREV_SIGS: '["verdict-file-not-written"]',
        CURR_SIGS: '["missing-auth-check"]',
      }),
    ).toBe("fix");
  });

  it("returns fix at R2 when prev is a real signature and curr is the sentinel", () => {
    expect(
      decide({
        ROUND: "2",
        BLOCKERS: "1",
        CI_GREEN: "false",
        PREV_SIGS: '["missing-auth-check"]',
        CURR_SIGS: '["verdict-file-not-written"]',
      }),
    ).toBe("fix");
  });

  it("escalates no-verdict at R3 when both arrays are the sentinel and blockers unknown", () => {
    expect(
      decide({
        ROUND: "3",
        BLOCKERS: "unknown",
        CI_GREEN: "false",
        PREV_SIGS: '["verdict-file-not-written"]',
        CURR_SIGS: '["verdict-file-not-written"]',
      }),
    ).toBe("escalate:no-verdict");
  });

  it("escalates cap-reached at R3 when both arrays are the sentinel but blockers remain", () => {
    expect(
      decide({
        ROUND: "3",
        BLOCKERS: "1",
        CI_GREEN: "false",
        PREV_SIGS: '["verdict-file-not-written"]',
        CURR_SIGS: '["verdict-file-not-written"]',
      }),
    ).toBe("escalate:cap-reached");
  });
});
