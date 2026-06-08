import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

// 32-byte test key, hex-encoded (64 chars) — a clearly fake, non-uniform
// pattern used ONLY in unit tests. Deliberately not a repeated character so it
// can never be mistaken for (or copy-pasted as) a real COOKIE_ENCRYPTION_KEY.
const TEST_KEY_HEX = "0123456789abcdeffedcba98765432100123456789abcdeffedcba9876543210";

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

  describe("input validation & error paths", () => {
    afterEach(() => {
      // Restore the valid test key clobbered by the missing/invalid-key cases.
      process.env.COOKIE_ENCRYPTION_KEY = TEST_KEY_HEX;
    });

    it("throws CookieEncryptionError when the key is missing", async () => {
      const { encryptCookie } = await import("@/lib/crypto/cookie");
      const { CookieEncryptionError } = await import("@/lib/errors");
      delete process.env.COOKIE_ENCRYPTION_KEY;
      await expect(encryptCookie("li_at=test")).rejects.toBeInstanceOf(
        CookieEncryptionError
      );
    });

    it("throws CookieEncryptionError when the key is the wrong length", async () => {
      const { encryptCookie } = await import("@/lib/crypto/cookie");
      const { CookieEncryptionError } = await import("@/lib/errors");
      process.env.COOKIE_ENCRYPTION_KEY = "deadbeef"; // 8 chars, not 64
      await expect(encryptCookie("li_at=test")).rejects.toBeInstanceOf(
        CookieEncryptionError
      );
    });

    it("throws CookieEncryptionError when ciphertext is not valid base64url", async () => {
      const { decryptCookie } = await import("@/lib/crypto/cookie");
      const { CookieEncryptionError } = await import("@/lib/errors");
      // `*` is outside the base64url alphabet.
      await expect(decryptCookie("not*valid*base64")).rejects.toBeInstanceOf(
        CookieEncryptionError
      );
    });

    it("throws CookieEncryptionError when ciphertext is too short to hold a header", async () => {
      const { decryptCookie } = await import("@/lib/crypto/cookie");
      const { CookieEncryptionError } = await import("@/lib/errors");
      // Valid base64url but far fewer bytes than HEADERBYTES.
      await expect(decryptCookie("AAAA")).rejects.toBeInstanceOf(
        CookieEncryptionError
      );
    });
  });

  describe("never logs the li_at cookie", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("never writes the cookie — neither the full string nor the bare token — to any console output", async () => {
      const { encryptCookie, decryptCookie } = await import("@/lib/crypto/cookie");

      // Bare token value (without the `li_at=` cookie-name prefix). The crypto
      // module must never leak either representation through logs.
      const token = "AQEDATSECRETTOKEN1234567890";
      const cookie = `li_at=${token}`;

      const captured: string[] = [];
      const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map(
        (level) =>
          vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
            captured.push(args.map(String).join(" "));
          })
      );

      const ciphertext = await encryptCookie(cookie);
      const recovered = await decryptCookie(ciphertext);
      // Force a decryption-failure path too, to exercise error logging.
      await expect(decryptCookie(ciphertext.slice(0, -4) + "XXXX")).rejects.toThrow();

      spies.forEach((s) => s.mockRestore());

      expect(recovered).toBe(cookie);

      const allOutput = captured.join("\n");
      // The full `li_at=...` cookie string must never appear in logs.
      expect(allOutput).not.toContain(cookie);
      // The bare token value (without the `li_at=` prefix) must also never
      // appear in logs — a partial leak is still a leak.
      expect(allOutput).not.toContain(token);
    });
  });
});
