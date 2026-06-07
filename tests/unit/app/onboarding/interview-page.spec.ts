/**
 * Unit tests for onboarding/interview/page — tombstone guard (ADR-009 / issue #36).
 *
 * Verifies that the user-lookup WHERE clause includes ne(users.plan, DELETED_PLAN)
 * so soft-deleted ("tombstone") users cannot be looked up by this page.
 *
 * Note: InterviewPage is a React Server Component that renders JSX. In the node
 * test env (no jsdom), the JSX render step throws "React is not defined". We catch
 * that error so we can still assert on the DB mock interactions that happen before
 * rendering begins.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any SUT import
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
const mockCurrentUser = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn());
const mockNe = vi.hoisted(() => vi.fn());

const mockDbSelectChain = vi.hoisted(() => {
  const limit = vi.fn().mockResolvedValue([{ id: "existing-user-id" }]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit };
});

const mockDbInsertChain = vi.hoisted(() => {
  const returning = vi.fn().mockResolvedValue([{ id: "new-user-id" }]);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, returning };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
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
  users: {
    id: Symbol("users.id"),
    clerkId: Symbol("users.clerkId"),
    plan: Symbol("users.plan"),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/components/interview-chat", () => ({
  InterviewChat: () => null,
}));

// ---------------------------------------------------------------------------
// SUT import
// ---------------------------------------------------------------------------
import InterviewPage from "@/app/onboarding/interview/page";
import { users } from "@/db/schema";

// ---------------------------------------------------------------------------
// Helper: invoke the page and ignore JSX render errors from node env
// ---------------------------------------------------------------------------
async function invokeInterviewPage(): Promise<void> {
  try {
    await InterviewPage();
  } catch (err) {
    // React is not available in the node test env — the JSX render step throws
    // "React is not defined". All DB interactions happen before that step, so we
    // can safely ignore this specific error and proceed to mock assertions.
    if (err instanceof ReferenceError && /React/i.test(String(err))) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockNe.mockClear();

  mockAuth.mockResolvedValue({ userId: "clerk_test_user" });
  mockCurrentUser.mockResolvedValue({
    emailAddresses: [{ emailAddress: "test@example.com" }],
  });
  mockRedirect.mockImplementation(() => {
    throw new Error("redirect");
  });

  // Default: user already exists
  mockDbSelectChain.limit.mockResolvedValue([{ id: "existing-user-id" }]);
});

// ---------------------------------------------------------------------------
// Tombstone guard — ADR-009 / issue #36
// ---------------------------------------------------------------------------
describe("tombstone guard", () => {
  it("user lookup WHERE clause uses ne(users.plan, DELETED_PLAN)", async () => {
    await invokeInterviewPage();
    expect(mockNe, "ne() must be called with users.plan and 'deleted'").toHaveBeenCalledWith(
      users.plan,
      "deleted"
    );
  });

  it("treats tombstoned user as new user and inserts a fresh row", async () => {
    // Tombstone guard excludes the deleted user → SELECT returns []
    // Page should treat this as a new user and do an INSERT
    mockDbSelectChain.limit.mockResolvedValue([]);
    await invokeInterviewPage();
    expect(mockDbInsertChain.insert).toHaveBeenCalledOnce();
  });
});
