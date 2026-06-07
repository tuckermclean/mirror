// Tests for scripts/status/pipeline-status.sh — pipeline health snapshot.
// Verifies label counting, health verdict logic, and network-bypass via
// PIPELINE_PR_JSON env var injection (same pattern as converge-resolve-blockers).
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  "scripts/status/pipeline-status.sh",
);

type PrLabel = { name: string };
type PrFixture = { number: number; isDraft: boolean; labels: PrLabel[] };

/** Run the script with an injected PR JSON list; never hits the network. */
function runStatus(prs: PrFixture[]): string {
  return execFileSync("bash", [script, "msitarzewski/mirror"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PIPELINE_PR_JSON: JSON.stringify(prs),
    },
  });
}

describe("pipeline-status", () => {
  it("all-clear: empty PR list emits ON_TRACK with all counts 0", () => {
    const out = runStatus([]);
    expect(out).toContain("ON_TRACK");
    expect(out).toMatch(/agent:implementing\s*\|\s*0/);
    expect(out).toMatch(/converge\s*\|\s*0/);
    expect(out).toMatch(/agent:ready\s*\|\s*0/);
    expect(out).toMatch(/needs-human\s*\|\s*0/);
  });

  it("normal in-flight: 1 implementing + 1 converge + 2 ready → ON_TRACK", () => {
    const prs: PrFixture[] = [
      { number: 10, isDraft: true, labels: [{ name: "agent:implementing" }] },
      { number: 11, isDraft: false, labels: [{ name: "converge" }] },
      { number: 12, isDraft: false, labels: [{ name: "agent:ready" }] },
      { number: 13, isDraft: false, labels: [{ name: "agent:ready" }] },
    ];
    const out = runStatus(prs);
    expect(out).toContain("ON_TRACK");
    expect(out).toMatch(/agent:implementing\s*\|\s*1/);
    expect(out).toMatch(/converge\s*\|\s*1/);
    expect(out).toMatch(/agent:ready\s*\|\s*2/);
    expect(out).toMatch(/needs-human\s*\|\s*0/);
  });

  it("BLOCKED: any needs-human PR triggers BLOCKED verdict", () => {
    const prs: PrFixture[] = [
      { number: 20, isDraft: false, labels: [{ name: "needs-human" }] },
      { number: 21, isDraft: false, labels: [{ name: "agent:ready" }] },
    ];
    const out = runStatus(prs);
    expect(out).toContain("BLOCKED");
    expect(out).toMatch(/needs-human\s*\|\s*1/);
  });

  it("AT_RISK: 3 implementing + 2 converge (total 5, no needs-human) → AT_RISK", () => {
    const prs: PrFixture[] = [
      { number: 30, isDraft: true, labels: [{ name: "agent:implementing" }] },
      { number: 31, isDraft: true, labels: [{ name: "agent:implementing" }] },
      { number: 32, isDraft: true, labels: [{ name: "agent:implementing" }] },
      { number: 33, isDraft: false, labels: [{ name: "converge" }] },
      { number: 34, isDraft: false, labels: [{ name: "converge" }] },
    ];
    const out = runStatus(prs);
    expect(out).toContain("AT_RISK");
    expect(out).toMatch(/agent:implementing\s*\|\s*3/);
    expect(out).toMatch(/converge\s*\|\s*2/);
  });

  it("one of each label → BLOCKED (needs-human takes priority)", () => {
    const prs: PrFixture[] = [
      { number: 40, isDraft: true, labels: [{ name: "agent:implementing" }] },
      { number: 41, isDraft: false, labels: [{ name: "converge" }] },
      { number: 42, isDraft: false, labels: [{ name: "agent:ready" }] },
      { number: 43, isDraft: false, labels: [{ name: "needs-human" }] },
    ];
    const out = runStatus(prs);
    expect(out).toContain("BLOCKED");
  });

  it("large count: 4 implementing + 1 converge (total 5) → AT_RISK", () => {
    const prs: PrFixture[] = [
      { number: 50, isDraft: true, labels: [{ name: "agent:implementing" }] },
      { number: 51, isDraft: true, labels: [{ name: "agent:implementing" }] },
      { number: 52, isDraft: true, labels: [{ name: "agent:implementing" }] },
      { number: 53, isDraft: true, labels: [{ name: "agent:implementing" }] },
      { number: 54, isDraft: false, labels: [{ name: "converge" }] },
    ];
    const out = runStatus(prs);
    expect(out).toContain("AT_RISK");
    expect(out).toMatch(/agent:implementing\s*\|\s*4/);
    expect(out).toMatch(/converge\s*\|\s*1/);
  });

  it("exits 2 with usage error when repo arg is missing", () => {
    let status: number | undefined;
    try {
      execFileSync("bash", [script], { encoding: "utf8" });
    } catch (err) {
      status = (err as { status?: number }).status;
    }
    expect(status).toBe(2);
  });
});
