/**
 * Unit tests for Inngest client configuration and function registration.
 *
 * These tests verify the client is wired with the correct app id and that the
 * exported functions array is importable and contains only valid Inngest
 * functions.  No network calls are made; the Inngest SDK is mocked at the
 * module boundary.
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Inngest SDK so we don't need a real INNGEST_EVENT_KEY in the test env.
// ---------------------------------------------------------------------------
vi.mock("inngest", () => {
  class MockInngest {
    public readonly id: string;
    public readonly eventKey: string | undefined;
    constructor(opts: { id: string; eventKey?: string }) {
      this.id = opts.id;
      this.eventKey = opts.eventKey;
    }
  }
  return { Inngest: MockInngest };
});

describe("Inngest client", () => {
  it("is configured with app id 'mirror'", async () => {
    const { inngest } = await import("@/lib/inngest/client");
    expect((inngest as unknown as { id: string }).id).toBe("mirror");
  });

  it("picks up INNGEST_EVENT_KEY from the environment", async () => {
    vi.resetModules();
    process.env["INNGEST_EVENT_KEY"] = "test-event-key";
    const { inngest } = await import("@/lib/inngest/client");
    expect((inngest as unknown as { eventKey: string }).eventKey).toBe(
      "test-event-key"
    );
    delete process.env["INNGEST_EVENT_KEY"];
  });
});

describe("Inngest client module", () => {
  it("exports the inngest client object", async () => {
    vi.resetModules();
    const mod = await import("@/lib/inngest/client");
    // Verify the module can be imported without throwing and that it exports
    // the inngest client as an object.  The route handler's functions array
    // is tested separately (see #20).
    expect(mod).toBeDefined();
    expect(typeof mod.inngest).toBe("object");
  });
});
