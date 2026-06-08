/**
 * Unit tests for the outcome-tracking consent API (Week 4 "Outcome tracking",
 * COMPLIANCE.md §2.2 — consent is the lawful basis for outcome data).
 *
 *   POST   /api/outcomes/consent  — grant consent
 *   DELETE /api/outcomes/consent  — revoke consent (must stop collection)
 *   GET    /api/outcomes/consent  — read current consent state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
const mockResolveActiveUserId = vi.hoisted(() => vi.fn());
const mockGrant = vi.hoisted(() => vi.fn());
const mockRevoke = vi.hoisted(() => vi.fn());
const mockHasConsent = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));

vi.mock("@/lib/db/user", () => ({
  resolveActiveUserId: mockResolveActiveUserId,
}));

vi.mock("@/lib/outcomes/consent", () => ({
  grantOutcomeTrackingConsent: mockGrant,
  revokeOutcomeTrackingConsent: mockRevoke,
  hasOutcomeTrackingConsent: mockHasConsent,
}));

import { POST, DELETE, GET } from "@/app/api/outcomes/consent/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "clerk_test_user" });
  mockResolveActiveUserId.mockResolvedValue("internal-user-uuid");
  mockGrant.mockResolvedValue(new Date("2026-02-01T00:00:00.000Z"));
  mockRevoke.mockResolvedValue(undefined);
  mockHasConsent.mockResolvedValue(false);
});

afterEach(() => {
  vi.resetModules();
});

describe("POST /api/outcomes/consent — grant", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 404 when no active user row", async () => {
    mockResolveActiveUserId.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("grants consent and returns 200 with { consented: true }", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consented).toBe(true);
    expect(mockGrant).toHaveBeenCalledWith("internal-user-uuid");
  });
});

describe("DELETE /api/outcomes/consent — revoke", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("revokes consent and returns 200 with { consented: false }", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consented).toBe(false);
    expect(mockRevoke).toHaveBeenCalledWith("internal-user-uuid");
  });
});

describe("GET /api/outcomes/consent — read state", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("reflects the current consent state", async () => {
    mockHasConsent.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).consented).toBe(true);
  });
});
