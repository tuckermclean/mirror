import { describe, it, expect, beforeAll } from "vitest";

// 32-byte test key, hex-encoded (64 chars) — used only in unit tests.
const TEST_KEY_HEX = "a".repeat(64);

describe("LinkedIn cookie encryption (libsodium)", () => {
  beforeAll(() => {
    process.env.COOKIE_ENCRYPTION_KEY = TEST_KEY_HEX;
  });

  it("encrypt → decrypt round-trip recovers the original cookie string", async () => {
    const { encryptCookie, decryptCookie } = await import("@/lib/crypto/cookie");
    const original = "li_at=AQEDATxxxxxxxxxxxxxx";
    const ciphertext = await encryptCookie(original);
    expect(ciphertext).not.toBe(original);
    const recovered = await decryptCookie(ciphertext);
    expect(recovered).toBe(original);
  });

  it("decrypting tampered ciphertext throws", async () => {
    const { encryptCookie, decryptCookie } = await import("@/lib/crypto/cookie");
    const ciphertext = await encryptCookie("li_at=test");
    const tampered = ciphertext.slice(0, -4) + "XXXX";
    await expect(decryptCookie(tampered)).rejects.toThrow();
  });

  it("ciphertext is different on every call (random nonce)", async () => {
    const { encryptCookie } = await import("@/lib/crypto/cookie");
    const a = await encryptCookie("li_at=same");
    const b = await encryptCookie("li_at=same");
    expect(a).not.toBe(b);
  });
});
