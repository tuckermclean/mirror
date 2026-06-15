/**
 * Unit tests for the getVoiceMatch API client.
 *
 * All tests follow TDD: these were written BEFORE the fixes were applied
 * (e.g. AbortSignal.timeout, credential checks). We mock `fetch` via
 * `vi.fn()` passed as `init.fetchImpl` — no global stubbing needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVoiceMatch } from "../lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(
  status: number,
  body: unknown,
): Response {
  return {
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeJsonErrorResponse(status: number): Response {
  return makeResponse(status, { error: `mock_error_${status}` });
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("getVoiceMatch — 200 success", () => {
  it("returns ok:true with score and components", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, {
        score: 87,
        components: { cosine: 0.82, feature: 0.91 },
      }),
    );

    const result = await getVoiceMatch("Some profile text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.score).toBe(87);
    expect(result.data.components.cosine).toBe(0.82);
    expect(result.data.components.feature).toBe(0.91);
  });
});

// ---------------------------------------------------------------------------
// Error response codes
// ---------------------------------------------------------------------------

describe("getVoiceMatch — 401 unauthorized", () => {
  it("returns ok:false with code 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeJsonErrorResponse(401));

    const result = await getVoiceMatch("text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(401);
  });
});

describe("getVoiceMatch — 402 spend cap", () => {
  it("returns ok:false with code 402", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeJsonErrorResponse(402));

    const result = await getVoiceMatch("text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(402);
  });
});

describe("getVoiceMatch — 409 no voice profile", () => {
  it("returns ok:false with code 409", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeJsonErrorResponse(409));

    const result = await getVoiceMatch("text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Network / transport errors
// ---------------------------------------------------------------------------

describe("getVoiceMatch — network error", () => {
  it("returns ok:false with code 'network' when fetch rejects", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await getVoiceMatch("text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("network");
  });

  it("returns ok:false with code 'network' for AbortError (timeout)", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    const mockFetch = vi.fn().mockRejectedValue(abortError);

    const result = await getVoiceMatch("text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("network");
  });
});

// ---------------------------------------------------------------------------
// JSON parse error on 200
// ---------------------------------------------------------------------------

describe("getVoiceMatch — JSON parse failure on 200 body", () => {
  it("returns ok:false with code 'network' when 200 body is not valid JSON", async () => {
    const badResponse = {
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response;

    const mockFetch = vi.fn().mockResolvedValue(badResponse);

    const result = await getVoiceMatch("text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("network");
  });
});

// ---------------------------------------------------------------------------
// credentials: "include"
// ---------------------------------------------------------------------------

describe("getVoiceMatch — fetch call options", () => {
  it("sends credentials: 'include' on every request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { score: 42, components: { cosine: 0.5, feature: 0.5 } }),
    );

    await getVoiceMatch("profile text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
  });

  it("POSTs to the correct endpoint with the profileText in the body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { score: 42, components: { cosine: 0.5, feature: 0.5 } }),
    );

    await getVoiceMatch("my profile text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.example.com/api/extension/voice-match");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ profileText: "my profile text" });
  });
});

// ---------------------------------------------------------------------------
// AbortSignal / timeout (S5)
// ---------------------------------------------------------------------------

describe("getVoiceMatch — AbortSignal timeout", () => {
  it("passes an AbortSignal to the fetch call", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeResponse(200, { score: 50, components: { cosine: 0.5, feature: 0.5 } }),
    );

    await getVoiceMatch("text", {
      fetchImpl: mockFetch,
      apiBase: "https://test.example.com",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeDefined();
  });
});
