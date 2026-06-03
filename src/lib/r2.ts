import { S3Client } from "@aws-sdk/client-s3";
import { ConfigurationError } from "@/lib/errors";

let _client: S3Client | undefined;
let _bucket: string | undefined;

export function getR2Client(): S3Client {
  if (_client) return _client;

  const endpoint = process.env["R2_ENDPOINT"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  const bucket = process.env["R2_BUCKET_NAME"];

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new ConfigurationError(
      "R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME are required",
    );
  }

  _bucket = bucket;
  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function getR2Bucket(): string {
  getR2Client();
  return _bucket!;
}
