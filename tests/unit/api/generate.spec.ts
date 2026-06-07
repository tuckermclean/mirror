/**
 * Unit tests for POST /api/generate — generation pipeline kickoff (issue #142).
 *
 * Covers:
 *  - 401 when unauthenticated.
 *  - 400 on invalid/missing snapshotId.
 *  - 404 when no active user row (tombstone guard).
 *  - 402 monthly_cap_reached when the spend cap is hit (cap checked BEFORE work).
 *  - Prompt-hash cache hit: returns the cached generationId with cached:true,
 *    and does NOT call Anthropic or Inngest.
 *  - Cache miss: inserts a placeholder generation, sends generation/start, and
 *    returns the new generationId.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any SUT import
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
const mockCheckMonthlyCap = vi.hoisted(() => vi.fn());
const mockComputePromptHash = vi.hoisted(() => vi.fn());
const mockFindCachedGeneration = vi.hoisted(() => vi.fn());
const mockInngestSend = vi.hoisted(() => vi.fn());
const mockAnthropicCtor = vi.hoisted(() => vi.fn());

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

vi.mock("@anthropic-ai/sdk", () => ({
  default: mockAnthropicCtor.mockImplementation(() => ({ messages: {} })),
}));

vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: mockCheckMonthlyCap,
}));

vi.mock("@/lib/llm/prompt-cache", () => ({
  computePromptHash: mockComputePromptHash,
  findCachedGeneration: mockFindCachedGeneration,
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
}));

vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelectChain.select,
    insert: mockDbInsertChain.insert,
  },
}));

vi.mock("@/db/schema", () => ({
  generations: {
    id: Symbol("generations.id"),
    userId: Symbol("generations.userId"),
    inputSnapshotId: Symbol("generations.inputSnapshotId"),
    model: Symbol("generations.model"),
    promptHash: Symbol("generations.promptHash"),
    output: Symbol("generations.output"),
  },
  users: {
    id: Symbol("users.id"),
    clerkId: Symbol("users.clerkId"),
    plan: Symbol("users.plan"),
  },
}));

// ---------------------------------------------------------------------------
// SUT import
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/generate/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown = { snapshotId: "snap-1" }): NextRequest {
  return new NextRequest("http://localhost/api/generate", {
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

  mockAuth.mockResolvedValue({ userId: "clerk_test_user" });
  mockDbSelectChain.limit.mockResolvedValue([{ id: "internal-user-uuid" }]);
  mockCheckMonthlyCap.mockResolvedValue({ allowed: true });
  mockComputePromptHash.mockReturnValue("hash-deadbeef");
  mockFindCachedGeneration.mockResolvedValue(null);
  mockDbInsertChain.returning.mockResolvedValue([{ id: "new-gen-uuid" }]);
  mockInngestSend.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
describe("authentication", () => {
  it("returns 401 unauthorized when userId is missing", async () => {
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
  it("returns 400 when snapshotId is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when snapshotId is not a string", async () => {
    const res = await POST(makeRequest({ snapshotId: 42 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/generate", {
      method: "POST",
      body: "{not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// User resolution
// ---------------------------------------------------------------------------
describe("user resolution", () => {
  it("returns 404 when no active user row is found", async () => {
    mockDbSelectChain.limit.mockResolvedValue([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Monthly spend cap — must be enforced before any generation kickoff
// ---------------------------------------------------------------------------
describe("monthly spend cap", () => {
  it("returns 402 monthly_cap_reached with resets_at when cap is hit", async () => {
    mockCheckMonthlyCap.mockResolvedValue({
      allowed: false,
      resets_at: "2026-07-01T00:00:00.000Z",
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("monthly_cap_reached");
    expect(body["resets_at"]).toBe("2026-07-01T00:00:00.000Z");
  });

  it("does not start generation work when the cap is hit", async () => {
    mockCheckMonthlyCap.mockResolvedValue({
      allowed: false,
      resets_at: "2026-07-01T00:00:00.000Z",
    });
    await POST(makeRequest());
    expect(mockFindCachedGeneration).not.toHaveBeenCalled();
    expect(mockDbInsertChain.insert).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Prompt-hash cache hit
// ---------------------------------------------------------------------------
describe("prompt-hash cache hit", () => {
  it("returns the cached generationId with cached:true", async () => {
    mockFindCachedGeneration.mockResolvedValue({
      id: "cached-gen-uuid",
      output: { headline: "cached" },
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["generationId"]).toBe("cached-gen-uuid");
    expect(body["cached"]).toBe(true);
  });

  it("does NOT call Anthropic or Inngest on a cache hit", async () => {
    mockFindCachedGeneration.mockResolvedValue({
      id: "cached-gen-uuid",
      output: { headline: "cached" },
    });
    await POST(makeRequest());
    expect(mockAnthropicCtor).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
    expect(mockDbInsertChain.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cache miss — kicks off the pipeline via Inngest
// ---------------------------------------------------------------------------
describe("cache miss", () => {
  it("inserts a placeholder, sends generation/start, and returns the new id", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["generationId"]).toBe("new-gen-uuid");
    expect(body["cached"]).toBeUndefined();

    expect(mockDbInsertChain.insert).toHaveBeenCalledTimes(1);
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "generation/start",
      data: {
        userId: "internal-user-uuid",
        snapshotId: "snap-1",
        generationId: "new-gen-uuid",
      },
    });
  });
});
