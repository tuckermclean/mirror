import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { imports } from "@/db/schema";
import { r2, R2_BUCKET } from "@/lib/r2";
import { readImportRawPath } from "@/lib/db/pii-read";
import { parseAiHistory } from "@/lib/parsers/index";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";

/**
 * Core import-processing logic — exported separately for unit-test ergonomics.
 * The Inngest wrapper below delegates to this function.
 */
export async function processImport(importId: string): Promise<void> {
  try {
    // First DB write: mark as processing so operators can see progress
    await db
      .update(imports)
      .set({ status: "processing" })
      .where(eq(imports.id, importId));

    // Fetch userId to use as PII audit accessor (userId is not a PII column)
    const [row] = await db
      .select({ userId: imports.userId })
      .from(imports)
      .where(eq(imports.id, importId))
      .limit(1);

    if (!row) {
      throw new Error(`Import ${importId} not found`);
    }

    // Read rawPath via PII audit wrapper — direct .select() on raw_path is a lint error
    const pathRow = await readImportRawPath(
      importId,
      row.userId,
      "import-process worker: reading raw_path to download and parse uploaded file",
    );

    if (!pathRow?.rawPath) {
      throw new Error(`Import ${importId} has no raw_path`);
    }

    // Download from R2 using private SDK credentials — never a public URL
    const { Body } = await r2.send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: pathRow.rawPath }),
    );

    if (!Body) {
      throw new Error(`R2 returned empty body for import ${importId}`);
    }

    const bytes = new Uint8Array(
      await (Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray(),
    );

    // Parse AI chat history
    const parsed = await parseAiHistory(bytes);

    // Persist parsed result and mark done
    await db
      .update(imports)
      .set({ parsed, status: "done" })
      .where(eq(imports.id, importId));

    logger.info("import.process.done", { importId });
  } catch (err) {
    // Ensure import never stays stuck in "processing" — always observable
    await db
      .update(imports)
      .set({ status: "failed" })
      .where(eq(imports.id, importId));

    logger.error("import.process.failed", {
      importId,
      error: err instanceof Error ? err.message : String(err),
    });

    throw err;
  }
}

export const importProcess = inngest.createFunction(
  { id: "import-process", triggers: [{ event: "mirror/import.process" }] },
  async ({ event }: { event: { data: { importId: string } } }) => {
    await processImport(event.data.importId);
  },
);
