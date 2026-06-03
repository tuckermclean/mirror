import { ConfigurationError } from "@/lib/errors";

/**
 * Fetch an object from Cloudflare R2.
 *
 * `rawPath` may be:
 *   - A full URL (presigned or public) — fetched directly.
 *   - A bare key (e.g. "uploads/abc123.pdf") — combined with the R2 public
 *     base URL derived from R2_ACCOUNT_ID and R2_BUCKET_NAME env vars.
 *
 * Returns the raw bytes of the object.
 */
export async function getFromR2(rawPath: string): Promise<Uint8Array> {
  let url: string;

  if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
    url = rawPath;
  } else {
    const accountId = process.env["R2_ACCOUNT_ID"];
    const bucket = process.env["R2_BUCKET_NAME"];
    if (!accountId || !bucket) {
      throw new ConfigurationError(
        "R2_ACCOUNT_ID and R2_BUCKET_NAME must be set to fetch by key"
      );
    }
    url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${rawPath}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new ConfigurationError(
      `R2 fetch failed for "${rawPath}": ${response.status} ${response.statusText}`
    );
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
