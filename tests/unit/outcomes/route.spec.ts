/**
 * Unit tests for the outcomes self-report API (Week 4 "Outcome tracking").
 *
 *   POST /api/outcomes        — submit a weekly self-report
 *   GET  /api/outcomes        — read aggregated weekly series
 *
 * Covers:
 *  - 401 when unauthenticated (FIRST-line auth rule).
 *  - 400 on invalid input.
 *  - 404 when no active user row (tombstone guard).
 *  - 403 when consent has not been granted (revoke must stop collection).
 *  - 201 on a successful self-report.
 *  - 200 with aggregated series on GET.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
const mockResolveActiveUserId = vi.hoisted(() => vi.fn());
const mockHasConsent = vi.hoisted(() => vi.fn());

const mockDbSelectChain = vi.hoisted(() => {
  const orderBy = vi.fn();
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, orderBy };
});

const mockDbInsertChain = vi.hoisted(() => {
  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, returning };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));

vi.mock("@/lib/db/user", () => ({
  resolveActiveUserId: mockResolveActiveUserId,
}));

vi.mock("@/lib/outcomes/consent", () => ({
  hasOutcomeTrackingConsent: mockHasConsent,
}));

vi.mock("@/db/client", () => ({
  db: {
    select: mockDbSelectChain.select,
    insert: mockDbInsertChain.insert,
  },
}));

vi.mock("@/db/schema", () => ({
  outcomes: {
    id: Symbol("outcomes.id"),
    userId: Symbol("outcomes.userId"),
    weekOf: Symbol("outcomes.weekOf"),
    profileViews: Symbol("outcomes.profileViews"),
    searchAppearances: Symbol("outcomes.searchAppearances"),
    recruiterMsgs: Symbol("outcomes.recruiterMsgs"),
    postImpressions: Symbol("outcomes.postImpressions"),
    source: Symbol("outcomes.source"),
  },
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------
import { POST, GET } from "@/app/api/outcomes/route";
import { NextRequest } from "next/server";

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/outcomes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  weekOf: "2026-02-02",
  profileViews: 42,
  searchAppearances: 8,
  recruiterMsgs: 3,
  postImpressions: 1200,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "clerk_test_user" });
  mockResolveActiveUserId.mockResolvedValue("internal-user-uuid");
  mockHasConsent.mockResolvedValue(true);
  mockDbInsertChain.returning.mockResolvedValue([{ id: "outcome-uuid-1" }]);
  mockDbSelectChain.orderBy.mockResolvedValue([]);
});

afterEach(() => {
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// POST — authentication
// ---------------------------------------------------------------------------
describe("POST /api/outcomes — authentication", () => {
  it("returns 401 when userId is missing", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });
});

describe("POST /api/outcomes — validation", () => {
  it("returns 400 when weekOf is missing", async () => {
    const res = await POST(postRequest({ profileViews: 1 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a metric is negative", async () => {
    const res = await POST(postRequest({ ...validBody, profileViews: -1 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/outcomes", {
      method: "POST",
      body: "{not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/outcomes — tombstone guard", () => {
  it("returns 404 when no active user row", async () => {
    mockResolveActiveUserId.mockResolvedValue(null);
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/outcomes — consent gate", () => {
  it("returns 403 when consent has not been granted", async () => {
    mockHasConsent.mockResolvedValue(false);
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("consent_required");
  });

  it("does not insert an outcome row when consent is missing", async () => {
    mockHasConsent.mockResolvedValue(false);
    await POST(postRequest(validBody));
    expect(mockDbInsertChain.insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/outcomes — happy path", () => {
  it("returns 201 with { outcomeId } and stores source self_report", async () => {
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    expect((await res.json()).outcomeId).toBe("outcome-uuid-1");
    expect(mockDbInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "internal-user-uuid",
        weekOf: "2026-02-02",
        profileViews: 42,
        source: "self_report",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// GET — read aggregated series
// ---------------------------------------------------------------------------
describe("GET /api/outcomes — authentication", () => {
  it("returns 401 when userId is missing", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("GET /api/outcomes — happy path", () => {
  it("returns 200 with an aggregated, sorted series", async () => {
    mockDbSelectChain.orderBy.mockResolvedValue([
      {
        weekOf: "2026-01-05",
        profileViews: 10,
        searchAppearances: 2,
        recruiterMsgs: 1,
        postImpressions: 50,
      },
      {
        weekOf: "2026-01-05",
        profileViews: 5,
        searchAppearances: 0,
        recruiterMsgs: 0,
        postImpressions: 0,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Two rows for the same week should be coalesced into one.
    expect(body.series).toHaveLength(1);
    expect(body.series[0].profileViews).toBe(15);
  });

  it("returns 404 when no active user row", async () => {
    mockResolveActiveUserId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });
});
