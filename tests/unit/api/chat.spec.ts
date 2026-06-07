/**
 * Unit tests for POST /api/chat — tombstone guard (ADR-009 / issue #36).
 *
 * Verifies that the user-lookup WHERE clause in the chat route includes
 * ne(users.plan, DELETED_PLAN) so soft-deleted ("tombstone") users are
 * excluded from active-user queries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any SUT import
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
const mockCheckMonthlyCap = vi.hoisted(() => vi.fn());
const mockRecordLlmSpend = vi.hoisted(() => vi.fn());
const mockComputeCostUsd = vi.hoisted(() => vi.fn());
const mockReadInterviewTranscript = vi.hoisted(() => vi.fn());
const mockPrompts = vi.hoisted(() => ({
  interviewSystem: { content: "system prompt" },
}));
const mockNe = vi.hoisted(() => vi.fn());

const mockAnthropicStream = vi.hoisted(() => {
  const on = vi.fn();
  const finalMessage = vi.fn();
  const stream = vi.fn().mockResolvedValue({ on, finalMessage });
  return { stream, on, finalMessage };
});

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

const mockDbUpdateChain = vi.hoisted(() => {
  const returning = vi.fn().mockResolvedValue([{ id: "interview-id", turnCount: 1 }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where, returning }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where, returning };
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

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { stream: mockAnthropicStream.stream },
  })),
}));

vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: mockCheckMonthlyCap,
  recordLlmSpend: mockRecordLlmSpend,
  computeCostUsd: mockComputeCostUsd,
}));

vi.mock("@/lib/db/pii-read", () => ({
  readInterviewTranscript: mockReadInterviewTranscript,
}));

vi.mock("@/lib/prompts/index", () => ({
  prompts: mockPrompts,
}));

vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelectChain.select,
    insert: mockDbInsertChain.insert,
    update: mockDbUpdateChain.update,
  },
}));

vi.mock("@/db/schema", () => ({
  interviews: {
    id: Symbol("interviews.id"),
    userId: Symbol("interviews.userId"),
    completedAt: Symbol("interviews.completedAt"),
    turnCount: Symbol("interviews.turnCount"),
    transcript: Symbol("interviews.transcript"),
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
import { POST } from "@/app/api/chat/route";
import { NextRequest } from "next/server";
import { users } from "@/db/schema";
import { DELETED_PLAN } from "@/lib/db/delete-user";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(messages = [{ role: "user", content: "hello" }]): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockNe.mockClear();

  mockAuth.mockResolvedValue({ userId: "clerk_test_user" });

  // Default: active user found
  mockDbSelectChain.limit.mockResolvedValue([{ id: "internal-user-uuid" }]);

  // Default: cap not reached
  mockCheckMonthlyCap.mockResolvedValue({ allowed: true });

  // Default: no existing interview → insert path
  mockDbInsertChain.returning.mockResolvedValue([{ id: "interview-id" }]);

  // Default: turn claim succeeds
  mockDbUpdateChain.returning.mockResolvedValue([{ id: "interview-id", turnCount: 1 }]);

  // Default: empty transcript
  mockReadInterviewTranscript.mockResolvedValue({ transcript: [] });
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
  });
});

// ---------------------------------------------------------------------------
// Tombstone guard — ADR-009 / issue #36
// ---------------------------------------------------------------------------
describe("tombstone guard", () => {
  it("user lookup WHERE clause includes ne(users.plan, DELETED_PLAN)", async () => {
    await POST(makeRequest());
    expect(mockNe, "ne() must be called with users.plan and DELETED_PLAN").toHaveBeenCalledWith(
      users.plan,
      DELETED_PLAN
    );
  });

  it("returns 404 user_not_found when tombstone row is excluded by guard", async () => {
    // Simulates the tombstone guard filtering out a deleted user —
    // the query returns [] because ne(users.plan, DELETED_PLAN) excludes the row.
    mockDbSelectChain.limit.mockResolvedValue([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("user_not_found");
  });
});
