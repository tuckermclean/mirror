import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/db/client";
import { imports, users } from "@/db/schema";
import { readImportRawPath, readPii } from "@/lib/db/pii-read";
import { fetchFromR2 } from "@/lib/storage/r2";
import { parseChatGPTExport } from "@/lib/parsers/chatgpt";
import { parseClaudeExport, parsePlainTextExport } from "@/lib/parsers/claude";
import { parseLinkedInPdf, linkedInSnapshotToHistory } from "@/lib/parsers/linkedin-pdf";
import { extractVoiceCard } from "@/lib/voice/extract";
import { embedVoiceProfile } from "@/lib/embeddings";
import { logger } from "@/lib/logger";
import type { ParsedChatHistory } from "@/lib/parsers/types";

type ImportSource = "chatgpt_zip" | "claude_zip" | "linkedin_pdf" | "plain_text";

export const processImport = inngest.createFunction(
  {
    id: "import-process",
    concurrency: { key: "event.data.importId", limit: 1 },
  },
  { event: "mirror/import.process" },
  async ({ event }: { event: { data: { importId: string } } }) => {
    const { importId } = event.data;

    // Load the import row to get userId and source
    const importRows = await db
      .select({ id: imports.id, userId: imports.userId, source: imports.source })
      .from(imports)
      .where(eq(imports.id, importId))
      .limit(1);

    const importRow = importRows[0];
    if (!importRow) {
      logger.error("process-import: import row not found", { importId });
      return { error: "import_not_found" };
    }

    const { userId, source } = importRow;

    // Read raw_path through PII wrapper
    const rawPathRow = await readImportRawPath(
      importId,
      userId,
      "import processing — fetch raw file for parsing"
    );

    const rawPath = rawPathRow?.rawPath;
    if (!rawPath) {
      logger.error("process-import: raw_path is null", { importId });
      return { error: "missing_raw_path" };
    }

    // Fetch the raw file from R2
    const bytes = await fetchFromR2(rawPath);

    // Dispatch to the correct parser
    let history: ParsedChatHistory;

    if (source === "chatgpt_zip" || source === "chatgpt") {
      history = await parseChatGPTExport(bytes);
    } else if (source === "claude_zip" || source === "claude") {
      history = await parseClaudeExport(bytes);
    } else if ((source as string) === "linkedin_pdf") {
      const { snapshot } = await parseLinkedInPdf(bytes, userId);
      history = linkedInSnapshotToHistory(snapshot);
      // Store the snapshot in parsed field via PII wrapper
      await readPii(
        async () => {
          await db
            .update(imports)
            .set({ parsed: snapshot as unknown as Record<string, unknown> })
            .where(eq(imports.id, importId));
          return [];
        },
        {
          userId,
          accessorId: userId,
          tableName: "imports",
          rowId: importId,
          fieldName: "parsed",
          reason: "import processing — store linkedin snapshot",
        }
      );
    } else if ((source as string) === "plain_text") {
      const text = new TextDecoder().decode(bytes);
      history = parsePlainTextExport(text);
    } else {
      logger.error("process-import: unknown source", { importId, source });
      return { error: "unknown_source", source };
    }

    // Store parsed chat history for non-linkedin imports via PII wrapper
    if (source !== "linkedin_pdf") {
      await readPii(
        async () => {
          await db
            .update(imports)
            .set({ parsed: history as unknown as Record<string, unknown> })
            .where(eq(imports.id, importId));
          return [];
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
    }

    // Extract voice card and produce embedding
    const voiceCard = extractVoiceCard(history);
    const embedding = await embedVoiceProfile(history, voiceCard);

    // Store voice_embedding and update voice_profile_id
    await db
      .update(imports)
      .set({ voiceEmbedding: embedding })
      .where(eq(imports.id, importId));

    await db
      .update(users)
      .set({ voiceProfileId: importId })
      .where(eq(users.id, userId));

    logger.info("process-import: completed", { importId, userId, source });

    return { importId, userId };
  }
);
