import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/db/client";
import { imports, users } from "@/db/schema";
import { readImportRawPath, writePii } from "@/lib/db/pii-read";
import { fetchFromR2 } from "@/lib/storage/r2";
import { parseChatGPTExport } from "@/lib/parsers/chatgpt";
import { parseClaudeExport, parsePlainTextExport } from "@/lib/parsers/claude";
import { parseLinkedInPdf, linkedInSnapshotToHistory } from "@/lib/parsers/linkedin-pdf";
import { extractVoiceCard } from "@/lib/voice/extract";
import { embedVoiceProfile } from "@/lib/embeddings";
import { ConfigurationError, MonthlyCapError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ParsedChatHistory } from "@/lib/parsers/types";

export type ImportSource = "chatgpt_zip" | "claude_zip" | "linkedin_pdf" | "plain_text";

/** Dispatch raw bytes to the correct parser for the given import source. */
export async function selectParser(
  source: ImportSource,
  bytes: Uint8Array,
  userId: string,
  importId: string
): Promise<ParsedChatHistory> {
  if (source === "chatgpt_zip") {
    return parseChatGPTExport(bytes);
  } else if (source === "claude_zip") {
    return parseClaudeExport(bytes);
  } else if (source === "linkedin_pdf") {
    const { snapshot } = await parseLinkedInPdf(bytes, userId);
    return linkedInSnapshotToHistory(snapshot);
  } else if (source === "plain_text") {
    const text = new TextDecoder().decode(bytes);
    return parsePlainTextExport(text);
  } else {
    logger.error("process-import: unknown source", { importId, source });
    throw new ConfigurationError(`Unknown import source: ${String(source)}`);
  }
}

export const processImport = inngest.createFunction(
  {
    id: "import-process",
    concurrency: { key: "event.data.importId", limit: 1 },
    triggers: [{ event: "mirror/import.process" }],
  },
  async ({ event, step }: { event: { data: { importId: string } }; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { importId } = event.data;

    // Step 1: Load import row.
    const importRow = await step.run("load-import-row", async () => {
      const rows = await db
        .select({ id: imports.id, userId: imports.userId, source: imports.source })
        .from(imports)
        .where(eq(imports.id, importId))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!importRow) {
      logger.error("process-import: import row not found", { importId });
      return { error: "import_not_found" };
    }

    const { userId } = importRow;
    const source = importRow.source as ImportSource;

    // Mark processing now that we have a confirmed import row.
    await step.run("mark-processing", async () => {
      await db.update(imports).set({ status: "processing" }).where(eq(imports.id, importId));
    });

    // Step 2: Read raw_path through PII wrapper.
    const rawPath = await step.run("load-raw-path", async () => {
      const row = await readImportRawPath(
        importId,
        userId,
        "import processing — fetch raw file for parsing"
      );
      return row?.rawPath ?? null;
    });

    if (!rawPath) {
      logger.error("process-import: raw_path is null", { importId });
      return { error: "missing_raw_path" };
    }

    // Step 3: Fetch from R2 and parse.
    // MonthlyCapError and ConfigurationError are permanent conditions that
    // will not resolve on retry — catch them and signal a clean early exit
    // rather than letting Inngest exhaust its retry budget on a futile loop.
    const history = await step.run("fetch-and-parse", async () => {
      const bytes = await fetchFromR2(rawPath);
      return selectParser(source, bytes, userId, importId);
    }).catch(async (err: unknown) => {
      await db.update(imports).set({ status: "failed" }).where(eq(imports.id, importId));
      if (err instanceof MonthlyCapError || err instanceof ConfigurationError) {
        return null;
      }
      throw err;
    });

    if (!history) {
      logger.warn("process-import: permanent error in fetch-and-parse, aborting without retry", { importId });
      return { error: "permanent_failure" };
    }

    // Step 4: Store parsed chat history via PII write wrapper.
    await step.run("store-parsed", async () => {
      await writePii(
        async (tx) => {
          await tx
            .update(imports)
            .set({ parsed: history as unknown as Record<string, unknown> })
            .where(eq(imports.id, importId));
        },
        {
          userId,
          accessorId: userId,
          tableName: "imports",
          rowId: importId,
          fieldName: "parsed",
          reason: "import processing — store parsed chat history",
        }
      );
    });

    // Step 5: Embed voice profile (skip if already set — idempotency).
    const embedding = await step.run("embed-voice-profile", async () => {
      const existingRows = await db
        .select({ voiceEmbedding: imports.voiceEmbedding })
        .from(imports)
        .where(eq(imports.id, importId))
        .limit(1);

      if (existingRows[0]?.voiceEmbedding !== null && existingRows[0]?.voiceEmbedding !== undefined) {
        return existingRows[0].voiceEmbedding;
      }

      const voiceCard = extractVoiceCard(history);
      return embedVoiceProfile(history, voiceCard);
    });

    // Step 6: Persist embedding and link voice profile.
    await step.run("persist-voice-embedding", async () => {
      await db
        .update(imports)
        .set({ voiceEmbedding: embedding })
        .where(eq(imports.id, importId));

      await db
        .update(users)
        .set({ voiceProfileId: importId })
        .where(eq(users.id, userId));
    });

    // Mark done after all steps complete successfully.
    await step.run("mark-done", async () => {
      await db.update(imports).set({ status: "done" }).where(eq(imports.id, importId));
    });

    logger.info("process-import: completed", { importId, userId, source });

    return { importId, userId };
  }
);
