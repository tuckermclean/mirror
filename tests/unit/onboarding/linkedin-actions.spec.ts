/**
 * Unit tests for src/app/onboarding/linkedin/_actions.ts
 *
 * Covers all branches of submitLinkedInForm:
 *   - unauthenticated user
 *   - missing profile URL
 *   - invalid profile URL (not a linkedin.com/in/ URL)
 *   - valid URL, no cookie → dispatches event without encryptedCookie
 *   - valid URL, cookie present → encrypts and dispatches
 *   - inngest.send failure → propagates the error
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before any SUT import
// ---------------------------------------------------------------------------
const mockAuth = vi.hoisted(() => vi.fn());
const mockInngestSend = vi.hoisted(() => vi.fn());
const mockEncryptCookie = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
}));

// Mock the real crypto module — unit tests must not touch libsodium
vi.mock("@/lib/crypto/cookie", () => ({
  encryptCookie: mockEncryptCookie,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// SUT import
// ---------------------------------------------------------------------------
import { submitLinkedInForm } from "@/app/onboarding/linkedin/_actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const VALID_URL = "https://www.linkedin.com/in/johndoe";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "clerk_user_123" });
  mockInngestSend.mockResolvedValue(undefined);
  mockEncryptCookie.mockResolvedValue("encrypted-token");
});

// ---------------------------------------------------------------------------
// Unauthenticated branch (Blocker 3)
// ---------------------------------------------------------------------------
describe("unauthenticated", () => {
  it("returns { success: false, error: 'Unauthenticated' } when userId is null", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const result = await submitLinkedInForm(makeFormData({ profileUrl: VALID_URL }));
    expect(result).toEqual({ success: false, error: "Unauthenticated" });
  });

  it("does NOT throw when userId is null", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await expect(submitLinkedInForm(makeFormData({ profileUrl: VALID_URL }))).resolves.toBeDefined();
  });

  it("does NOT call inngest.send when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await submitLinkedInForm(makeFormData({ profileUrl: VALID_URL }));
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Missing / invalid profileUrl branches (Blocker 4 + Suggestion 2)
// ---------------------------------------------------------------------------
describe("profileUrl validation", () => {
  it("returns an error when profileUrl is empty", async () => {
    const result = await submitLinkedInForm(makeFormData({ profileUrl: "" }));
    expect(result).toEqual({ success: false, error: "LinkedIn profile URL is required." });
  });

  it("returns an error when profileUrl is whitespace only", async () => {
    const result = await submitLinkedInForm(makeFormData({ profileUrl: "   " }));
    expect(result).toEqual({ success: false, error: "LinkedIn profile URL is required." });
  });

  it("returns an error for a non-LinkedIn URL (Suggestion 2)", async () => {
    const result = await submitLinkedInForm(
      makeFormData({ profileUrl: "https://evil.example.com/scrape-me" })
    );
    expect(result).toMatchObject({ success: false });
    expect((result as { success: false; error: string }).error).toMatch(/linkedin\.com\/in\//i);
  });

  it("returns an error for a LinkedIn URL that is not a /in/ profile (Suggestion 2)", async () => {
    const result = await submitLinkedInForm(
      makeFormData({ profileUrl: "https://www.linkedin.com/jobs/123" })
    );
    expect(result).toMatchObject({ success: false });
  });

  it("does NOT call inngest.send for an invalid URL", async () => {
    await submitLinkedInForm(
      makeFormData({ profileUrl: "https://evil.example.com/scrape-me" })
    );
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path — no cookie
// ---------------------------------------------------------------------------
describe("valid URL, no cookie", () => {
  it("dispatches the inngest event with encryptedCookie: null", async () => {
    const result = await submitLinkedInForm(makeFormData({ profileUrl: VALID_URL }));
    expect(result).toEqual({ success: true });
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "mirror/linkedin.scrape.requested",
      data: { userId: "clerk_user_123", profileUrl: VALID_URL, encryptedCookie: null },
    });
  });

  it("does NOT call encryptCookie when cookie is absent", async () => {
    await submitLinkedInForm(makeFormData({ profileUrl: VALID_URL }));
    expect(mockEncryptCookie).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path — cookie present (Blocker 2 exercises the real import path)
// ---------------------------------------------------------------------------
describe("valid URL, cookie present", () => {
  it("encrypts the cookie and dispatches the inngest event", async () => {
    mockEncryptCookie.mockResolvedValue("encrypted-token-xyz");
    const result = await submitLinkedInForm(
      makeFormData({ profileUrl: VALID_URL, sessionCookie: "li_at_raw_value" })
    );
    expect(result).toEqual({ success: true });
    expect(mockEncryptCookie).toHaveBeenCalledWith("li_at_raw_value");
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "mirror/linkedin.scrape.requested",
      data: {
        userId: "clerk_user_123",
        profileUrl: VALID_URL,
        encryptedCookie: "encrypted-token-xyz",
      },
    });
  });

  it("returns an error (does not throw) when encryption fails", async () => {
    mockEncryptCookie.mockRejectedValue(new Error("sodium not ready"));
    const result = await submitLinkedInForm(
      makeFormData({ profileUrl: VALID_URL, sessionCookie: "li_at_raw_value" })
    );
    expect(result).toMatchObject({ success: false });
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("logs an error (not the raw cookie) when encryption fails", async () => {
    mockEncryptCookie.mockRejectedValue(new Error("sodium not ready"));
    await submitLinkedInForm(
      makeFormData({ profileUrl: VALID_URL, sessionCookie: "li_at_raw_value" })
    );
    expect(mockLoggerError).toHaveBeenCalled();
    // The raw cookie must never appear in logger args
    const logArgs = JSON.stringify(mockLoggerError.mock.calls);
    expect(logArgs).not.toContain("li_at_raw_value");
  });
});

// ---------------------------------------------------------------------------
// inngest.send failure
// ---------------------------------------------------------------------------
describe("inngest.send failure", () => {
  it("propagates the error when inngest.send throws", async () => {
    mockInngestSend.mockRejectedValue(new Error("inngest unreachable"));
    await expect(
      submitLinkedInForm(makeFormData({ profileUrl: VALID_URL }))
    ).rejects.toThrow("inngest unreachable");
  });
});
