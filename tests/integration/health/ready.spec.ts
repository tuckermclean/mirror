/**
 * Integration tests for /api/health/ready — NO mocks, real DB required.
 *
 * These tests guard against adapter swaps: if the Drizzle driver or SQL dialect
 * ever changes, the mocked unit tests would still pass while these fail, giving
 * an early signal before the breakage reaches production.
 *
 * Run with: DATABASE_URL=... pnpm test:integration
 * Tests are skipped automatically when DATABASE_URL is absent.
 */
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

const itWithDb = process.env["DATABASE_URL"] ? it : it.skip;

describe("GET /api/health/ready — integration (real DB, no mocks)", () => {
  itWithDb("SELECT 1 executes and returns a row via the real Drizzle adapter", async () => {
    const rows = await db.execute(sql`SELECT 1`);
    expect(rows.length).toBeGreaterThan(0);
  });

  itWithDb("pgvector extension is installed and queryable", async () => {
    const rows = await db.execute(
      sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`
    );
    expect(rows.length).toBeGreaterThan(0);
    expect((rows[0] as { extname: string }).extname).toBe("vector");
  });

  itWithDb("GET /api/health/ready returns 200 ok against a live DB+pgvector", async () => {
    // Import without vi.mock so the real db.execute runs real SQL.
    // This is the test that breaks when the adapter is swapped — unit tests won't.
    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      checks: { db: string; pgvector: string };
    };
    expect(body.status).toBe("ok");
    expect(body.checks.db).toBe("ok");
    expect(body.checks.pgvector).toBe("ok");
  });
});
