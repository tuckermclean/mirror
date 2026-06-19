// RED: infra/helm/ does not exist yet — fails until Wk 1
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

const ROOT = resolve(process.cwd());
const HELM_ROOT = resolve(ROOT, "infra/helm");

describe("Helm charts lint + kubeconform", () => {
  it("infra/helm/mirror-web/Chart.yaml exists", () => {
    expect(existsSync(resolve(HELM_ROOT, "mirror-web/Chart.yaml"))).toBe(true);
  });

  it("infra/helm/mirror-worker/Chart.yaml exists", () => {
    expect(existsSync(resolve(HELM_ROOT, "mirror-worker/Chart.yaml"))).toBe(true);
  });

  it("values-prod.yaml exists for mirror-web", () => {
    expect(existsSync(resolve(HELM_ROOT, "mirror-web/values-prod.yaml"))).toBe(true);
  });

  it("values-freetier.yaml exists for mirror-web", () => {
    expect(existsSync(resolve(HELM_ROOT, "mirror-web/values-freetier.yaml"))).toBe(true);
  });

  it("helm lint passes for mirror-web", () => {
    if (!process.env["HELM"]) return;
    expect(() =>
      execSync(`helm lint ${resolve(HELM_ROOT, "mirror-web")}`, { stdio: "pipe" })
    ).not.toThrow();
  });

  it("helm lint passes for mirror-worker", () => {
    if (!process.env["HELM"]) return;
    expect(() =>
      execSync(`helm lint ${resolve(HELM_ROOT, "mirror-worker")}`, { stdio: "pipe" })
    ).not.toThrow();
  });

  it("helm template | kubeconform passes for prod values", () => {
    if (!process.env["HELM"]) return;
    expect(() =>
      execSync(
        `helm template mirror-web ${resolve(HELM_ROOT, "mirror-web")} -f ${resolve(HELM_ROOT, "mirror-web/values-prod.yaml")} | kubeconform -strict`,
        { stdio: "pipe" }
      )
    ).not.toThrow();
  });

  it("scripts/migrate.mjs exists", () => {
    expect(existsSync(resolve(ROOT, "scripts/migrate.mjs"))).toBe(true);
  });

  it("Dockerfile copies migrations folder into runner stage", () => {
    const dockerfile = readFileSync(resolve(ROOT, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("src/db/migrations");
    expect(dockerfile).toContain("migrate.mjs");
  });

  it("db-migrate-job uses node not pnpm", () => {
    const job = readFileSync(resolve(ROOT, "infra/helm/mirror-web/templates/db-migrate-job.yaml"), "utf8");
    expect(job).toContain('"node"');
    expect(job).not.toMatch(/command:.*pnpm/);
  });

  it("db-migrate-job has activeDeadlineSeconds", () => {
    const job = readFileSync(resolve(ROOT, "infra/helm/mirror-web/templates/db-migrate-job.yaml"), "utf8");
    expect(job).toContain("activeDeadlineSeconds");
  });

  it("mirror-worker deployment has pod securityContext", () => {
    const dep = readFileSync(resolve(ROOT, "infra/helm/mirror-worker/templates/deployment.yaml"), "utf8");
    expect(dep).toContain("runAsNonRoot: true");
    expect(dep).toContain("allowPrivilegeEscalation: false");
  });
});
