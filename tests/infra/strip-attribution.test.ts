// Tests for scripts/git/strip-attribution.sh — the prepare-commit-msg hook.
// Verifies that Claude/Anthropic attribution is removed and other co-authors
// are preserved. --install mode is not tested (git dir side-effect).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/git/strip-attribution.sh",
);

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "strip-attr-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Write a commit-msg file, run the script, return the result. */
function strip(content: string): string {
  const file = join(dir, `msg-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(file, content);
  execFileSync("bash", [script, file], { encoding: "utf8" });
  return readFileSync(file, "utf8");
}

describe("strip-attribution", () => {
  it("removes Co-authored-by line matching 'Anthropic' in the email domain", () => {
    // Input has 'Anthropic' in the domain but NOT 'Claude' in the name,
    // so only the Anthropic pattern fires — isolates that pattern.
    const result = strip("feat: add thing\n\nCo-authored-by: Bot <noreply@anthropic.com>\n");
    expect(result).not.toContain("Co-authored-by: Bot");
    expect(result).toContain("feat: add thing");
  });

  it("removes Co-authored-by line with 'Claude'", () => {
    const result = strip("fix: something\n\nCo-authored-by: Claude Code <claude@anthropic.com>\n");
    expect(result).not.toContain("Co-authored-by: Claude Code");
  });

  it("removes 'Generated with [Claude Code]' footer line", () => {
    const result = strip("feat: thing\n\nGenerated with [Claude Code](https://claude.ai)\n");
    expect(result).not.toContain("Generated with [Claude Code]");
  });

  it("preserves non-Claude co-author lines", () => {
    const msg = "feat: thing\n\nCo-authored-by: Alice <alice@example.com>\nCo-authored-by: Claude <noreply@anthropic.com>\n";
    const result = strip(msg);
    expect(result).toContain("Co-authored-by: Alice <alice@example.com>");
    expect(result).not.toContain("Co-authored-by: Claude");
  });

  it("is a no-op on a plain commit message with no attribution", () => {
    const msg = "chore: update deps\n\nBumps lodash from 4.17.20 to 4.17.21.\n";
    expect(strip(msg)).toBe(msg);
  });

  it("removes all Claude attribution lines when multiple are present", () => {
    const msg = [
      "feat: big feature",
      "",
      "Co-authored-by: Claude <noreply@anthropic.com>",
      "Co-authored-by: Claude Code <claude@anthropic.com>",
      "Generated with [Claude Code](https://claude.ai/code)",
      "",
    ].join("\n");
    const result = strip(msg);
    expect(result).not.toContain("Co-authored-by");
    expect(result).not.toContain("Generated with");
    expect(result).toContain("feat: big feature");
  });

  it("exits 2 when no arguments are provided", () => {
    const result = spawnSync("bash", [script], { encoding: "utf8" });
    expect(result.status).toBe(2);
  });
});
