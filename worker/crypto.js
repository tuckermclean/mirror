/**
 * worker/crypto.js — LinkedIn session cookie decryption
 *
 * Mirrors the encryption algorithm used by src/lib/crypto/cookie.ts in the
 * main Next.js app. The app encrypts the li_at cookie with libsodium
 * secretstream (xchacha20poly1305) before persisting it to the database.
 * This module decrypts it in the worker process — in memory only, for the
 * duration of the Playwright scrape.
 *
 * Security invariants:
 *   - The decrypted cookie is NEVER logged.
 *   - The decrypted cookie is NEVER written to disk.
 *   - The browser context holding the cookie is closed immediately after use.
 */

import sodium from "libsodium-wrappers";

/** @returns {Uint8Array} 32-byte encryption key from COOKIE_ENCRYPTION_KEY env var */
function loadKey() {
  const hex = process.env["COOKIE_ENCRYPTION_KEY"];
  if (!hex) {
    throw new Error(
      "COOKIE_ENCRYPTION_KEY environment variable is required but not set"
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES) {
    throw new Error(
      `COOKIE_ENCRYPTION_KEY must be ${sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES * 2} hex characters (${sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES} bytes)`
    );
  }
  return key;
}

/**
 * Decrypt a base64url-encoded libsodium secretstream ciphertext.
 *
 * The ciphertext layout (after base64url-decoding):
 *   bytes [0 .. HEADERBYTES-1]  — secretstream push header
 *   bytes [HEADERBYTES .. end]  — encrypted message (with MAC)
 *
 * @param {string} ciphertext  base64url-encoded secretstream blob
 * @returns {Promise<string>}   the decrypted plaintext cookie string
 * @throws if the key is missing, the ciphertext is malformed, or MAC fails
 */
export async function decryptCookie(ciphertext) {
  await sodium.ready;

  const key = loadKey();
  const HEADER_BYTES = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES;

  const combined = Buffer.from(ciphertext, "base64url");
  if (combined.length <= HEADER_BYTES) {
    throw new Error(
      `decrypt: ciphertext too short — got ${combined.length} bytes, need at least ${HEADER_BYTES + 1}`
    );
  }

  const header = combined.subarray(0, HEADER_BYTES);
  const encrypted = combined.subarray(HEADER_BYTES);

  let state;
  try {
    state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key);
  } catch (err) {
    throw new Error(
      `decrypt: failed to initialise secretstream pull state — ${String(err)}`
    );
  }

  let result;
  try {
    result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, encrypted, null);
  } catch (err) {
    throw new Error(`decrypt: failed to decrypt cookie — ${String(err)}`);
  }

  if (!result || result.tag !== sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) {
    throw new Error(
      "decrypt: failed to decrypt cookie — bad MAC or wrong key (authentication failed)"
    );
  }

  return Buffer.from(result.message).toString("utf8");
}
