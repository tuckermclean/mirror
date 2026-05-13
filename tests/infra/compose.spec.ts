// RED: docker-compose.yml does not exist yet — fails until Wk 1
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

const ROOT = resolve(process.cwd());

describe("docker compose full-stack boot", () => {
  it("docker-compose.yml exists at repo root", () => {
    expect(existsSync(resolve(ROOT, "docker-compose.yml"))).toBe(true);
  });

  it(".env.example exists alongside docker-compose.yml", () => {
    expect(existsSync(resolve(ROOT, ".env.example"))).toBe(true);
  });

  it("compose up brings up stack and /api/health/ready returns 200", () => {
    // Only runs in CI with COMPOSE=1 env; too slow for local unit runs
    if (!process.env["COMPOSE"]) return;
    try {
      execSync("docker compose up -d --wait", { cwd: ROOT, stdio: "pipe", timeout: 120_000 });
      const result = execSync("curl -sf http://localhost:3000/api/health/ready").toString();
      expect(result).toContain("ok");
    } finally {
      execSync("docker compose down", { cwd: ROOT, stdio: "pipe" });
    }
  });
});
