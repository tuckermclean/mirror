/**
 * Unit tests for resolveUserOr401Or404().
 *
 * The function lives in src/lib/api/resolve-user.ts and is shared across all
 * route handlers that need to map a Clerk userId to the internal users table.
 *
 * DB is fully mocked — no DATABASE_URL needed.
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must appear before the SUT import so vi.mock hoisting works.
// ---------------------------------------------------------------------------

const mockResolveActiveUserId = vi.hoisted(() => vi.fn<[], Promise<string | null>>());

vi.mock("@/lib/db/user", () => ({
  resolveActiveUserId: mockResolveActiveUserId,
}));

import { resolveUserOr401Or404 } from "@/lib/api/resolve-user";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveUserOr401Or404", () => {
  it("returns 401 when clerkUserId is null", async () => {
    const result = await resolveUserOr401Or404(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      expect(result.response.status).toBe(401);
      expect(body).toEqual({ error: "unauthorized" });
    }
  });

  it("returns 401 when clerkUserId is undefined", async () => {
    const result = await resolveUserOr401Or404(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      expect(result.response.status).toBe(401);
      expect(body).toEqual({ error: "unauthorized" });
    }
  });

  it("returns 401 when clerkUserId is an empty string", async () => {
    const result = await resolveUserOr401Or404("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      expect(result.response.status).toBe(401);
      expect(body).toEqual({ error: "unauthorized" });
    }
  });

  it("returns 404 when resolveActiveUserId returns null (no active user row)", async () => {
    mockResolveActiveUserId.mockResolvedValueOnce(null);
    const result = await resolveUserOr401Or404("clerk_abc123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      expect(result.response.status).toBe(404);
      expect(body).toEqual({ error: "user_not_found" });
    }
    expect(mockResolveActiveUserId).toHaveBeenCalledWith("clerk_abc123");
  });

  it("returns ok=true with the internal userId when user is found", async () => {
    mockResolveActiveUserId.mockResolvedValueOnce("internal-user-uuid");
    const result = await resolveUserOr401Or404("clerk_abc123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("internal-user-uuid");
    }
  });

  it("passes the clerkUserId through to resolveActiveUserId", async () => {
    mockResolveActiveUserId.mockResolvedValueOnce("some-uuid");
    await resolveUserOr401Or404("clerk_xyz999");
    expect(mockResolveActiveUserId).toHaveBeenCalledWith("clerk_xyz999");
  });

  it("propagates unexpected errors from resolveActiveUserId", async () => {
    mockResolveActiveUserId.mockRejectedValueOnce(new Error("DB timeout"));
    await expect(resolveUserOr401Or404("clerk_abc")).rejects.toThrow("DB timeout");
  });
});
