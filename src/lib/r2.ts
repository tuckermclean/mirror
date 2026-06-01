import { S3Client } from "@aws-sdk/client-s3";

// Instantiated once at module scope so connection pooling and keep-alives
// are shared across all upload and download invocations.
export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env["R2_ENDPOINT"],
  credentials: {
    accessKeyId: process.env["R2_ACCESS_KEY_ID"] ?? "",
    secretAccessKey: process.env["R2_SECRET_ACCESS_KEY"] ?? "",
  },
});

export const R2_BUCKET = process.env["R2_BUCKET_NAME"] ?? "";
