import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const FULL_ENV = {
  R2_ENDPOINT: "https://test.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "test-access-key-id",
  R2_SECRET_ACCESS_KEY: "test-secret-access-key",
  R2_BUCKET_NAME: "test-bucket",
};

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ _isMockS3Client: true })),
}));

describe("r2 module", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of Object.keys(FULL_ENV)) {
      savedEnv[key] = process.env[key];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("importing the module does NOT throw when env vars are absent", async () => {
    for (const key of Object.keys(FULL_ENV)) delete process.env[key];
    await expect(import("@/lib/r2")).resolves.toBeDefined();
  });

  it("getR2() returns a non-null S3Client when all env vars are set", async () => {
    Object.assign(process.env, FULL_ENV);
    const { getR2 } = await import("@/lib/r2");
    expect(getR2()).toBeDefined();
  });

  it("getR2Bucket() returns the env var value when all env vars are set", async () => {
    Object.assign(process.env, FULL_ENV);
    const { getR2Bucket } = await import("@/lib/r2");
    expect(getR2Bucket()).toBe("test-bucket");
  });

  it.each(Object.keys(FULL_ENV))(
    "getR2() throws ConfigurationError when %s is missing",
    async (missingKey) => {
      Object.assign(process.env, FULL_ENV);
      delete process.env[missingKey];
      const { getR2 } = await import("@/lib/r2");
      expect(() => getR2()).toThrow(
        expect.objectContaining({ name: "ConfigurationError" })
      );
    }
  );
});
