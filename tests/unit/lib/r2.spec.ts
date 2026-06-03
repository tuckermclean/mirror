/**
 * Unit tests for src/lib/r2.ts — RED phase per TDD.
 *
 * Verifies that the module exports a singleton S3Client and a bucket name.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const MockS3Client = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: Record<string, unknown>, opts: unknown) {
    this.opts = opts;
  })
);

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: MockS3Client,
  PutObjectCommand: class {},
  GetObjectCommand: class {},
}));

describe("R2 client", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env["R2_ENDPOINT"] = "https://test-account.r2.cloudflarestorage.com";
    process.env["R2_ACCESS_KEY_ID"] = "test-key-id";
    process.env["R2_SECRET_ACCESS_KEY"] = "test-secret";
    process.env["R2_BUCKET_NAME"] = "test-bucket";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("exports a singleton r2 S3Client instance", async () => {
    const { r2 } = await import("@/lib/r2");
    expect(r2).toBeDefined();
    expect(MockS3Client).toHaveBeenCalledOnce();
  });

  it("constructs S3Client with region auto and R2 endpoint", async () => {
    await import("@/lib/r2");
    const [opts] = MockS3Client.mock.calls[0] as [{ region: string; endpoint: string }];
    expect(opts.region).toBe("auto");
    expect(opts.endpoint).toBe("https://test-account.r2.cloudflarestorage.com");
  });

  it("constructs S3Client with credentials from env vars", async () => {
    await import("@/lib/r2");
    const [opts] = MockS3Client.mock.calls[0] as [{ credentials: { accessKeyId: string; secretAccessKey: string } }];
    expect(opts.credentials.accessKeyId).toBe("test-key-id");
    expect(opts.credentials.secretAccessKey).toBe("test-secret");
  });

  it("exports R2_BUCKET from R2_BUCKET_NAME env var", async () => {
    const { R2_BUCKET } = await import("@/lib/r2");
    expect(R2_BUCKET).toBe("test-bucket");
  });

  it("the same r2 instance is returned on repeated imports (singleton)", async () => {
    const { r2: first } = await import("@/lib/r2");
    const { r2: second } = await import("@/lib/r2");
    expect(first).toBe(second);
  });
});
