// RED: Dockerfile does not exist yet — fails until Wk 1
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

const ROOT = resolve(process.cwd());

describe("Docker image build (app)", () => {
  it("Dockerfile exists at repo root", () => {
    expect(existsSync(resolve(ROOT, "Dockerfile"))).toBe(true);
  });

  it("Dockerfile.worker exists at repo root", () => {
    expect(existsSync(resolve(ROOT, "Dockerfile.worker"))).toBe(true);
  });

  it("docker build succeeds for app image (multi-stage)", () => {
    // Skipped in unit run; runs in CI via pnpm infra:test with DOCKER=1 env
    if (!process.env["DOCKER"]) return;
    expect(() =>
      execSync("docker build --target runner -t mirror-test:ci .", { stdio: "pipe", cwd: ROOT })
    ).not.toThrow();
  });

  it("compressed image size is under 250 MB", () => {
    if (!process.env["DOCKER"]) return;
    const output = execSync("docker image inspect mirror-test:ci --format '{{.Size}}'").toString().trim();
    const bytes = parseInt(output, 10);
    expect(bytes).toBeLessThan(250 * 1024 * 1024);
  });

  it("Trivy scan reports 0 HIGH or CRITICAL CVEs", () => {
    if (!process.env["DOCKER"]) return;
    expect(() =>
      execSync("trivy image --exit-code 1 --severity HIGH,CRITICAL mirror-test:ci", { stdio: "pipe" })
    ).not.toThrow();
  });
});
