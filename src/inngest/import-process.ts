import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { r2, R2_BUCKET } from "@/lib/r2";
import { db } from "@/db/client";
import { imports } from "@/db/schema";
import { readImportRawPath } from "@/lib/db/pii-read";
import { parseAiHistory } from "@/lib/parsers/index";

type ImportProcessData = {
  importId: string;
  userId: string;
};

/**
 * Core logic extracted for unit-testability.
 * The Inngest function wrapper calls this after extracting event data.
 */
export async function runImportProcess({ importId, userId }: ImportProcessData): Promise<void> {
  await db.update(imports).set({ status: "processing" }).where(eq(imports.id, importId));

  try {
    const row = await readImportRawPath(importId, userId, "inngest worker: download for parsing");
    if (!row?.rawPath) {
      throw new Error(`Import ${importId} not found or rawPath missing`);
    }

    const { Body } = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: row.rawPath })
    );
    if (!Body) throw new Error("R2 returned empty body");

    const bytes = new Uint8Array(await (Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray());

    const parsed = await parseAiHistory(bytes);

    await db.update(imports).set({ parsed, status: "done" }).where(eq(imports.id, importId));
  } catch (err) {
    await db.update(imports).set({ status: "failed" }).where(eq(imports.id, importId));
    throw err;
  }
}

export const importProcess = inngest.createFunction(
  { id: "import-process", name: "Process AI chat import", triggers: [{ event: "mirror/import.process" }] },
  async ({ event }: { event: { data: ImportProcessData } }) => {
    await runImportProcess(event.data);
  }
);
