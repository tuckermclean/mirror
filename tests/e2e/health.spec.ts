/**
 * E2E tests for /api/health/live and /api/health/ready.
 *
 * These tests hit the real running app.  The readiness probe may return 503 in
 * environments where the DB / pgvector extension is absent, so we validate both
 * branches.
 */
import { test, expect } from "@playwright/test";

test.describe("/api/health/live", () => {
  test("returns 200 with status ok and an ISO timestamp", async ({ request }) => {
    const response = await request.get("/api/health/live");

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { status: string; ts: string };
    expect(body.status).toBe("ok");
    expect(typeof body.ts).toBe("string");
    expect(() => new Date(body.ts).toISOString()).not.toThrow();
  });
});

test.describe("/api/health/ready", () => {
  test("returns JSON with status and checks fields", async ({ request }) => {
    const response = await request.get("/api/health/ready");

    // Accept either 200 (healthy env) or 503 (DB unavailable in test env)
    expect([200, 503]).toContain(response.status());
    const body = (await response.json()) as {
      status: string;
      checks: { db: string; pgvector: string };
    };
    expect(["ok", "error"]).toContain(body.status);
    expect(body.checks).toBeDefined();
    expect(["ok", "error"]).toContain(body.checks.db);
    expect(["ok", "error"]).toContain(body.checks.pgvector);
  });

  test("returns 200 with all checks ok when database is healthy", async ({ request }) => {
    const response = await request.get("/api/health/ready");

    // Only assert 200 when the environment has a DB; skip otherwise.
    if (response.status() === 200) {
      const body = (await response.json()) as {
        status: string;
        checks: { db: string; pgvector: string };
      };
      expect(body.status).toBe("ok");
      expect(body.checks.db).toBe("ok");
      expect(body.checks.pgvector).toBe("ok");
    } else {
      // 503 in a no-DB environment is also a valid, well-formed response
      expect(response.status()).toBe(503);
    }
  });
});
