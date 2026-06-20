// Tests for scripts/converge/resolve-blockers.sh — the convergence-loop verdict
// resolver. Guards against the phantom "blockers remaining" escalation: when the
// reviewer leaves the sentinel verdict in place, the count must come from its
// PR comment footer, not from the fail-safe default.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/converge/resolve-blockers.sh",
);

const SENTINEL = JSON.stringify({
  blockers: 1,
  suggestions: 0,
  nits: [],
  blocker_signatures: ["verdict-file-not-written"],
});

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "converge-resolve-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Run the resolver with a verdict file and optional injected comment body. */
function resolveBlockers(verdict: string, commentBody?: string): string {
  const file = join(dir, `verdict-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, verdict);
  return execFileSync("bash", [script, file, "123"], {
    encoding: "utf8",
    env: {
      ...process.env,
      // Always inject a comment so the script never hits the network (`gh`).
      // An empty match-free body exercises the "no parseable verdict" path.
      CONVERGE_COMMENT_BODY: commentBody ?? "no footer here",
    },
  }).trim();
}

/**
 * Run the resolver against a full comments array + a round-start cutoff, so the
 * round-scoping of the sentinel fallback can be exercised without the network.
 */
function resolveWithComments(
  verdict: string,
  comments: { createdAt: string; body: string }[],
  roundStarted: string,
): string {
  const file = join(dir, `verdict-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, verdict);
  return execFileSync("bash", [script, file, "123"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CONVERGE_COMMENTS_JSON: JSON.stringify(comments),
      CONVERGE_ROUND_STARTED: roundStarted,
    },
  }).trim();
}

describe("converge resolve-blockers", () => {
  it("trusts a real JSON verdict of 0 blockers", () => {
    expect(resolveBlockers(JSON.stringify({ blockers: 0 }))).toBe("0");
  });

  it("trusts a real JSON verdict of N blockers", () => {
    expect(resolveBlockers(JSON.stringify({ blockers: 2 }))).toBe("2");
  });

  it("falls back to the comment footer when the sentinel survives (the #31 bug)", () => {
    // This is the exact regression: sentinel in JSON, but the reviewer's comment
    // says 0 blockers. Old code read the sentinel (1) and escalated falsely.
    expect(
      resolveBlockers(SENTINEL, "🔴 0 blockers | 🟡 0 suggestions | 💭 2 nits"),
    ).toBe("0");
  });

  it("parses a non-zero blocker count from the comment footer", () => {
    expect(resolveBlockers(SENTINEL, "🔴 3 blockers | 🟡 1 suggestion")).toBe(
      "3",
    );
  });

  it("returns 'unknown' when sentinel survives and the comment has no footer", () => {
    expect(resolveBlockers(SENTINEL, "review still in progress…")).toBe(
      "unknown",
    );
  });

  // ── Round scoping of the sentinel fallback (the #182 phantom-blocker bug) ──

  const ROUND_START = "2026-06-19T21:00:00Z";
  const stale = {
    createdAt: "2026-06-19T20:39:00Z",
    body: "🔴 1 blocker | 🟡 0 suggestions",
  };

  it("ignores a STALE prior-round footer and returns 'unknown' (no current verdict)", () => {
    // Sentinel survived AND the only 🔴 footer predates this round → must NOT be
    // read as this round's count (that manufactured the #182 phantom blocker).
    expect(resolveWithComments(SENTINEL, [stale], ROUND_START)).toBe("unknown");
  });

  it("uses the CURRENT-round footer when one exists", () => {
    const current = {
      createdAt: "2026-06-19T21:05:00Z",
      body: "🔴 0 blockers | 🟡 0 suggestions | 💭 2 nits",
    };
    expect(resolveWithComments(SENTINEL, [stale, current], ROUND_START)).toBe(
      "0",
    );
  });

  it("prefers the current-round footer over a stale one when both are present", () => {
    const current = {
      createdAt: "2026-06-19T21:05:00Z",
      body: "🔴 2 blockers",
    };
    expect(resolveWithComments(SENTINEL, [stale, current], ROUND_START)).toBe(
      "2",
    );
  });

  it("stays unscoped (uses any footer) when no round start is given", () => {
    expect(resolveWithComments(SENTINEL, [stale], "")).toBe("1");
  });

  it("returns 'unknown' for a verdict JSON missing the blockers field", () => {
    expect(resolveBlockers(JSON.stringify({ suggestions: 0 }))).toBe("unknown");
  });

  it("returns 'unknown' when the verdict file does not exist", () => {
    const result = execFileSync(
      "bash",
      [script, "/tmp/no-such-converge-verdict-file.json", "123"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CONVERGE_COMMENT_BODY: "no footer here",
        },
      },
    ).trim();
    expect(result).toBe("unknown");
  });

  it("exits non-zero with a usage error when args are missing", () => {
    let status: number | undefined;
    try {
      execFileSync("bash", [script], { encoding: "utf8" });
    } catch (err) {
      status = (err as { status?: number }).status;
    }
    expect(status).toBe(2);
  });
});
