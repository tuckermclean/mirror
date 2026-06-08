/**
 * Unit tests for POST /api/commit — walkthrough commit recording (issue #145).
 *
 * Covers:
 *  - 401 when unauthenticated.
 *  - 400 on invalid/missing generationId or invalid method.
 *  - 400 on malformed JSON body.
 *  - 404 when no active user row (tombstone guard).
 *  - 404 when generation row does not exist or belongs to a different user (IDOR guard).
 *  - 201 with { commitId } on the happy path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any SUT import
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
const mockNe = vi.hoisted(() => vi.fn());

const mockDbSelectChain = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit };
});

const mockDbInsertChain = vi.hoisted(() => {
  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, returning };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("drizzle-orm", async (importActual) => {
  const actual = await importActual<typeof import("drizzle-orm")>();
  return {
    ...actual,
    ne: (...args: Parameters<typeof actual.ne>) => {
      mockNe(...args);
      return actual.ne(...args);
    },
  };
});

vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelectChain.select,
    insert: mockDbInsertChain.insert,
  },
}));

vi.mock("@/db/schema", () => ({
  commits: {
    id: Symbol("commits.id"),
    userId: Symbol("commits.userId"),
    generationId: Symbol("commits.generationId"),
    fieldsAccepted: Symbol("commits.fieldsAccepted"),
    method: Symbol("commits.method"),
  },
  generations: {
    id: Symbol("generations.id"),
    userId: Symbol("generations.userId"),
  },
  users: {
    id: Symbol("users.id"),
    clerkId: Symbol("users.clerkId"),
    plan: Symbol("users.plan"),
  },
}));

vi.mock("@/lib/db/delete-user", () => ({
  DELETED_PLAN: "deleted",
}));

// ---------------------------------------------------------------------------
// SUT import
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/commit/route";
import { NextRequest } from "next/server";
import { users } from "@/db/schema";
import { DELETED_PLAN } from "@/lib/db/delete-user";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown = {
  generationId: "gen-uuid-1",
  method: "in-app",
  fieldsAccepted: { headline: "accept" },
}): NextRequest {
  return new NextRequest("http://localhost/api/commit", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Setup — happy path defaults
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockNe.mockClear();

  mockAuth.mockResolvedValue({ userId: "clerk_test_user" });

  // First call returns user row, second returns generation row.
  mockDbSelectChain.limit
    .mockResolvedValueOnce([{ id: "internal-user-uuid" }])
    .mockResolvedValueOnce([{ id: "gen-uuid-1" }]);

  mockDbInsertChain.returning.mockResolvedValue([{ id: "commit-uuid-1" }]);
});

afterEach(() => {
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
describe("authentication", () => {
  it("returns 401 when userId is missing", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("unauthorized");
  });
});

// ---------------------------------------------------------------------------
// Body validation
// ---------------------------------------------------------------------------
describe("body validation", () => {
  it("returns 400 when generationId is missing", async () => {
    const res = await POST(makeRequest({ method: "in-app", fieldsAccepted: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when generationId is empty string", async () => {
    const res = await POST(makeRequest({ generationId: "", method: "in-app" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when generationId is not a string", async () => {
    const res = await POST(makeRequest({ generationId: 42, method: "in-app" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when method is missing", async () => {
    const res = await POST(makeRequest({ generationId: "gen-uuid-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when method is not a valid enum value", async () => {
    const res = await POST(makeRequest({ generationId: "gen-uuid-1", method: "clipboard" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/commit", {
      method: "POST",
      body: "{not valid json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts all valid method values (in-app, export-doc, extension)", async () => {
    for (const method of ["in-app", "export-doc", "extension"]) {
      // Reset mocks for each iteration
      mockDbSelectChain.limit
        .mockResolvedValueOnce([{ id: "internal-user-uuid" }])
        .mockResolvedValueOnce([{ id: "gen-uuid-1" }]);
      mockDbInsertChain.returning.mockResolvedValue([{ id: "commit-uuid-1" }]);

      const res = await POST(makeRequest({ generationId: "gen-uuid-1", method }));
      expect(res.status).toBe(201);
    }
  });
});

// ---------------------------------------------------------------------------
// Tombstone guard — ADR-009
// ---------------------------------------------------------------------------
describe("tombstone guard", () => {
  it("user lookup WHERE clause includes ne(users.plan, DELETED_PLAN)", async () => {
    await POST(makeRequest());
    expect(mockNe).toHaveBeenCalledWith(users.plan, DELETED_PLAN);
  });

  it("returns 404 when the user row is excluded by the tombstone guard", async () => {
    mockDbSelectChain.limit.mockReset().mockResolvedValue([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("user_not_found");
  });
});

// ---------------------------------------------------------------------------
// Generation ownership — IDOR guard
// ---------------------------------------------------------------------------
describe("generation ownership (IDOR guard)", () => {
  it("returns 404 when generation does not exist", async () => {
    mockDbSelectChain.limit
      .mockReset()
      .mockResolvedValueOnce([{ id: "internal-user-uuid" }]) // user found
      .mockResolvedValueOnce([]); // generation not found
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("generation_not_found");
  });

  it("returns 404 when generation belongs to a different user (IDOR)", async () => {
    mockDbSelectChain.limit
      .mockReset()
      .mockResolvedValueOnce([{ id: "internal-user-uuid" }]) // user found
      .mockResolvedValueOnce([]); // ownership check fails — not this user's row
    const res = await POST(makeRequest({ generationId: "other-users-gen", method: "in-app" }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("generation_not_found");
  });

  it("does not insert a commit when generation ownership fails", async () => {
    mockDbSelectChain.limit
      .mockReset()
      .mockResolvedValueOnce([{ id: "internal-user-uuid" }])
      .mockResolvedValueOnce([]);
    await POST(makeRequest());
    expect(mockDbInsertChain.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe("happy path", () => {
  it("returns 201 with { commitId } on success", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["commitId"]).toBe("commit-uuid-1");
  });

  it("inserts a commit row with the correct fields", async () => {
    await POST(makeRequest({
      generationId: "gen-uuid-1",
      method: "export-doc",
      fieldsAccepted: { headline: "accept", skills: "reject" },
    }));
    expect(mockDbInsertChain.insert).toHaveBeenCalledTimes(1);
    expect(mockDbInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "internal-user-uuid",
        generationId: "gen-uuid-1",
        method: "export-doc",
        fieldsAccepted: { headline: "accept", skills: "reject" },
      })
    );
  });
});
