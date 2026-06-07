// Tests for scripts/dispatch/decide-entry.sh
// Determines model, max_turns, and contract path based on the GitHub event name.
// Pure positional-arg script; no network, no files — nothing to stub.
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/dispatch/decide-entry.sh",
);

interface EntryDecision {
  model: string;
  max_turns: number;
  contract: string;
}

/**
 * Run the script with the given event name.
 * Returns parsed KEY=VALUE output as a structured object.
 */
function decide(event_name: string): EntryDecision {
  const out = execFileSync("bash", [script, event_name], {
    encoding: "utf8",
  }).trim();

  const parsed: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const eq = line.indexOf("=");
    if (eq !== -1) {
      parsed[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }

  return {
    model: parsed["model"] ?? "",
    max_turns: Number(parsed["max_turns"] ?? "0"),
    contract: parsed["contract"] ?? "",
  };
}

/** Run the script and return its exit code (non-throwing). */
function decideExit(event_name: string): number {
  const result = spawnSync("bash", [script, event_name], { encoding: "utf8" });
  return result.status ?? 1;
}

// ---------------------------------------------------------------------------
// Issues — always Opus orchestrator at full budget
// ---------------------------------------------------------------------------

describe("issues event", () => {
  it("routes to opus", () => {
    const r = decide("issues");
    expect(r.model).toBe("claude-opus-4-8");
  });

  it("sets max_turns to 60", () => {
    const r = decide("issues");
    expect(r.max_turns).toBe(60);
  });

  it("loads orchestrator-contract", () => {
    const r = decide("issues");
    expect(r.contract).toBe(".agents/custom/orchestrator-contract.md");
  });
});

// ---------------------------------------------------------------------------
// issue_comment — same orchestrator, Sonnet budget
// ---------------------------------------------------------------------------

describe("issue_comment event", () => {
  it("routes to sonnet", () => {
    const r = decide("issue_comment");
    expect(r.model).toBe("claude-sonnet-4-6");
  });

  it("sets max_turns to 40", () => {
    const r = decide("issue_comment");
    expect(r.max_turns).toBe(40);
  });

  it("loads orchestrator-contract", () => {
    const r = decide("issue_comment");
    expect(r.contract).toBe(".agents/custom/orchestrator-contract.md");
  });
});

// ---------------------------------------------------------------------------
// pull_request_review_comment — same as issue_comment
// ---------------------------------------------------------------------------

describe("pull_request_review_comment event", () => {
  it("routes to sonnet", () => {
    const r = decide("pull_request_review_comment");
    expect(r.model).toBe("claude-sonnet-4-6");
  });

  it("sets max_turns to 40", () => {
    const r = decide("pull_request_review_comment");
    expect(r.max_turns).toBe(40);
  });

  it("loads orchestrator-contract", () => {
    const r = decide("pull_request_review_comment");
    expect(r.contract).toBe(".agents/custom/orchestrator-contract.md");
  });
});

// ---------------------------------------------------------------------------
// Unknown event — safe default (Sonnet, 40, orchestrator-contract)
// ---------------------------------------------------------------------------

describe("unknown / empty event", () => {
  it("defaults to sonnet for unknown event", () => {
    const r = decide("something_unknown");
    expect(r.model).toBe("claude-sonnet-4-6");
  });

  it("defaults to max_turns 40 for unknown event", () => {
    const r = decide("something_unknown");
    expect(r.max_turns).toBe(40);
  });

  it("loads orchestrator-contract for unknown event", () => {
    const r = decide("something_unknown");
    expect(r.contract).toBe(".agents/custom/orchestrator-contract.md");
  });

  it("exits 0 for unknown event (graceful default)", () => {
    expect(decideExit("something_unknown")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Output completeness — all three keys always present
// ---------------------------------------------------------------------------

describe("output format", () => {
  it("always emits model key", () => {
    const r = decide("issues");
    expect(r.model).not.toBe("");
  });

  it("always emits max_turns key", () => {
    const r = decide("issues");
    expect(r.max_turns).toBeGreaterThan(0);
  });

  it("always emits contract key", () => {
    const r = decide("issues");
    expect(r.contract).not.toBe("");
  });

  it("exits 0 for all known events", () => {
    const events = ["issues", "issue_comment", "pull_request_review_comment"];
    for (const e of events) {
      expect(decideExit(e)).toBe(0);
    }
  });
});
