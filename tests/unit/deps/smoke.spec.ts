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

  // @types/libsodium-wrappers is intentionally absent from devDependencies:
  // libsodium-wrappers@0.8.4 ships its own TypeScript declarations via the
  // "types" field in its package.json ("dist/modules/libsodium-wrappers.d.ts").
  // The @types/ stub is deprecated and redundant — adding it would print a
  // deprecation warning on every `pnpm install`.
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
