import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    public readonly config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  }
  return { S3Client: MockS3Client };
});

describe("R2 client module", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env["R2_ENDPOINT"] = "https://test.r2.cloudflarestorage.com";
    process.env["R2_ACCESS_KEY_ID"] = "test-access-key";
    process.env["R2_SECRET_ACCESS_KEY"] = "test-secret-key";
    process.env["R2_BUCKET_NAME"] = "test-bucket";
  });

  afterEach(() => {
    delete process.env["R2_ENDPOINT"];
    delete process.env["R2_ACCESS_KEY_ID"];
    delete process.env["R2_SECRET_ACCESS_KEY"];
    delete process.env["R2_BUCKET_NAME"];
  });

  it("exports a singleton r2 S3Client", async () => {
    const { r2 } = await import("@/lib/r2");
    const { S3Client } = await import("@aws-sdk/client-s3");
    expect(r2).toBeInstanceOf(S3Client);
  });

  it("configures the client with auto region", async () => {
    const { r2 } = await import("@/lib/r2");
    const config = (r2 as unknown as { config: Record<string, unknown> }).config;
    expect(config["region"]).toBe("auto");
  });

  it("passes the R2_ENDPOINT env var as endpoint", async () => {
    const { r2 } = await import("@/lib/r2");
    const config = (r2 as unknown as { config: Record<string, unknown> }).config;
    expect(config["endpoint"]).toBe("https://test.r2.cloudflarestorage.com");
  });

  it("exports R2_BUCKET as a string matching R2_BUCKET_NAME env var", async () => {
    const { R2_BUCKET } = await import("@/lib/r2");
    expect(R2_BUCKET).toBe("test-bucket");
  });
});
