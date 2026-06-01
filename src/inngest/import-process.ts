import { inngest } from "@/lib/inngest/client";
import { db } from "@/db/client";
import { imports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseAiHistory } from "@/lib/parsers";
import { logger } from "@/lib/logger";

type ImportProcessEventData = {
  importId: string;
  userId: string;
};

/**
 * Inngest function: process an uploaded AI chat export.
 * - Downloads the raw file from R2
 * - Parses it into structured messages
 * - Stores the parsed data in imports.parsed
 * Triggered by mirror/import.process events from the upload route.
 */
export const processImport = inngest.createFunction(
  { id: "import-process", name: "Process AI Chat Import" },
  { event: "mirror/import.process" },
  async ({ event, step }) => {
    const { importId, userId } = event.data as ImportProcessEventData;

    logger.info("import-process: starting", { importId, userId });

    // Fetch the import row to get the raw_path
    const importRow = await step.run("fetch-import-row", async () => {
      const rows = await db
        .select({ id: imports.id, rawPath: imports.rawPath, source: imports.source })
        .from(imports)
        .where(eq(imports.id, importId))
        .limit(1);

      if (rows.length === 0) {
        throw new Error(`Import not found: ${importId}`);
      }
      return rows[0]!;
    });

    if (!importRow.rawPath) {
      logger.warn("import-process: no rawPath on import row", { importId });
      return { status: "skipped", reason: "no_raw_path" };
    }

    // Download file from R2
    const fileBytes = await step.run("download-from-r2", async () => {
      const r2Endpoint = process.env["R2_PUBLIC_URL"];
      if (!r2Endpoint) {
        throw new Error("R2_PUBLIC_URL env var not set");
      }
      const url = `${r2Endpoint}/${importRow.rawPath}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to download from R2: ${resp.status} ${resp.statusText}`);
      }
      const buf = await resp.arrayBuffer();
      return new Uint8Array(buf);
    });

    // Parse the file
    const parsed = await step.run("parse-export", async () => {
      if (importRow.source === "plain_text") {
        const { parsePlainTextExport } = await import("@/lib/parsers/claude");
        return parsePlainTextExport(new TextDecoder().decode(fileBytes));
      }
      return parseAiHistory(fileBytes);
    });

    // Store parsed data
    await step.run("store-parsed", async () => {
      await db
        .update(imports)
        .set({ parsed })
        .where(eq(imports.id, importId));
    });

    logger.info("import-process: complete", {
      importId,
      messageCount: parsed.messages.length,
    });

    return {
      status: "success",
      importId,
      messageCount: parsed.messages.length,
    };
  }
);
