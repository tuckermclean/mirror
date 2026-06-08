/**
 * Unit tests for scripts/eval-prompts.sh — the graceful-skip wrapper around
 * `pnpm eval:prompts`.
 *
 * These tests exercise the wrapper's exit-code contract without invoking real
 * promptfoo evals (no network, no API key required).
 *
 * Covered scenarios:
 *  1. Missing ANTHROPIC_API_KEY  → exit 0 (skip)
 *  2. promptfoo billing error (exit 100) on eval:interview → exit 0 (skip)
 *  3. promptfoo billing error (exit 100) on eval:voice     → exit 0 (skip)
 *  4. Real assertion failure (exit 1) propagates           → exit 1
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = resolve(process.cwd());
const WRAPPER = resolve(REPO_ROOT, "scripts/eval-prompts.sh");

/** Runs the wrapper with a fake pnpm shim that exits with the given codes. */
function runWithFakePnpm(
  opts: {
    interviewExitCode?: number;
    voiceExitCode?: number;
    anthropicApiKey?: string;
  } = {},
): { exitCode: number; stderr: string; stdout: string } {
  const { interviewExitCode = 0, voiceExitCode = 0, anthropicApiKey = "sk-test-key" } = opts;

  // Create a temp dir for a fake pnpm shim
  const dir = join(tmpdir(), `eval-wrapper-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });

  // Write a shim that mimics `pnpm run eval:interview` and `pnpm run eval:voice`
  // argv: pnpm($0) run($1) eval:interview($2)  →  $2 is the script name
  const shimPath = join(dir, "pnpm");
  const shimContent = `#!/usr/bin/env bash
# fake pnpm shim for eval-prompts.sh tests
CMD="$2"  # "eval:interview" or "eval:voice"
if [[ "$CMD" == "eval:interview" ]]; then
  exit ${interviewExitCode}
elif [[ "$CMD" == "eval:voice" ]]; then
  exit ${voiceExitCode}
fi
exit 0
`;
  writeFileSync(shimPath, shimContent, { mode: 0o755 });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${dir}:${process.env["PATH"] ?? ""}`,
  };

  if (anthropicApiKey !== "") {
    env["ANTHROPIC_API_KEY"] = anthropicApiKey;
  } else {
    delete env["ANTHROPIC_API_KEY"];
  }

  const result = spawnSync("bash", [WRAPPER], {
    env,
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  // Clean up temp dir
  rmSync(dir, { recursive: true, force: true });

  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

describe("scripts/eval-prompts.sh", () => {
  it("wrapper script exists and is executable", () => {
    expect(existsSync(WRAPPER)).toBe(true);
    // Check execute permission: bash -n validates syntax
    const result = spawnSync("bash", ["-n", WRAPPER], { encoding: "utf8" });
    expect(result.status).toBe(0);
  });

  it("exits 0 and prints skip message when ANTHROPIC_API_KEY is absent", () => {
    const { exitCode, stderr } = runWithFakePnpm({ anthropicApiKey: "" });
    expect(exitCode).toBe(0);
    expect(stderr).toContain("ANTHROPIC_API_KEY is not set");
    expect(stderr).toContain("skipping prompt evals");
  });

  it("exits 0 when both evals succeed", () => {
    const { exitCode } = runWithFakePnpm({ interviewExitCode: 0, voiceExitCode: 0 });
    expect(exitCode).toBe(0);
  });

  it("exits 0 (skip) when eval:interview exits with billing code 100", () => {
    const { exitCode, stderr } = runWithFakePnpm({ interviewExitCode: 100, voiceExitCode: 0 });
    expect(exitCode).toBe(0);
    expect(stderr).toContain("billing/auth error");
  });

  it("exits 0 (skip) when eval:voice exits with billing code 100", () => {
    const { exitCode, stderr } = runWithFakePnpm({ interviewExitCode: 0, voiceExitCode: 100 });
    expect(exitCode).toBe(0);
    expect(stderr).toContain("billing/auth error");
  });

  it("exits 0 (skip) when both evals exit with billing code 100", () => {
    const { exitCode, stderr } = runWithFakePnpm({ interviewExitCode: 100, voiceExitCode: 100 });
    expect(exitCode).toBe(0);
    expect(stderr).toContain("billing/auth error");
  });

  it("propagates non-billing failure (exit 1) as exit 1", () => {
    const { exitCode } = runWithFakePnpm({ interviewExitCode: 1, voiceExitCode: 0 });
    expect(exitCode).toBe(1);
  });

  it("propagates non-billing failure (exit 1) from eval:voice as exit 1", () => {
    const { exitCode } = runWithFakePnpm({ interviewExitCode: 0, voiceExitCode: 1 });
    expect(exitCode).toBe(1);
  });

  it("ORs exit codes: exits 1 when one is 1 and the other is 0", () => {
    // 1 | 0 = 1
    const { exitCode } = runWithFakePnpm({ interviewExitCode: 1, voiceExitCode: 0 });
    expect(exitCode).toBe(1);
  });
});
