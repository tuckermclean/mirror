// Unit tests — Inngest client config pass-through only (app id, event key, signing key).
//
// Scope: does the client correctly forward env vars to the Inngest constructor?
// SDK behaviour (e.g. the isDev fallback when no signing key is set) is covered by
// the real-SDK integration test at tests/integration/inngest/route.spec.ts.
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// Mock the SDK so we can inspect constructor arguments without a live Inngest instance.
vi.mock("inngest", () => {
  class MockInngest {
    public readonly id: string;
    public readonly eventKey: string | undefined;
    public readonly signingKey: string | undefined;
    constructor(opts: { id: string; eventKey?: string; signingKey?: string }) {
      this.id = opts.id;
      this.eventKey = opts.eventKey;
      this.signingKey = opts.signingKey;
    }
  }
  return { Inngest: MockInngest };
});

describe("Inngest client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env["INNGEST_EVENT_KEY"];
    delete process.env["INNGEST_SIGNING_KEY"];
  });

  it("is configured with app id 'mirror'", async () => {
    const { inngest } = await import("@/lib/inngest/client");
    expect((inngest as unknown as { id: string }).id).toBe("mirror");
  });

  it("picks up INNGEST_EVENT_KEY from the environment", async () => {
    process.env["INNGEST_EVENT_KEY"] = "test-event-key";
    const { inngest } = await import("@/lib/inngest/client");
    expect((inngest as unknown as { eventKey: string }).eventKey).toBe(
      "test-event-key"
    );
  });

  it("picks up INNGEST_SIGNING_KEY from the environment", async () => {
    process.env["INNGEST_SIGNING_KEY"] = "test-signing-key";
    const { inngest } = await import("@/lib/inngest/client");
    expect((inngest as unknown as { signingKey: string }).signingKey).toBe(
      "test-signing-key"
    );
  });
});
