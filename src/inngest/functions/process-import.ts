import { inngest } from "@/lib/inngest/client";
import { db } from "@/db/client";
import { imports, users } from "@/db/schema";
import { eq, isNull } from "drizzle-orm";
import { getFromR2 } from "@/lib/storage/r2";
import { parseLinkedInPdf } from "@/lib/parsers/linkedin-pdf";
import { parseChatGPTExport } from "@/lib/parsers/chatgpt";
import { parseClaudeExport, parsePlainTextExport } from "@/lib/parsers/claude";
import { extractVoiceCard } from "@/lib/voice/extract";
import { embed } from "@/lib/embeddings";
import { ConfigurationError } from "@/lib/errors";
import type { LinkedInSnapshot } from "@/types/linkedin";
import type { ParsedChatHistory } from "@/lib/parsers/types";

type ImportSource = "chatgpt_zip" | "claude_zip" | "linkedin_pdf" | "plain_text";

type ProcessImportParams = {
  importId: string;
  userId: string;
};

/**
 * Core processing logic extracted for testability.
 * Called by the Inngest function and directly in integration tests.
 */
export async function runProcessImport(params: ProcessImportParams): Promise<void> {
  const { importId, userId } = params;

  // Fetch the imports row
  const rows = await db
    .select({
      source: imports.source,
      rawPath: imports.rawPath,
      voiceEmbedding: imports.voiceEmbedding,
    })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);

  const importRow = rows[0];
  if (!importRow) {
    throw new ConfigurationError(`Import ${importId} not found`);
  }

  if (!importRow.rawPath) {
    throw new ConfigurationError(`Import ${importId} has no rawPath`);
  }

  // Fetch the raw file from R2
  const fileBytes = await getFromR2(importRow.rawPath);

  // Dispatch to the correct parser
  const source = importRow.source as ImportSource;
  let parsed: ParsedChatHistory | LinkedInSnapshot;

  switch (source) {
    case "linkedin_pdf":
      parsed = await parseLinkedInPdf(fileBytes, userId);
      break;

    case "chatgpt_zip":
      parsed = await parseChatGPTExport(fileBytes);
      break;

    case "claude_zip":
      parsed = await parseClaudeExport(fileBytes);
      break;

    case "plain_text": {
      const text = new TextDecoder().decode(fileBytes);
      parsed = parsePlainTextExport(text);
      break;
    }

    default:
      throw new ConfigurationError(`Unknown import source: ${source}`);
  }

  // Persist parsed data (jsonb column)
  await db
    .update(imports)
    .set({ parsed: parsed as Record<string, unknown> })
    .where(eq(imports.id, importId));

  // Skip embedding if already computed (idempotent re-runs)
  if (importRow.voiceEmbedding != null) {
    await db
      .update(users)
      .set({ voiceProfileId: importId })
      .where(eq(users.id, userId));
    return;
  }

  // Extract voice card and compute embedding
  const voiceCard = extractVoiceCard(parsed);
  const embedding = await embed(voiceCard.summary);

  // Store embedding
  await db
    .update(imports)
    .set({ voiceEmbedding: embedding })
    .where(eq(imports.id, importId));

  // Update user's active voice profile
  await db
    .update(users)
    .set({ voiceProfileId: importId })
    .where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------
// Inngest function definition
// ---------------------------------------------------------------------------

export const processImport = inngest.createFunction(
  { id: "process-import", name: "Process Import" },
  { event: "mirror/import.process" },
  async ({ event }) => {
    const { importId, userId } = event.data as ProcessImportParams;
    await runProcessImport({ importId, userId });
    return { importId, status: "complete" };
  }
);
