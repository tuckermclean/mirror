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

  it("returns 'unknown' for a verdict JSON missing the blockers field", () => {
    expect(resolveBlockers(JSON.stringify({ suggestions: 0 }))).toBe("unknown");
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
