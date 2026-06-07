import { eq } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/db/client";
import { imports } from "@/db/schema";
import { readImportRawPath } from "@/lib/db/pii-read";
import { getR2, getR2Bucket } from "@/lib/r2";
import { parseAiHistory } from "@/lib/parsers/index";
import { StorageError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { inngest } from "@/lib/inngest/client";

export async function processImport(importId: string, userId: string): Promise<void> {
  const [existing] = await db
    .select({ status: imports.status })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (existing?.status === "done") return;

  try {
    await db.update(imports).set({ status: "processing" }).where(eq(imports.id, importId));

    const piiRow = await readImportRawPath(
      importId,
      userId,
      "inngest import-process worker: download raw file for parsing"
    );

    if (!piiRow?.rawPath) {
      throw new StorageError(`No raw_path found for import ${importId}`);
    }

    const { Body } = await getR2().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: piiRow.rawPath })
    );

    if (!Body) {
      throw new StorageError(`R2 returned empty Body for import ${importId}`);
    }

    const bytes = new Uint8Array(await Body.transformToByteArray());
    const parsed = await parseAiHistory(bytes);

    await db
      .update(imports)
      .set({ parsed, status: "done" })
      .where(eq(imports.id, importId));

    logger.info("import.process.done", { importId });
  } catch (err) {
    await db.update(imports).set({ status: "failed" }).where(eq(imports.id, importId));
    throw err;
  }
}

export const importProcess = inngest.createFunction(
  { id: "import-process", triggers: [{ event: "mirror/import.process" }] },
  async ({ event }: { event: { data: { importId: string; userId: string } } }) => {
    await processImport(event.data.importId, event.data.userId);
  }
);
