import Anthropic from "@anthropic-ai/sdk";
import { eq, isNotNull, and, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/db/client";
import { generations, imports, interviews, users } from "@/db/schema";
// `readLinkedinSnapshot` (added to pii-read.ts) and `computePromptHash`
// (added in prompt-cache.ts) are owned by a teammate and land in separate PRs.
// We import — never define — them here per the PII-wrapper and prompt-cache
// architecture rules. Until both upstream PRs merge, `pnpm typecheck` reports
// two "missing member/module" errors for exactly these symbols; they resolve
// on merge. Tests mock both modules so the function is verified in isolation.
import { readLinkedinSnapshot, readInterviewTranscript } from "@/lib/db/pii-read";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { computePromptHash } from "@/lib/llm/prompt-cache";
import { prompts } from "@/lib/prompts";
import { MonthlyCapError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const VOICE_TOP_K = 5;

type GenerationEvent = {
  data: { userId: string; snapshotId: string; generationId: string };
};

type Step = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };

/**
 * Resolve the user's interview id, then read its transcript through the PII
 * audit wrapper. Returns "" when the user has no interview yet.
 */
async function loadTranscript(userId: string): Promise<string> {
  const rows = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(eq(interviews.userId, userId))
    .limit(1);
  const interviewId = rows[0]?.id;
  if (!interviewId) return "";
  const row = await readInterviewTranscript(
    interviewId,
    userId,
    "profile generation — include interview transcript as voice context"
  );
  return row?.transcript ? JSON.stringify(row.transcript) : "";
}

/**
 * Retrieve up to k voice-sample embeddings for the user.
 *
 * DEVIATION FROM ISSUE #142: there is no `voice_embeddings` table. Voice
 * vectors are stored one-per-import on `imports.voiceEmbedding` (vector(1024)).
 * We resolve the user's *active* voice profile vector via `users.voiceProfileId`
 * and rank the user's other non-null voice embeddings by cosine distance to it
 * using the pgvector `<=>` operator (the only place raw SQL is allowed per
 * AGENTS.md). If the user has no active profile vector, we fall back to taking
 * up to k of the user's non-null voice embeddings with no ordering.
 */
async function loadVoiceEmbeddings(userId: string): Promise<number[][]> {
  const queryVec = await loadActiveVoiceVector(userId);

  if (!queryVec) {
    const rows = await db
      .select({ voiceEmbedding: imports.voiceEmbedding })
      .from(imports)
      .where(and(eq(imports.userId, userId), isNotNull(imports.voiceEmbedding)))
      .limit(VOICE_TOP_K);
    return rows.map((r) => r.voiceEmbedding).filter((v): v is number[] => v != null);
  }

  const literal = `[${queryVec.join(",")}]`;
  const rows = await db
    .select({ voiceEmbedding: imports.voiceEmbedding })
    .from(imports)
    .where(and(eq(imports.userId, userId), isNotNull(imports.voiceEmbedding)))
    .orderBy(sql`${imports.voiceEmbedding} <=> ${literal}::vector`)
    .limit(VOICE_TOP_K);
  return rows.map((r) => r.voiceEmbedding).filter((v): v is number[] => v != null);
}

/** Look up the user's active voice profile vector via users.voiceProfileId. */
async function loadActiveVoiceVector(userId: string): Promise<number[] | null> {
  const rows = await db
    .select({ voiceEmbedding: imports.voiceEmbedding })
    .from(users)
    .innerJoin(imports, eq(users.voiceProfileId, imports.id))
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.voiceEmbedding ?? null;
}

/** Extract the concatenated text content from a finished Anthropic message. */
function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

type StreamResult = { output: string; inputTokens: number; outputTokens: number };

/**
 * Run the Anthropic STREAMING generation call and return the assembled text
 * plus actual token usage from the final message metadata.
 */
async function streamGeneration(
  client: Anthropic,
  system: string,
  userMessage: string
): Promise<StreamResult> {
  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const final = await stream.finalMessage();
  return {
    output: extractText(final),
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
  };
}

/** Build the user message that pairs the snapshot with the voice samples. */
function buildUserMessage(snapshot: string, voiceSamples: string): string {
  return `Rewrite this LinkedIn profile in the user's voice: ${snapshot} ${voiceSamples}`;
}

export const runGeneration = inngest.createFunction(
  {
    id: "generation-start",
    concurrency: { key: "event.data.generationId", limit: 1 },
    triggers: [{ event: "generation/start" }],
  },
  async ({ event, step }: { event: GenerationEvent; step: Step }) => {
    const { userId, snapshotId, generationId } = event.data;

    // Step 1: Read the LinkedIn snapshot through the PII audit wrapper.
    const snapshot = await step.run("read-snapshot", async () => {
      const row = await readLinkedinSnapshot(
        snapshotId,
        userId,
        "profile generation — read snapshot to rewrite"
      );
      return row?.rawHtml ?? (row?.parsed ? JSON.stringify(row.parsed) : "");
    });

    // Step 2: Read the user's interview transcript (PII audit wrapper).
    const transcript = await step.run("read-transcript", async () =>
      loadTranscript(userId)
    );

    // Step 3: Retrieve top-k voice embeddings via pgvector cosine distance.
    const voiceEmbeddings = await step.run("load-voice-embeddings", async () =>
      loadVoiceEmbeddings(userId)
    );

    const voiceSamples = `${transcript} [voice vectors: ${voiceEmbeddings.length}]`;
    const system = prompts.profileGeneration.content;
    const userMessage = buildUserMessage(snapshot, voiceSamples);

    // Step 4: Enforce the monthly spend cap BEFORE the Anthropic call.
    await step.run("check-monthly-cap", async () => {
      const cap = await checkMonthlyCap();
      if (!cap.allowed) {
        logger.warn("generation: monthly cap reached, aborting", { generationId, userId });
        throw new MonthlyCapError(cap.resets_at);
      }
    });

    // Step 5: Anthropic STREAMING generation call.
    const result = await step.run("generate", async () => {
      const client = new Anthropic();
      return streamGeneration(client, system, userMessage);
    });

    // Step 6: Record ACTUAL token usage to the spend ledger (never estimate).
    await step.run("record-spend", async () => {
      await recordLlmSpend({
        userId,
        generationId,
        model: MODEL,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: computeCostUsd(MODEL, result.inputTokens, result.outputTokens),
      });
    });

    // Step 7: Persist the result into the existing generations row.
    await step.run("store-generation", async () => {
      const promptHash = computePromptHash({
        systemPrompt: system,
        userMessages: [userMessage],
        modelId: MODEL,
      });
      await db
        .update(generations)
        .set({ output: result.output, model: MODEL, promptHash })
        .where(eq(generations.id, generationId));
    });

    // Step 8: Emit completion event for downstream consumers.
    await step.run("emit-complete", async () => {
      await inngest.send({
        name: "generation/complete",
        data: { generationId, userId },
      });
    });

    logger.info("generation: completed", { generationId, userId });
    return { generationId, userId };
  }
);
