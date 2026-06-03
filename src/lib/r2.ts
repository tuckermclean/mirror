import { S3Client } from "@aws-sdk/client-s3";
import { ConfigurationError } from "@/lib/errors";

export function getR2Client(): S3Client {
  throw new ConfigurationError("getR2Client: not yet implemented");
}

export function getR2Bucket(): string {
  throw new ConfigurationError("getR2Bucket: not yet implemented");
}
