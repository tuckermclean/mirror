/**
 * LinkedIn session cookie encryption using libsodium secretstream.
 *
 * Encrypts/decrypts the li_at cookie with XChaCha20-Poly1305 authenticated
 * encryption. Every call to encryptCookie produces a unique ciphertext because
 * secretstream generates a random header (nonce) on each init_push.
 *
 * Wire format (base64url): <HEADERBYTES header> || <ciphertext+tag>
 *
 * Security properties:
 *   - Confidentiality: XChaCha20 stream cipher
 *   - Integrity + authenticity: Poly1305 MAC per push chunk
 *   - Random nonce: secretstream header is randomly generated on each call
 *   - Tamper detection: decryptCookie throws CookieEncryptionError on MAC fail
 */

import sodium from "libsodium-wrappers";
import { CookieEncryptionError } from "@/lib/errors";

/** Expected byte length of the hex-encoded COOKIE_ENCRYPTION_KEY (32 bytes = 64 hex chars). */
const KEY_HEX_LENGTH = 64;

/**
 * Load and validate the 32-byte encryption key from the environment.
 *
 * Awaits `sodium.ready` itself so this function is safe to call independently,
 * matching the pattern used by encryptCookie/decryptCookie — `sodium.from_hex`
 * is a libsodium API and must not be invoked before the WASM module is ready.
 */
async function loadKey(): Promise<Uint8Array> {
  await sodium.ready;
  const hex = process.env.COOKIE_ENCRYPTION_KEY;
  if (!hex || hex.length !== KEY_HEX_LENGTH) {
    throw new CookieEncryptionError(
      "COOKIE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        `Got ${hex ? `${hex.length} chars` : "undefined"}.`
    );
  }
  return sodium.from_hex(hex);
}

/**
 * Encrypts a cookie string with libsodium secretstream (XChaCha20-Poly1305).
 *
 * Returns a base64url string containing the random stream header followed by
 * the encrypted message chunk. Every invocation produces a different output
 * because secretstream generates a fresh random header on init_push.
 */
export async function encryptCookie(cookie: string): Promise<string> {
  await sodium.ready;
  const key = await loadKey();

  const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(key);
  const cipherChunk = sodium.crypto_secretstream_xchacha20poly1305_push(
    state,
    sodium.from_string(cookie),
    null,
    sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
  );

  return encodePayload(header, cipherChunk);
}

/**
 * Decrypts a cookie string previously produced by encryptCookie.
 *
 * Throws CookieEncryptionError if the ciphertext is malformed, truncated, or
 * has been tampered with (MAC verification failure).
 */
export async function decryptCookie(ciphertext: string): Promise<string> {
  await sodium.ready;
  const key = await loadKey();

  const { header, cipherChunk } = decodePayload(ciphertext);

  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key);
  const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, cipherChunk, null);

  if (result === false) {
    throw new CookieEncryptionError(
      "Decryption failed: ciphertext is malformed or has been tampered with."
    );
  }

  return sodium.to_string(result.message);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Concatenates the secretstream header and cipher chunk, then base64url-encodes
 * the combined bytes for safe transport/storage.
 */
function encodePayload(header: Uint8Array, cipherChunk: Uint8Array): string {
  const combined = new Uint8Array(header.length + cipherChunk.length);
  combined.set(header, 0);
  combined.set(cipherChunk, header.length);
  return sodium.to_base64(combined, sodium.base64_variants.URLSAFE_NO_PADDING);
}

/**
 * Decodes the base64url payload and splits it back into the secretstream header
 * and cipher chunk. Throws CookieEncryptionError if the payload is too short.
 */
function decodePayload(encoded: string): {
  header: Uint8Array;
  cipherChunk: Uint8Array;
} {
  let combined: Uint8Array;
  try {
    combined = sodium.from_base64(encoded, sodium.base64_variants.URLSAFE_NO_PADDING);
  } catch {
    throw new CookieEncryptionError("Ciphertext is not valid base64url.");
  }

  const headerBytes = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES;
  if (combined.length <= headerBytes) {
    throw new CookieEncryptionError(
      `Ciphertext too short: expected >${headerBytes} bytes, got ${combined.length}.`
    );
  }

  return {
    header: combined.slice(0, headerBytes),
    cipherChunk: combined.slice(headerBytes),
  };
}
