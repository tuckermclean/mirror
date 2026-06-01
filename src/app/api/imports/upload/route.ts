import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/db/client";
import { imports, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "text/plain",
]);

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

type ImportSource = "chatgpt_zip" | "claude_zip" | "plain_text";

function detectSource(filename: string, mimeType: string): ImportSource {
  const lower = filename.toLowerCase();
  if (mimeType === "text/plain" || lower.endsWith(".txt")) {
    return "plain_text";
  }
  if (lower.includes("claude")) {
    return "claude_zip";
  }
  return "chatgpt_zip";
}

function buildR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: process.env["R2_ENDPOINT"] ?? "",
    credentials: {
      accessKeyId: process.env["R2_ACCESS_KEY_ID"] ?? "",
      secretAccessKey: process.env["R2_SECRET_ACCESS_KEY"] ?? "",
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth — must be the very first operation per architecture rules
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const fileField = formData.get("file");
  if (!(fileField instanceof File)) {
    return NextResponse.json({ error: "missing_file_field" }, { status: 400 });
  }

  const file = fileField;
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json({ error: "unsupported_file_type" }, { status: 415 });
  }

  // 3. Resolve internal user ID
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (userRows.length === 0) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  const userId = userRows[0]!.id;

  // 4. Detect source type from filename / MIME
  const source: ImportSource = detectSource(file.name, mimeType);

  // 5. Upload to R2
  const objectKey = `imports/${userId}/${randomUUID()}/${file.name}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const r2 = buildR2Client();
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env["R2_BUCKET"] ?? "mirror",
        Key: objectKey,
        Body: bytes,
        ContentType: mimeType,
        ContentLength: bytes.length,
      })
    );
  } catch (err) {
    logger.error("upload: R2 upload failed", {
      error: err instanceof Error ? err.message : String(err),
      userId,
    });
    return NextResponse.json({ error: "storage_error" }, { status: 502 });
  }

  // 6. Insert imports row
  const inserted = await db
    .insert(imports)
    .values({
      userId,
      source,
      rawPath: objectKey,
    })
    .returning({ id: imports.id });

  const importId = inserted[0]!.id;

  // 7. Enqueue Inngest processing event
  await inngest.send({
    name: "mirror/import.process",
    data: { importId, userId },
  });

  logger.info("upload: import queued", { importId, userId, source });

  return NextResponse.json({ importId }, { status: 202 });
}
