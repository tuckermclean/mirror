import Anthropic from "@anthropic-ai/sdk";
import { NonRetriableError } from "inngest";
import { eq, isNotNull, and, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/db/client";
import { generations, imports, interviews, users } from "@/db/schema";
// `readLinkedinSnapshot` (added to pii-read.ts) is owned by a teammate and
// lands in a separate PR. We import — never define — it here per the
// PII-wrapper architecture rule. Until that upstream PR merges, `pnpm
// typecheck` reports a "missing member" error for exactly this symbol; it
// resolves on merge. Tests mock the module so the function is verified in
// isolation. The prompt-hash cache key is owned entirely by the POST
// /api/generate route, so this function never computes a hash itself.
import { readLinkedinSnapshot, readInterviewTranscript } from "@/lib/db/pii-read";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { prompts } from "@/lib/prompts";
import { MonthlyCapError, GenerationSchemaError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { retrieveSimilarProfiles } from "@/lib/rag/retrieval";
import { parseGeneratedProfile, type GeneratedProfile } from "@/lib/generation/schema";
import { assembleRationaleBundle } from "@/lib/generation/rationale";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const RATIONALE_MAX_TOKENS = 2048;
const VOICE_TOP_K = 5;
const EXEMPLAR_TOP_K = 5;

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
  userMessage: string,
  maxTokens: number = MAX_TOKENS
): Promise<StreamResult> {
  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
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

/**
 * Build the user message sent to the LLM.
 *
 * `transcript` is a first-class parameter so it appears as a clearly-labelled
 * section in the prompt, separate from `voiceSamples` which only carries
 * voice-embedding metadata (e.g. vector count).
 */
function buildUserMessage(
  snapshot: string,
  transcript: string,
  voiceSamples: string,
  exemplars: string
): string {
  return [
    "Rewrite this LinkedIn profile in the user's voice.",
    "",
    "Profile:",
    snapshot,
    "",
    "Interview transcript:",
    transcript,
    "",
    `Voice samples: ${voiceSamples}`,
    "",
    "Benchmark exemplars:",
    exemplars,
  ].join("\n");
}

/**
 * Serialize the top-k benchmark exemplars (RAG) for the prompt. Empty corpus
 * (Wk4 populates it) yields an explicit "none" marker so the model knows not to
 * cite exemplars it wasn't given.
 */
function formatExemplars(
  exemplars: Awaited<ReturnType<typeof retrieveSimilarProfiles>>
): string {
  if (exemplars.length === 0) return "[none supplied]";
  return exemplars
    .map((e, i) => `exemplar #${i + 1} (${e.role}, ${e.seniority}): ${JSON.stringify(e.parsed)}`)
    .join("\n");
}

/**
 * Enforce the monthly spend cap, then run one STREAMING Anthropic call and
 * record its ACTUAL token cost. Throws NonRetriableError when the cap is hit
 * (a depleted cap will not resolve inside the retry window).
 */
async function callLlmGuarded(
  client: Anthropic,
  args: { system: string; userMessage: string; maxTokens: number },
  spend: { userId: string; generationId: string }
): Promise<string> {
  const cap = await checkMonthlyCap();
  if (!cap.allowed) {
    logger.warn("generation: monthly cap reached, aborting", spend);
    throw new NonRetriableError(
      `Monthly LLM spend cap reached; resets at ${cap.resets_at}`,
      { cause: new MonthlyCapError(cap.resets_at) }
    );
  }
  const result = await streamGeneration(client, args.system, args.userMessage, args.maxTokens);
  await recordLlmSpend({
    userId: spend.userId,
    generationId: spend.generationId,
    model: MODEL,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: computeCostUsd(MODEL, result.inputTokens, result.outputTokens),
  });
  return result.output;
}

/** Parse + validate the rewritten profile; terminal schema failures are non-retriable. */
function validateProfile(raw: string, generationId: string): GeneratedProfile {
  const parsed = parseGeneratedProfile(raw);
  if (parsed.ok) return parsed.value;
  const detail =
    parsed.error.kind === "invalid_json"
      ? "model did not return JSON"
      : JSON.stringify(parsed.error.issues);
  logger.warn("generation: output failed schema validation", { generationId, detail });
  throw new NonRetriableError("generation output failed schema validation", {
    cause: new GenerationSchemaError(detail),
  });
}

/** Build the rationale+recruiter-eye system prompt and the user message for it. */
function buildRationalePrompt(
  profile: GeneratedProfile,
  snapshot: string
): { system: string; userMessage: string } {
  const system = [
    prompts.rationale.content,
    "",
    "---",
    "",
    prompts.recruiterEye.content,
    "",
    "---",
    "",
    "Combine both tasks. Output a single raw JSON object with keys:",
    "`headline` (string, one sentence), `about` (string, one sentence),",
    "`experience` (array of one-sentence strings, index-aligned with the",
    "rewritten experience entries), `skills` (string, one sentence),",
    "`recruiterEye` (array of { rank (int), observation (string), section",
    '("headline"|"about"|"experience"|"skills") }), and `confidence`',
    "({ headline, about, experience, skills } — integers 0-100).",
    "No markdown fence, no commentary.",
  ].join("\n");
  const userMessage = [
    "Original profile (before):",
    snapshot,
    "",
    "Rewritten profile (after):",
    JSON.stringify(profile),
  ].join("\n");
  return { system, userMessage };
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

    // Step 3: Retrieve top-k voice embeddings via pgvector cosine distance,
    // plus the active voice vector used as the RAG query against the corpus.
    const { voiceEmbeddings, queryVec } = await step.run(
      "load-voice-embeddings",
      async () => ({
        voiceEmbeddings: await loadVoiceEmbeddings(userId),
        queryVec: await loadActiveVoiceVector(userId),
      })
    );

    // Step 4: RAG — top-k benchmark exemplars for the user's voice vector.
    // Empty until the Wk4 corpus lands; retrieval returns [] safely.
    const exemplars = await step.run("retrieve-exemplars", async () =>
      queryVec
        ? retrieveSimilarProfiles(queryVec, { limit: EXEMPLAR_TOP_K })
        : []
    );

    const voiceSamples = `[voice vectors: ${voiceEmbeddings.length}]`;
    const userMessage = buildUserMessage(
      snapshot,
      transcript,
      voiceSamples,
      formatExemplars(exemplars)
    );

    // Step 5: Cap-guarded STREAMING generation call (cap checked + spend
    // recorded inside callLlmGuarded), then validate against the canonical
    // schema. Schema failure is deterministic → NonRetriableError.
    const profile = await step.run("generate", async () => {
      const client = new Anthropic();
      const raw = await callLlmGuarded(
        client,
        { system: prompts.profileGeneration.content, userMessage, maxTokens: MAX_TOKENS },
        { userId, generationId }
      );
      return validateProfile(raw, generationId);
    });

    // Step 6: Cap-guarded rationale + recruiter-eye call → canonical bundle.
    const rationale = await step.run("generate-rationale", async () => {
      const client = new Anthropic();
      const { system, userMessage: rMsg } = buildRationalePrompt(profile, snapshot);
      const raw = await callLlmGuarded(
        client,
        { system, userMessage: rMsg, maxTokens: RATIONALE_MAX_TOKENS },
        { userId, generationId }
      );
      const bundle = assembleRationaleBundle(raw, profile.experience.length);
      if (!bundle.ok) {
        throw new NonRetriableError("rationale output failed schema validation", {
          cause: new GenerationSchemaError(JSON.stringify(bundle.error)),
        });
      }
      return bundle.value;
    });

    // Step 7: Persist the validated profile + rationale bundle.
    // The POST /api/generate route OWNS the prompt-hash cache key (computed,
    // looked up over 24h, and stored on the placeholder row we update here), so
    // we never touch promptHash — overwriting it would defeat prompt caching.
    await step.run("store-generation", async () => {
      await db
        .update(generations)
        .set({ output: profile, rationale, model: MODEL })
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
