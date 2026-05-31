// Unit tests — Inngest client config (app id, event key, signing key). SDK mocked.
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// Capture the runner's CI env value so afterEach can restore it.
const originalCI = process.env["CI"];

// Mock Inngest SDK so we don't need a real INNGEST_EVENT_KEY in the test env.
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
    delete process.env["NEXT_PHASE"];
    if (originalCI === undefined) {
      delete process.env["CI"];
    } else {
      process.env["CI"] = originalCI;
    }
    Object.assign(process.env, { NODE_ENV: "test" });
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

  it("does not throw at build time (NEXT_PHASE=phase-production-build) even when signing key is absent", async () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
    });
    delete process.env["INNGEST_SIGNING_KEY"];
    await expect(import("@/lib/inngest/client")).resolves.toBeDefined();
  });

  it("does not throw in CI environments even when signing key is absent", async () => {
    Object.assign(process.env, { NODE_ENV: "production", CI: "true" });
    delete process.env["INNGEST_SIGNING_KEY"];
    await expect(import("@/lib/inngest/client")).resolves.toBeDefined();
  });

  it("throws ConfigurationError at module load in production when INNGEST_SIGNING_KEY is absent", async () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env["CI"]; // ensure guard fires even when tests run in CI
    delete process.env["INNGEST_SIGNING_KEY"];
    // Import errors first to populate the shared module cache so that the
    // ConfigurationError thrown by client.ts is the same class reference.
    const { ConfigurationError } = await import("@/lib/errors");
    const promise = import("@/lib/inngest/client");
    await expect(promise).rejects.toThrow(
      "INNGEST_SIGNING_KEY must be set in production"
    );
    await expect(promise).rejects.toBeInstanceOf(ConfigurationError);
  });
});
