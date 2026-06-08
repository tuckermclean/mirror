/**
 * Unit tests for worker/inngest-functions.js
 *
 * Verifies:
 *   - Blocker 1/7: decrypt + scrape merged into a single step.run so the
 *     plaintext cookie is never returned from a step (never serialised).
 *   - Blocker 9: step.sendEvent() used for deduplication instead of
 *     step.run("emit-snapshot-created") wrapping inngest.send().
 *   - Suggestion 3: persistSnapshot fetch has an AbortSignal timeout.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDecryptCookie = vi.hoisted(() => vi.fn());
const mockScrapeLinkedInProfile = vi.hoisted(() => vi.fn());

vi.mock("../../../worker/crypto.js", () => ({
  decryptCookie: mockDecryptCookie,
}));

vi.mock("../../../worker/scraper.js", () => ({
  scrapeLinkedInProfile: mockScrapeLinkedInProfile,
}));

// We don't mock inngest-client here — we only import the function definition
// and call it with a fully-stubbed { event, step } harness.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Inngest step harness that records calls and forwards to
 * the provided handler implementations.
 */
function makeStep(handlers: {
  run?: (id: string, fn: () => unknown) => unknown;
  sendEvent?: (id: string, event: unknown) => unknown;
}) {
  const calls: { method: string; id: string }[] = [];

  return {
    calls,
    run: vi.fn(async (id: string, fn: () => unknown) => {
      calls.push({ method: "run", id });
      if (handlers.run) return handlers.run(id, fn);
      return fn();
    }),
    sendEvent: vi.fn(async (id: string, event: unknown) => {
      calls.push({ method: "sendEvent", id });
      if (handlers.sendEvent) return handlers.sendEvent(id, event);
      return undefined;
    }),
  };
}

const parsedFixture = {
  name: "Jane Doe",
  headline: "Engineer",
  about: "",
  experience: [],
  skills: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("worker/inngest-functions — scrape-linkedin-profile", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDecryptCookie.mockClear();
    mockScrapeLinkedInProfile.mockClear();

    mockDecryptCookie.mockResolvedValue("plaintext-li_at");
    mockScrapeLinkedInProfile.mockResolvedValue(parsedFixture);

    process.env["INTERNAL_API_SECRET"] = "test-internal-secret";
    process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";
  });

  afterEach(() => {
    delete process.env["INTERNAL_API_SECRET"];
    delete process.env["NEXT_PUBLIC_APP_URL"];
    vi.restoreAllMocks();
  });

  it("decrypt and scrape are performed inside a SINGLE step.run (not separate steps)", async () => {
    // If decrypt and scrape are in separate steps, step.run would be called
    // with "decrypt-cookie" and "scrape-profile" as distinct IDs. After the
    // fix they must be combined into one step (e.g. "decrypt-and-scrape").
    const stepRunIds: string[] = [];

    // Stub fetch so persistSnapshot doesn't fail
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ snapshotId: "snap-1" }),
      })
    );

    const step = {
      run: vi.fn(async (id: string, fn: () => unknown) => {
        stepRunIds.push(id);
        return fn();
      }),
      sendEvent: vi.fn().mockResolvedValue(undefined),
    };

    const { scrapeLinkedInProfileFn } = await import(
      "../../../worker/inngest-functions.js"
    );

    await (scrapeLinkedInProfileFn as unknown as {
      fn: (ctx: {
        event: { data: Record<string, string> };
        step: typeof step;
      }) => Promise<unknown>;
    }).fn({
      event: {
        data: {
          userId: "user-1",
          profileUrl: "https://www.linkedin.com/in/janedoe",
          encryptedCookie: "enc-cookie-abc",
        },
      },
      step,
    });

    // "decrypt-cookie" and "scrape-profile" must NOT both appear as separate step IDs
    const hasDecryptStep = stepRunIds.includes("decrypt-cookie");
    const hasScrapeStep = stepRunIds.includes("scrape-profile");
    expect(
      hasDecryptStep && hasScrapeStep,
      "decrypt and scrape must be merged into a single step, not two separate steps"
    ).toBe(false);
  });

  it("the plaintext cookie value is NOT returned from any step.run call", async () => {
    const stepReturnValues: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ snapshotId: "snap-2" }),
      })
    );

    const step = {
      run: vi.fn(async (_id: string, fn: () => unknown) => {
        const val = await fn();
        stepReturnValues.push(val);
        return val;
      }),
      sendEvent: vi.fn().mockResolvedValue(undefined),
    };

    const { scrapeLinkedInProfileFn } = await import(
      "../../../worker/inngest-functions.js"
    );

    await (scrapeLinkedInProfileFn as unknown as {
      fn: (ctx: {
        event: { data: Record<string, string> };
        step: typeof step;
      }) => Promise<unknown>;
    }).fn({
      event: {
        data: {
          userId: "user-1",
          profileUrl: "https://www.linkedin.com/in/janedoe",
          encryptedCookie: "enc-cookie-abc",
        },
      },
      step,
    });

    // The plaintext cookie must never be a return value from step.run
    const plaintext = "plaintext-li_at";
    for (const val of stepReturnValues) {
      expect(JSON.stringify(val)).not.toContain(plaintext);
    }
  });

  it("uses step.sendEvent() to emit snapshot-created (not step.run wrapping inngest.send)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ snapshotId: "snap-3" }),
      })
    );

    const step = makeStep({});

    const { scrapeLinkedInProfileFn } = await import(
      "../../../worker/inngest-functions.js"
    );

    await (scrapeLinkedInProfileFn as unknown as {
      fn: (ctx: {
        event: { data: Record<string, string> };
        step: ReturnType<typeof makeStep>;
      }) => Promise<unknown>;
    }).fn({
      event: {
        data: {
          userId: "user-1",
          profileUrl: "https://www.linkedin.com/in/janedoe",
          encryptedCookie: "enc-cookie-abc",
        },
      },
      step,
    });

    // step.sendEvent must be called (Inngest v3+ deduplication pattern)
    expect(step.sendEvent).toHaveBeenCalled();

    // step.run must NOT be called with an "emit-" prefixed id
    const emitRunCalls = step.calls.filter(
      (c) => c.method === "run" && c.id.startsWith("emit-")
    );
    expect(
      emitRunCalls.length,
      "step.run must not be used for event emission — use step.sendEvent instead"
    ).toBe(0);
  });

  it("persistSnapshot passes AbortSignal.timeout(15000) to fetch", async () => {
    const fetchCalls: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        fetchCalls.push(init);
        return Promise.resolve({
          ok: true,
          json: async () => ({ snapshotId: "snap-4" }),
        });
      })
    );

    const step = makeStep({});

    const { scrapeLinkedInProfileFn } = await import(
      "../../../worker/inngest-functions.js"
    );

    await (scrapeLinkedInProfileFn as unknown as {
      fn: (ctx: {
        event: { data: Record<string, string> };
        step: ReturnType<typeof makeStep>;
      }) => Promise<unknown>;
    }).fn({
      event: {
        data: {
          userId: "user-1",
          profileUrl: "https://www.linkedin.com/in/janedoe",
          encryptedCookie: "enc-cookie-abc",
        },
      },
      step,
    });

    expect(fetchCalls.length).toBeGreaterThan(0);
    const fetchInit = fetchCalls[0];
    // The signal must be present and be an AbortSignal
    expect(fetchInit?.signal).toBeDefined();
    expect(fetchInit?.signal).toBeInstanceOf(AbortSignal);
  });
});
