import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { ConfigurationError, StorageError } from "@/lib/errors";

let _client: S3Client | undefined;

function getClient(): S3Client {
  if (!_client) {
    const accountId = process.env["R2_ACCOUNT_ID"];
    const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
    const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new ConfigurationError(
        "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required"
      );
    }

    _client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

function getBucket(): string {
  const bucket = process.env["R2_BUCKET_NAME"];
  if (!bucket) throw new ConfigurationError("R2_BUCKET_NAME is required");
  return bucket;
}

/**
 * Fetch an object from R2 by its storage key.
 * Returns the raw bytes of the object.
 */
export async function fetchFromR2(key: string): Promise<Uint8Array> {
  const client = getClient();
  const bucket = getBucket();

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!response.Body) {
    throw new StorageError(`R2 object not found: ${key}`);
  }

  const bytes = await response.Body.transformToByteArray();
  return bytes;
}
