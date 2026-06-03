/**
 * Unit tests for src/lib/r2.ts — lazy S3Client singleton.
 *
 * vi.resetModules() before each test gives a fresh module so the singleton
 * can be exercised with different env-var combinations.
 * Assertions use constructor.name / error.name rather than instanceof to
 * avoid class-identity mismatches introduced by vi.resetModules().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ALL_VARS = {
  R2_ENDPOINT: "https://abc123.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "test-access-key-id",
  R2_SECRET_ACCESS_KEY: "test-secret-access-key",
  R2_BUCKET_NAME: "test-bucket",
};

describe("r2 module", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getR2Client()", () => {
    it("returns an S3Client when all required env vars are present", async () => {
      for (const [k, v] of Object.entries(ALL_VARS)) vi.stubEnv(k, v);
      const { getR2Client } = await import("@/lib/r2");
      const client = getR2Client();
      expect(client.constructor.name).toBe("S3Client");
    });

    it("returns the same instance on repeated calls (singleton)", async () => {
      for (const [k, v] of Object.entries(ALL_VARS)) vi.stubEnv(k, v);
      const { getR2Client } = await import("@/lib/r2");
      expect(getR2Client()).toBe(getR2Client());
    });

    for (const missing of Object.keys(ALL_VARS)) {
      it(`throws ConfigurationError when ${missing} is absent`, async () => {
        for (const [k, v] of Object.entries(ALL_VARS)) {
          if (k !== missing) vi.stubEnv(k, v);
        }
        const { getR2Client } = await import("@/lib/r2");
        let caught: unknown;
        try {
          getR2Client();
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeDefined();
        expect((caught as Error).name).toBe("ConfigurationError");
      });
    }
  });

  describe("getR2Bucket()", () => {
    it("returns the R2_BUCKET_NAME env var value", async () => {
      for (const [k, v] of Object.entries(ALL_VARS)) vi.stubEnv(k, v);
      const { getR2Bucket } = await import("@/lib/r2");
      expect(getR2Bucket()).toBe(ALL_VARS.R2_BUCKET_NAME);
    });
  });
});
