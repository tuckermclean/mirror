import { describe, it, expect } from "vitest";

describe("runtime dependency smoke tests", () => {
  it("stripe imports and exposes a constructor", async () => {
    const mod = await import("stripe");
    expect(mod.default).toBeDefined();
  });

  it("framer-motion exports motion", async () => {
    const mod = await import("framer-motion");
    expect(mod.motion).toBeDefined();
  });

  it("posthog-js/react exports PostHogProvider", async () => {
    const mod = await import("posthog-js/react");
    expect(mod.PostHogProvider).toBeDefined();
  });

  it("ioredis exports a Redis constructor", async () => {
    const mod = await import("ioredis");
    expect(mod.default).toBeDefined();
  });

  it("libsodium-wrappers exports ready promise", async () => {
    const sodium = await import("libsodium-wrappers");
    expect(sodium.default).toBeDefined();
    expect(sodium.default.ready).toBeDefined();
  });

  it("voyageai exports VoyageAIClient", async () => {
    const mod = await import("voyageai");
    expect(mod.VoyageAIClient).toBeDefined();
  });

  it("drizzle-orm pg-core exposes pgTable helper", async () => {
    const mod = await import("drizzle-orm/pg-core");
    expect(mod.pgTable).toBeDefined();
  });
});
