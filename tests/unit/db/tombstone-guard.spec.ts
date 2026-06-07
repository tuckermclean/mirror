/**
 * Unit tests — tombstone guard on active-user queries (issue #36).
 *
 * Verifies that every Drizzle query that resolves or lists "active" users
 * carries `ne(users.plan, DELETED_PLAN)` so that soft-deleted rows (plan =
 * 'deleted', per ADR-009) are excluded at the DB layer rather than relying on
 * the caller to check the plan column after the fact.
 *
 * These are static source-text assertions — intentionally frail against the
 * specific patterns so that a future refactor that removes the guard fails the
 * test and forces explicit re-evaluation.
 */
import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

describe("tombstone guard — ne(users.plan, DELETED_PLAN)", () => {
  it("chat route imports DELETED_PLAN from delete-user", () => {
    const content = read("src/app/api/chat/route.ts");
    expect(content, "chat route must import DELETED_PLAN").toMatch(/DELETED_PLAN/);
  });

  it("chat route applies ne(users.plan, DELETED_PLAN) on the user lookup", () => {
    const content = read("src/app/api/chat/route.ts");
    expect(content, "chat route must call ne(users.plan, …)").toMatch(/ne\s*\(\s*users\.plan/);
  });

  it("imports upload route imports DELETED_PLAN from delete-user", () => {
    const content = read("src/app/api/imports/upload/route.ts");
    expect(content, "upload route must import DELETED_PLAN").toMatch(/DELETED_PLAN/);
  });

  it("imports upload route applies ne(users.plan, DELETED_PLAN) on the user lookup", () => {
    const content = read("src/app/api/imports/upload/route.ts");
    expect(content, "upload route must call ne(users.plan, …)").toMatch(/ne\s*\(\s*users\.plan/);
  });

  it("onboarding interview page imports DELETED_PLAN from delete-user", () => {
    const content = read("src/app/onboarding/interview/page.tsx");
    expect(content, "interview page must import DELETED_PLAN").toMatch(/DELETED_PLAN/);
  });

  it("onboarding interview page applies ne(users.plan, DELETED_PLAN) on the user lookup", () => {
    const content = read("src/app/onboarding/interview/page.tsx");
    expect(content, "interview page must call ne(users.plan, …)").toMatch(/ne\s*\(\s*users\.plan/);
  });

  it("dashboard page imports DELETED_PLAN from delete-user", () => {
    const content = read("src/app/dashboard/page.tsx");
    expect(content, "dashboard page must import DELETED_PLAN").toMatch(/DELETED_PLAN/);
  });

  it("dashboard page applies ne(users.plan, DELETED_PLAN) on the fallback user select", () => {
    const content = read("src/app/dashboard/page.tsx");
    expect(content, "dashboard page must call ne(users.plan, …)").toMatch(/ne\s*\(\s*users\.plan/);
  });
});
