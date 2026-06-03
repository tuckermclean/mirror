import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  GetObjectCommand: vi.fn().mockImplementation((params) => params),
}));

describe("fetchFromR2", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env["R2_ACCOUNT_ID"] = "test-account";
    process.env["R2_ACCESS_KEY_ID"] = "test-key-id";
    process.env["R2_SECRET_ACCESS_KEY"] = "test-secret";
    process.env["R2_BUCKET"] = "test-bucket";
    mockSend.mockResolvedValue({
      Body: { transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) },
    });
  });

  it("returns raw bytes for a valid key", async () => {
    const { fetchFromR2 } = await import("@/lib/storage/r2");
    const result = await fetchFromR2("imports/user-1/profile.pdf");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("throws StorageError when Body is absent", async () => {
    mockSend.mockResolvedValueOnce({ Body: null });
    const { fetchFromR2 } = await import("@/lib/storage/r2");
    const { StorageError } = await import("@/lib/errors");
    await expect(fetchFromR2("missing/key")).rejects.toThrow(StorageError);
  });

  it("throws ConfigurationError when R2_ACCOUNT_ID is missing", async () => {
    delete process.env["R2_ACCOUNT_ID"];
    vi.resetModules();
    const { fetchFromR2 } = await import("@/lib/storage/r2");
    const { ConfigurationError } = await import("@/lib/errors");
    await expect(fetchFromR2("any/key")).rejects.toThrow(ConfigurationError);
  });

  it("throws ConfigurationError when R2_BUCKET is missing", async () => {
    delete process.env["R2_BUCKET"];
    vi.resetModules();
    const { fetchFromR2 } = await import("@/lib/storage/r2");
    const { ConfigurationError } = await import("@/lib/errors");
    await expect(fetchFromR2("any/key")).rejects.toThrow(ConfigurationError);
  });
});
