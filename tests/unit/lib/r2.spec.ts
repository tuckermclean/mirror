/**
 * Unit tests for src/lib/r2.ts — R2 singleton client.
 *
 * DB-free, network-free. Mocks the AWS SDK so we can inspect
 * constructor arguments without a live S3/R2 endpoint.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const mockS3Client = vi.hoisted(() =>
  vi.fn().mockImplementation((opts: unknown) => ({ _opts: opts, send: vi.fn() }))
);

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: mockS3Client,
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

describe("r2 singleton", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env["R2_ENDPOINT"];
    delete process.env["R2_ACCESS_KEY_ID"];
    delete process.env["R2_SECRET_ACCESS_KEY"];
    delete process.env["R2_BUCKET_NAME"];
  });

  it("exports a single S3Client instance (r2)", async () => {
    process.env["R2_ENDPOINT"] = "https://account.r2.cloudflarestorage.com";
    process.env["R2_ACCESS_KEY_ID"] = "test-key-id";
    process.env["R2_SECRET_ACCESS_KEY"] = "test-secret";
    process.env["R2_BUCKET_NAME"] = "test-bucket";

    const { r2 } = await import("@/lib/r2");
    expect(r2).toBeDefined();
    expect(mockS3Client).toHaveBeenCalledOnce();
  });

  it("configures region as 'auto'", async () => {
    process.env["R2_ENDPOINT"] = "https://account.r2.cloudflarestorage.com";
    process.env["R2_ACCESS_KEY_ID"] = "test-key-id";
    process.env["R2_SECRET_ACCESS_KEY"] = "test-secret";
    process.env["R2_BUCKET_NAME"] = "test-bucket";

    await import("@/lib/r2");

    const [opts] = mockS3Client.mock.calls[0] as [{ region: string }][];
    expect(opts.region).toBe("auto");
  });

  it("configures endpoint from R2_ENDPOINT env var", async () => {
    const endpoint = "https://abcdef1234.r2.cloudflarestorage.com";
    process.env["R2_ENDPOINT"] = endpoint;
    process.env["R2_ACCESS_KEY_ID"] = "key";
    process.env["R2_SECRET_ACCESS_KEY"] = "secret";
    process.env["R2_BUCKET_NAME"] = "bucket";

    await import("@/lib/r2");

    const [opts] = mockS3Client.mock.calls[0] as [{ endpoint: string }][];
    expect(opts.endpoint).toBe(endpoint);
  });

  it("passes credentials from env vars", async () => {
    process.env["R2_ENDPOINT"] = "https://x.r2.cloudflarestorage.com";
    process.env["R2_ACCESS_KEY_ID"] = "my-access-key";
    process.env["R2_SECRET_ACCESS_KEY"] = "my-secret-key";
    process.env["R2_BUCKET_NAME"] = "bucket";

    await import("@/lib/r2");

    const [opts] = mockS3Client.mock.calls[0] as [
      { credentials: { accessKeyId: string; secretAccessKey: string } }
    ][];
    expect(opts.credentials.accessKeyId).toBe("my-access-key");
    expect(opts.credentials.secretAccessKey).toBe("my-secret-key");
  });

  it("exports R2_BUCKET from R2_BUCKET_NAME env var", async () => {
    process.env["R2_ENDPOINT"] = "https://x.r2.cloudflarestorage.com";
    process.env["R2_ACCESS_KEY_ID"] = "key";
    process.env["R2_SECRET_ACCESS_KEY"] = "secret";
    process.env["R2_BUCKET_NAME"] = "my-import-bucket";

    const { R2_BUCKET } = await import("@/lib/r2");
    expect(R2_BUCKET).toBe("my-import-bucket");
  });

  it("is a module-level singleton (not reconstructed on re-import)", async () => {
    process.env["R2_ENDPOINT"] = "https://x.r2.cloudflarestorage.com";
    process.env["R2_ACCESS_KEY_ID"] = "key";
    process.env["R2_SECRET_ACCESS_KEY"] = "secret";
    process.env["R2_BUCKET_NAME"] = "bucket";

    const { r2: first } = await import("@/lib/r2");
    const { r2: second } = await import("@/lib/r2");

    expect(first).toBe(second);
    // Constructor called only once (module is cached after first import)
    expect(mockS3Client).toHaveBeenCalledOnce();
  });
});
