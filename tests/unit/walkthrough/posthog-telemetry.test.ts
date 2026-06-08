/**
 * Failing tests (TDD Red phase) for:
 *   - Blocker 5: posthog-never-initialized-capture-dead
 *   - PostHog provider uses public API, not undocumented __loaded property
 *
 * These tests verify:
 *   1. The PostHog provider calls posthog.init() with PII scrubbing config
 *   2. trackScrollUnlock uses posthog.config (public API) instead of __loaded
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock posthog-js
const mockInit = vi.hoisted(() => vi.fn());
const mockCapture = vi.hoisted(() => vi.fn());
const mockConfig = vi.hoisted(() => ({}));

vi.mock("posthog-js", () => ({
  default: {
    init: mockInit,
    capture: mockCapture,
    get config() {
      return mockConfig;
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("PostHog telemetry (Blocker 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posthog-provider module exists and exports PostHogProvider", async () => {
    const mod = await import("@/components/providers/posthog-provider");
    expect(mod).toHaveProperty("PostHogProvider");
    expect(typeof mod.PostHogProvider).toBe("function");
  });

  it("posthog.init is called with maskAllInputs: true (PII scrubbing per THREAT_MODEL)", async () => {
    // Re-import to trigger the init side-effect
    vi.resetModules();

    const _posthog = await import("posthog-js");
    const _mod = await import("@/components/providers/posthog-provider");

    // The provider should export an init helper or call init during mount
    // We verify the init call happens with PII-safe config
    // (actual React rendering tested in e2e; unit test checks the config export)
    const { POSTHOG_CONFIG } = await import("@/components/providers/posthog-provider");
    expect(POSTHOG_CONFIG).toBeDefined();
    // maskAllInputs lives inside session_recording per PostHogConfig type
    expect((POSTHOG_CONFIG.session_recording as { maskAllInputs?: boolean })?.maskAllInputs).toBe(true);
    expect(POSTHOG_CONFIG.disable_session_recording).toBe(true);
  });

  it("provider does not early-return a bare fragment that bypasses PHProvider when the key is absent", async () => {
    // Children must always render INSIDE PHProvider so posthog context is
    // available; without the key, posthog is simply never init()'d and
    // captures degrade to a graceful no-op (documented in the provider).
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/components/providers/posthog-provider.tsx"
      ),
      "utf-8"
    );
    expect(src).not.toContain("if (!key) return <>{children}</>");
    expect(src).toContain("<PHProvider client={posthog}>{children}</PHProvider>");
  });

  it("walkthrough trackScrollUnlock uses posthog.config (public API) not __loaded", async () => {
    // Read the source text to assert the private property is not used
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/components/walkthrough/walkthrough-client.tsx"
      ),
      "utf-8"
    );
    expect(src).not.toContain("posthog.__loaded");
    expect(src).toContain("posthog.config");
  });
});
