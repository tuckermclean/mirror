/**
 * Unit tests for dashboard/page — tombstone guard (ADR-009 / issue #36).
 *
 * Verifies that the fallback user-lookup WHERE clause (used when INSERT ON CONFLICT
 * returns no rows) includes ne(users.plan, DELETED_PLAN) so soft-deleted
 * ("tombstone") users are excluded from active-user queries.
 *
 * Note: DashboardPage is a React Server Component that renders JSX. In the node
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

/**
 * makeSelectChain builds a fresh query-builder chain for each db.select() call.
 * DashboardPage chains in two forms:
 *   Form A: .select().from().where().limit(1).then(cb) — user fallback lookup
 *   Form B: .select().from().where().limit(1).then(cb) — interviews/generations
 *   Form C: .select().from().where().then(cb)          — imports (no .limit())
 */
const mockSelectCallCount = vi.hoisted(() => ({ value: 0 }));
const mockSelectResults = vi.hoisted(() => ({
  userFallback: [{ id: "existing-user-id" }] as { id: string }[],
  interviews: [] as unknown[],
  imports: [{ value: 0 }] as unknown[],
  generations: [] as unknown[],
}));

const mockDbSelectFactory = vi.hoisted(() => {
  return vi.fn().mockImplementation(() => {
    const callIndex = mockSelectCallCount.value++;
    // Call 0 = user fallback lookup (only when INSERT returns no rows)
    // Calls after that = Promise.all queries (interviews, imports, generations)
    const resultSet =
      callIndex === 0
        ? mockSelectResults.userFallback
        : callIndex === 1
          ? mockSelectResults.interviews
          : callIndex === 2
            ? mockSelectResults.imports
            : mockSelectResults.generations;

    const thenFn = vi.fn().mockImplementation((cb: (rows: unknown[]) => unknown) =>
      Promise.resolve(cb(resultSet))
    );
    const limit = vi.fn(() => ({ then: thenFn }));
    const where = vi.fn(() => ({ limit, then: thenFn }));
    const from = vi.fn(() => ({ where }));
    return { from };
  });
});

const mockDbInsertChain = vi.hoisted(() => {
  const returning = vi.fn().mockResolvedValue([{ id: "new-user-id" }]);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, onConflictDoNothing, returning };
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
    select: mockDbSelectFactory,
    insert: mockDbInsertChain.insert,
  },
}));

vi.mock("@/db/schema", () => ({
  users: {
    id: Symbol("users.id"),
    clerkId: Symbol("users.clerkId"),
    plan: Symbol("users.plan"),
  },
  interviews: {
    id: Symbol("interviews.id"),
    userId: Symbol("interviews.userId"),
    completedAt: Symbol("interviews.completedAt"),
  },
  imports: {
    id: Symbol("imports.id"),
    userId: Symbol("imports.userId"),
  },
  generations: {
    id: Symbol("generations.id"),
    userId: Symbol("generations.userId"),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/components/dashboard/onboarding-steps", () => ({
  OnboardingSteps: () => null,
}));

// ---------------------------------------------------------------------------
// SUT import
// ---------------------------------------------------------------------------
import DashboardPage from "@/app/dashboard/page";
import { users } from "@/db/schema";
import { DELETED_PLAN } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helper: invoke the page and ignore JSX render errors from node env
// ---------------------------------------------------------------------------
async function invokeDashboardPage(): Promise<void> {
  try {
    await DashboardPage();
  } catch (err) {
    // React is not available in the node test env — the JSX render step throws
    // "React is not defined". All DB interactions happen before that step.
    if (err instanceof ReferenceError && /React/i.test(String(err))) return;
    // redirect() throws — rethrow so callers can assert on it
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockNe.mockClear();
  mockSelectCallCount.value = 0;

  mockAuth.mockResolvedValue({ userId: "clerk_test_user" });
  mockCurrentUser.mockResolvedValue({
    emailAddresses: [{ emailAddress: "test@example.com" }],
  });
  mockRedirect.mockImplementation(() => {
    throw new Error("redirect");
  });

  // Default: INSERT returned a new row — fallback SELECT NOT triggered
  mockDbInsertChain.returning.mockResolvedValue([{ id: "new-user-id" }]);
});

// ---------------------------------------------------------------------------
// Tombstone guard — ADR-009 / issue #36
// ---------------------------------------------------------------------------
describe("tombstone guard", () => {
  it("fallback user lookup WHERE clause uses ne(users.plan, DELETED_PLAN)", async () => {
    // INSERT ON CONFLICT returns no rows → fallback SELECT is triggered
    mockDbInsertChain.returning.mockResolvedValue([]);

    await invokeDashboardPage();

    expect(mockNe, "ne() must be called with users.plan and DELETED_PLAN").toHaveBeenCalledWith(
      users.plan,
      DELETED_PLAN
    );
  });

  it("redirects to /sign-in when tombstoned user is excluded by guard", async () => {
    // INSERT returns no rows (conflict) AND fallback SELECT finds no active user
    // because tombstone guard filtered it out → page must redirect to /sign-in
    mockDbInsertChain.returning.mockResolvedValue([]);
    mockSelectResults.userFallback = [];

    await expect(invokeDashboardPage()).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/sign-in");
  });
});
