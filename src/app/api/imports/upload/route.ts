import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { imports, users } from "@/db/schema";
import { getR2, getR2Bucket } from "@/lib/r2";
import { detectSourceFromBytes } from "@/lib/parsers/index";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const ALLOWED_TYPES = new Set([
  "application/zip",
  "text/plain",
  "application/octet-stream",
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth first — AGENTS.md rule: no exceptions
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const fileField = formData.get("file");

  if (!fileField || typeof fileField === "string") {
    return NextResponse.json({ error: "missing_file_field" }, { status: 400 });
  }

  const file = fileField as File;

  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }

  // Size check BEFORE arrayBuffer() — spec requirement
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  // MIME allowlist
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "unsupported_file_type" }, { status: 415 });
  }

  // Read bytes only after size and MIME checks pass
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Magic-byte validation for non-text files
  if (file.type !== "text/plain") {
    const validZip =
      bytes.length >= 4 &&
      bytes[0] === ZIP_MAGIC[0] &&
      bytes[1] === ZIP_MAGIC[1] &&
      bytes[2] === ZIP_MAGIC[2] &&
      bytes[3] === ZIP_MAGIC[3];
    if (!validZip) {
      return NextResponse.json({ error: "invalid_zip_magic" }, { status: 415 });
    }
  }

  // Resolve internal user ID from Clerk ID
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (userRows.length === 0) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  const internalUserId = userRows[0]!.id;

  // Source detection from bytes — never filename heuristics
  const source = detectSourceFromBytes(bytes);

  // Upload to R2
  const fileId = randomUUID();
  const key = `imports/${internalUserId}/${fileId}/${file.name}`;

  await getR2().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: bytes,
      ContentType: file.type,
    })
  );

  // Insert imports row with status = "pending"
  const inserted = await db
    .insert(imports)
    .values({
      userId: internalUserId,
      source,
      status: "pending",
      rawPath: key,
    })
    .returning({ id: imports.id });

  const importId = inserted[0]!.id;

  // Enqueue async processing — rollback DB row on failure so it doesn't linger
  try {
    await inngest.send({
      name: "mirror/import.process",
      data: { importId },
    });
  } catch (err) {
    logger.error("import.upload.inngest_send_failed", { importId, err });
    await db.delete(imports).where(eq(imports.id, importId));
    return NextResponse.json(
      { error: "service_unavailable" },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }

  logger.info("import.upload.queued", { importId, source });

  return NextResponse.json({ importId }, { status: 202 });
}
