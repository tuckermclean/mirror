import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/client";
import { imports, users } from "@/db/schema";
import { r2, R2_BUCKET } from "@/lib/r2";
import { inngest } from "@/lib/inngest/client";
import { detectSourceFromBytes } from "@/lib/parsers/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

function isZipMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mimeType = file.type || "application/octet-stream";

  // Magic-byte validation: any non-plaintext upload must be a valid ZIP.
  // Browsers send application/octet-stream for unrecognized types, so we
  // validate bytes rather than trusting the MIME header.
  if (mimeType !== "text/plain") {
    if (!isZipMagic(bytes)) {
      return NextResponse.json({ error: "invalid_file_type" }, { status: 415 });
    }
  }

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (userRows.length === 0) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  const internalUserId = userRows[0]!.id;

  // Detect source from ZIP contents — never trust filename
  const source = detectSourceFromBytes(bytes);

  const key = `imports/${internalUserId}/${randomUUID()}/${file.name}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: mimeType,
    })
  );

  const inserted = await db
    .insert(imports)
    .values({
      userId: internalUserId,
      source,
      rawPath: key,
      status: "pending",
    })
    .returning({ id: imports.id });

  const importId = inserted[0]!.id;

  await inngest.send({
    name: "mirror/import.process",
    data: { importId, userId: internalUserId },
  });

  return NextResponse.json({ importId });
}
