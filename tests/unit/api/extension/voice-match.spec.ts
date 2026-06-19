/**
 * Unit tests for POST /api/extension/voice-match — the Chrome extension's
 * Voice Match Score endpoint (SPEC §1.4 Tier C, §6.3, §6.5).
 *
 * Contract:
 *   200 { score, components: { cosine, feature } }
 *   400 { error }                         — bad/empty body
 *   401 { error: "unauthorized" }
 *   404 { error: "user_not_found" }       — tombstone-excluded / no row
 *   409 { error: "missing_voice_embedding" } — no persisted voice profile yet
 *
 * Covers (at minimum, per assignment):
 *  - 401 when unauthenticated (FIRST-line auth rule).
 *  - 400 on empty / invalid body.
 *  - 404 when no active user row (tombstone guard).
 *  - 409 when the user has no persisted voice embedding / voice card.
 *  - 200 with the correct { score, components } shape on the happy path.
 *  - OPTIONS preflight is answered for the extension origin, locked down (no `*`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any SUT import
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
const mockResolveActiveUserId = vi.hoisted(() => vi.fn());
const mockComputeVoiceMatch = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));

vi.mock("@/lib/db/user", () => ({
  resolveActiveUserId: mockResolveActiveUserId,
}));

vi.mock("@/lib/extension/voice-match-service", () => ({
  computeVoiceMatch: mockComputeVoiceMatch,
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------
import { POST, OPTIONS } from "@/app/api/extension/voice-match/route";
import { NextRequest } from "next/server";

const EXT_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

function postRequest(body: unknown, origin: string = EXT_ORIGIN): NextRequest {
  return new NextRequest("http://localhost/api/extension/voice-match", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json", origin },
  });
}

const validBody = { profileText: "I build calm, durable systems and ship them." };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "clerk_test_user" });
  mockResolveActiveUserId.mockResolvedValue("internal-user-uuid");
  mockComputeVoiceMatch.mockResolvedValue({
    ok: true,
    value: { score: 87, components: { cosine: 0.91, feature: 0.62 } },
  });
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
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("does not touch the DB or scorer when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await POST(postRequest(validBody));
    expect(mockResolveActiveUserId).not.toHaveBeenCalled();
    expect(mockComputeVoiceMatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Body validation
// ---------------------------------------------------------------------------
describe("body validation", () => {
  it("returns 400 when profileText is missing", async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("returns 400 when profileText is an empty string", async () => {
    const res = await POST(postRequest({ profileText: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when profileText is whitespace only", async () => {
    const res = await POST(postRequest({ profileText: "   \n\t " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when profileText is not a string", async () => {
    const res = await POST(postRequest({ profileText: 42 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(postRequest("{not valid json"));
    expect(res.status).toBe(400);
  });

  it("does not call the scorer on a bad body", async () => {
    await POST(postRequest({}));
    expect(mockComputeVoiceMatch).not.toHaveBeenCalled();
  });

  it("returns 422 when profileText exceeds 50,000 characters", async () => {
    const res = await POST(postRequest({ profileText: "a".repeat(50_001) }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("profileText too large");
  });

  it("does not call the scorer when profileText is too large", async () => {
    await POST(postRequest({ profileText: "a".repeat(50_001) }));
    expect(mockComputeVoiceMatch).not.toHaveBeenCalled();
  });

  it("rejects 50k of whitespace as empty (trimmed validation), not too-large", async () => {
    const res = await POST(postRequest({ profileText: " ".repeat(50_000) }));
    // After trimming this is empty, so it must be a 400 (required), and the
    // scorer must never receive pure whitespace.
    expect(res.status).toBe(400);
    expect(mockComputeVoiceMatch).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before forwarding to the scorer", async () => {
    await POST(postRequest({ profileText: "   hello world   \n" }));
    expect(mockComputeVoiceMatch).toHaveBeenCalledWith(
      "internal-user-uuid",
      "hello world"
    );
  });

  it("measures the 50k limit against the trimmed text", async () => {
    // 50k real chars wrapped in whitespace must still be accepted (trimmed
    // length is exactly 50,000, not over).
    const res = await POST(
      postRequest({ profileText: `  ${"a".repeat(50_000)}  ` })
    );
    expect(res.status).toBe(200);
    expect(mockComputeVoiceMatch).toHaveBeenCalledWith(
      "internal-user-uuid",
      "a".repeat(50_000)
    );
  });
});

// ---------------------------------------------------------------------------
// Tombstone guard
// ---------------------------------------------------------------------------
describe("tombstone guard", () => {
  it("returns 404 when no active user row", async () => {
    mockResolveActiveUserId.mockResolvedValue(null);
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("user_not_found");
  });

  it("does not call the scorer when the user is not found", async () => {
    mockResolveActiveUserId.mockResolvedValue(null);
    await POST(postRequest(validBody));
    expect(mockComputeVoiceMatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Missing voice embedding / voice card
// ---------------------------------------------------------------------------
describe("missing voice profile", () => {
  it("returns 409 when the user has no persisted voice embedding", async () => {
    mockComputeVoiceMatch.mockResolvedValue({
      ok: false,
      error: "missing_voice_embedding",
    });
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("missing_voice_embedding");
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------
describe("happy path", () => {
  it("returns 200 with { score, components } in the contract shape", async () => {
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      score: 87,
      components: { cosine: 0.91, feature: 0.62 },
    });
  });

  it("forwards the user id and profile text to the scorer", async () => {
    await POST(postRequest(validBody));
    expect(mockComputeVoiceMatch).toHaveBeenCalledWith(
      "internal-user-uuid",
      validBody.profileText
    );
  });
});

// ---------------------------------------------------------------------------
// CORS — locked to the chrome-extension origin, never `*`
// ---------------------------------------------------------------------------
describe("CORS posture", () => {
  it("answers an OPTIONS preflight from a chrome-extension origin (204)", async () => {
    const req = new NextRequest("http://localhost/api/extension/voice-match", {
      method: "OPTIONS",
      headers: { origin: EXT_ORIGIN },
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("never reflects a wildcard origin on preflight", async () => {
    const req = new NextRequest("http://localhost/api/extension/voice-match", {
      method: "OPTIONS",
      headers: { origin: EXT_ORIGIN },
    });
    const res = await OPTIONS(req);
    expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
  });

  it("does not echo a non-extension origin (no allow-origin header)", async () => {
    const req = new NextRequest("http://localhost/api/extension/voice-match", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.com" },
    });
    const res = await OPTIONS(req);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("reflects the extension origin on a successful POST response", async () => {
    const res = await POST(postRequest(validBody));
    expect(res.headers.get("access-control-allow-origin")).toBe(EXT_ORIGIN);
    expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
  });
});
