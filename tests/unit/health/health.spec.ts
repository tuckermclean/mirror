/**
 * Unit tests for /api/health/live and /api/health/ready route handlers.
 *
 * DB is mocked so these tests run without a real database connection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the Drizzle db client before importing route handlers that use it.
// ---------------------------------------------------------------------------
const mockExecute = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    execute: mockExecute,
  },
}));

// ---------------------------------------------------------------------------
// /api/health/live
// ---------------------------------------------------------------------------
describe("GET /api/health/live", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("always returns 200 with status ok and an ISO timestamp", async () => {
    const { GET } = await import("@/app/api/health/live/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; ts: string };
    expect(body.status).toBe("ok");
    expect(typeof body.ts).toBe("string");
    // Verify ts is a valid ISO 8601 date
    expect(new Date(body.ts).toISOString()).toBe(body.ts);
  });

  it("does not call the database", async () => {
    const { GET } = await import("@/app/api/health/live/route");
    await GET();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("sets Cache-Control: no-store header", async () => {
    const { GET } = await import("@/app/api/health/live/route");
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

// ---------------------------------------------------------------------------
// /api/health/ready
// ---------------------------------------------------------------------------
describe("GET /api/health/ready", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("returns 200 with all checks ok when DB and pgvector are healthy", async () => {
    // First call: SELECT 1 succeeds; second call: pgvector row found
    mockExecute
      .mockResolvedValueOnce([{ "?column?": 1 }])
      .mockResolvedValueOnce([{ extname: "vector" }]);

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

  it("returns 503 with db error when DB query throws", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection refused"));

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      status: string;
      checks: { db: string; pgvector: string };
    };
    expect(body.status).toBe("error");
    expect(body.checks.db).toBe("error");
    expect(body.checks.pgvector).toBe("error");
  });

  it("returns 503 with pgvector error when extension is not installed", async () => {
    // SELECT 1 passes, but pgvector query returns empty result
    mockExecute
      .mockResolvedValueOnce([{ "?column?": 1 }])
      .mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      status: string;
      checks: { db: string; pgvector: string };
    };
    expect(body.status).toBe("error");
    expect(body.checks.db).toBe("ok");
    expect(body.checks.pgvector).toBe("error");
  });

  it("returns 503 with pgvector error when pgvector query throws", async () => {
    mockExecute
      .mockResolvedValueOnce([{ "?column?": 1 }])
      .mockRejectedValueOnce(new Error("pg_extension table missing"));

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      status: string;
      checks: { db: string; pgvector: string };
    };
    expect(body.status).toBe("error");
    expect(body.checks.db).toBe("ok");
    expect(body.checks.pgvector).toBe("error");
  });

  it("sets Cache-Control: no-store header on healthy response", async () => {
    mockExecute
      .mockResolvedValueOnce([{ "?column?": 1 }])
      .mockResolvedValueOnce([{ extname: "vector" }]);

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("sets Cache-Control: no-store header on error response", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection refused"));

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 with db error when DB query hangs past 3 s timeout", async () => {
    vi.useFakeTimers();
    // A promise that never resolves — simulates a stalled DB connection.
    mockExecute.mockReturnValueOnce(new Promise(() => {}));

    const { GET } = await import("@/app/api/health/ready/route");
    const getPromise = GET();

    await vi.advanceTimersByTimeAsync(3001);
    const response = await getPromise;

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      status: string;
      checks: { db: string; pgvector: string };
    };
    expect(body.status).toBe("error");
    expect(body.checks.db).toBe("error");

    vi.useRealTimers();
  });
});
