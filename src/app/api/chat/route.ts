import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { interviews, users } from "@/db/schema";
import { prompts } from "@/lib/prompts/index";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = new Anthropic();

const MAX_MESSAGES = 80; // 2 per turn × 40 turns
const MAX_CONTENT_CHARS = 10_000;
const COMPLETE_TAG = "<interview_complete>";
const COMPLETE_TAG_LEN = COMPLETE_TAG.length;

type MessageParam = {
  role: "user" | "assistant";
  content: string;
};

type TranscriptEntry = {
  role: "user" | "assistant";
  content: string;
};

function isTranscriptEntry(value: unknown): value is TranscriptEntry {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    (obj["role"] === "user" || obj["role"] === "assistant") &&
    typeof obj["content"] === "string"
  );
}

function parseTranscript(raw: unknown): TranscriptEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isTranscriptEntry);
}

export async function POST(request: NextRequest): Promise<NextResponse | Response> {
  // 1. Authenticate
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate request body
  let newUserMessage: string;
  try {
    const body = (await request.json()) as { messages?: unknown };
    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
    }
    if (body.messages.length > MAX_MESSAGES) {
      return NextResponse.json({ error: "too_many_messages" }, { status: 400 });
    }
    const msgs = (body.messages as unknown[]).filter((m): m is MessageParam => {
      if (typeof m !== "object" || m === null) return false;
      const obj = m as Record<string, unknown>;
      return (
        (obj["role"] === "user" || obj["role"] === "assistant") &&
        typeof obj["content"] === "string"
      );
    });
    const last = msgs.at(-1);
    if (!last || last.role !== "user") {
      return NextResponse.json({ error: "last_message_must_be_user" }, { status: 400 });
    }
    if (last.content.length > MAX_CONTENT_CHARS) {
      return NextResponse.json({ error: "message_too_long" }, { status: 400 });
    }
    newUserMessage = last.content;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 3. Resolve internal user row from Clerk ID
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (userRows.length === 0) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  const internalUserId = userRows[0]!.id;

  // 3b. Monthly spend cap check — must pass before starting any generation.
  // Known tolerance: the check and recordLlmSpend are separate DB operations
  // separated by the LLM stream (~seconds). Under concurrent requests, multiple
  // streams can pass the cap check before any record spend. The overshoot is
  // bounded to (concurrent streams × max_tokens cost), acceptable for a soft
  // platform budget guard. A SELECT FOR UPDATE on a budget row would eliminate
  // this but requires a schema migration out of scope for this feature.
  const capResult = await checkMonthlyCap();
  if (!capResult.allowed) {
    const resetDate = new Date(capResult.resets_at).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    return NextResponse.json(
      {
        error: "monthly_cap_reached",
        message: `Mirror has reached this month's generation budget. Try again on ${resetDate}, or contact support to upgrade.`,
        resets_at: capResult.resets_at,
      },
      { status: 402 }
    );
  }

  // 4. Find or create the open interview row
  const existing = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(and(eq(interviews.userId, internalUserId), isNull(interviews.completedAt)))
    .limit(1);

  let interviewId: string;
  if (existing.length > 0) {
    interviewId = existing[0]!.id;
  } else {
    const inserted = await db
      .insert(interviews)
      .values({ userId: internalUserId })
      .returning({ id: interviews.id });
    interviewId = inserted[0]!.id;
  }

  // 5. Atomically claim one turn (prevents concurrent double-billing races).
  // Increments turn_count in the same statement that enforces the limit; if
  // the row is already complete or at 40 turns, 0 rows are returned → 400.
  const claimed = await db
    .update(interviews)
    .set({ turnCount: sql`${interviews.turnCount} + 1` })
    .where(
      and(
        eq(interviews.id, interviewId),
        isNull(interviews.completedAt),
        sql`${interviews.turnCount} < 40`
      )
    )
    .returning({
      id: interviews.id,
      turnCount: interviews.turnCount,
      // eslint-disable-next-line no-restricted-syntax -- TODO: migrate to readPii() (returning() clause, needs refactor to separate select step)
      transcript: interviews.transcript,
    });

  if (claimed.length === 0) {
    return NextResponse.json({ error: "interview_complete" }, { status: 400 });
  }
  const interviewRow = claimed[0]!;

  // 6. Build authoritative message history from the DB transcript.
  // The client message list is used only to extract the new user message;
  // history comes from the DB so callers cannot forge prior turns.
  const dbTranscript = parseTranscript(interviewRow.transcript);
  const authoritative: MessageParam[] = [
    ...dbTranscript,
    { role: "user", content: newUserMessage },
  ];

  // 7. Build the SSE stream
  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: prompts.interviewSystem.content,
          messages: authoritative as Anthropic.MessageParam[],
        });

        // Stream text with a lookahead buffer to prevent a partial tag from
        // leaking to the client when <interview_complete> spans two chunks.
        let sendBuffer = "";
        anthropicStream.on("text", (chunk: string) => {
          fullText += chunk;
          sendBuffer += chunk;

          const safe =
            sendBuffer.length > COMPLETE_TAG_LEN - 1
              ? sendBuffer.length - (COMPLETE_TAG_LEN - 1)
              : 0;

          if (safe > 0) {
            const toSend = sendBuffer.slice(0, safe).replace(new RegExp(COMPLETE_TAG, "g"), "");
            sendBuffer = sendBuffer.slice(safe);
            if (toSend.length > 0) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: toSend })}\n\n`)
              );
            }
          }
        });

        const finalMessage = await anthropicStream.finalMessage();

        // Flush remaining buffer after stream ends
        const remaining = sendBuffer.replace(new RegExp(COMPLETE_TAG, "g"), "");
        if (remaining.length > 0) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: remaining })}\n\n`)
          );
        }

        const isComplete = fullText.includes(COMPLETE_TAG);
        const doneEvent = isComplete
          ? `data: ${JSON.stringify({ complete: true })}\n\ndata: [DONE]\n\n`
          : `data: [DONE]\n\n`;
        controller.enqueue(encoder.encode(doneEvent));
        controller.close();

        // 8. Post-stream DB update + billing — isolated try/catch so a
        // persistence failure cannot attempt to enqueue on the closed controller.
        try {
          const cleanedText = fullText.replace(new RegExp(COMPLETE_TAG, "g"), "").trim();
          const updatedTranscript: TranscriptEntry[] = [
            ...parseTranscript(interviewRow.transcript),
            { role: "user", content: newUserMessage },
            { role: "assistant", content: cleanedText },
          ];

          await db
            .update(interviews)
            .set({
              transcript: updatedTranscript,
              ...(isComplete ? { completedAt: new Date() } : {}),
            })
            .where(eq(interviews.id, interviewRow.id));

          const model = "claude-sonnet-4-6";
          await recordLlmSpend({
            userId: internalUserId,
            model,
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
            costUsd: computeCostUsd(model, finalMessage.usage.input_tokens, finalMessage.usage.output_tokens),
          });
        } catch (persistErr) {
          console.error("[chat] post-stream persist failed:", persistErr);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "stream_error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
