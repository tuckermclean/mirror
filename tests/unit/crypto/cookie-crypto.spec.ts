// RED: @/lib/crypto/cookie does not exist yet — fails until Wk 2 (LinkedIn ingestion)
import { describe, it, expect } from "vitest";

describe("LinkedIn cookie encryption (libsodium)", () => {
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
