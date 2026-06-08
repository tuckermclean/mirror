/**
 * Unit tests for worker/inngest-client.js
 *
 * Verifies that a single shared Inngest client is exported with the correct
 * configuration, and that it picks up env vars for event key and signing key.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// Mock the SDK so we can inspect constructor arguments without a live instance.
vi.mock("inngest", () => {
  class MockInngest {
    public readonly id: string;
    public readonly eventKey: string | undefined;
    public readonly signingKey: string | undefined;
    public readonly isDev: boolean | undefined;
    constructor(opts: {
      id: string;
      eventKey?: string;
      signingKey?: string;
      isDev?: boolean;
    }) {
      this.id = opts.id;
      this.eventKey = opts.eventKey;
      this.signingKey = opts.signingKey;
      this.isDev = opts.isDev;
    }
  }
  return { Inngest: MockInngest };
});

describe("worker/inngest-client — shared Inngest instance", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env["INNGEST_EVENT_KEY"];
    delete process.env["INNGEST_SIGNING_KEY"];
  });

  afterEach(() => {
    delete process.env["INNGEST_EVENT_KEY"];
    delete process.env["INNGEST_SIGNING_KEY"];
  });

  it("exports a single inngest client with id 'mirror'", async () => {
    const { inngest } = await import("../../../worker/inngest-client.js");
    expect((inngest as unknown as { id: string }).id).toBe("mirror");
  });

  it("picks up INNGEST_EVENT_KEY from the environment", async () => {
    process.env["INNGEST_EVENT_KEY"] = "worker-event-key";
    const { inngest } = await import("../../../worker/inngest-client.js");
    expect((inngest as unknown as { eventKey: string }).eventKey).toBe(
      "worker-event-key"
    );
  });

  it("picks up INNGEST_SIGNING_KEY from the environment", async () => {
    process.env["INNGEST_SIGNING_KEY"] = "worker-signing-key";
    const { inngest } = await import("../../../worker/inngest-client.js");
    expect((inngest as unknown as { signingKey: string }).signingKey).toBe(
      "worker-signing-key"
    );
  });

  it("sets isDev:true when no signing key is configured", async () => {
    const { inngest } = await import("../../../worker/inngest-client.js");
    expect((inngest as unknown as { isDev: boolean }).isDev).toBe(true);
  });
});
