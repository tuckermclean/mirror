import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db/client.js";
import { interviews, users } from "@/db/schema.js";
import { prompts } from "@/lib/prompts/index.js";
import { recordLlmSpend } from "@/lib/billing/llm-ledger.js";

const client = new Anthropic();

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

  // 2. Parse request body
  let messages: MessageParam[];
  try {
    const body = (await request.json()) as { messages?: unknown; interviewId?: unknown };
    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
    }
    messages = (body.messages as unknown[]).filter((m): m is MessageParam => {
      if (typeof m !== "object" || m === null) return false;
      const obj = m as Record<string, unknown>;
      return (
        (obj["role"] === "user" || obj["role"] === "assistant") &&
        typeof obj["content"] === "string"
      );
    });
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 3. Resolve the internal user row from Clerk ID
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (userRows.length === 0) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  const internalUserId = userRows[0]!.id;

  // 4. Load or create an open interview row (upsert: find open, else insert)
  let interviewRow: {
    id: string;
    turnCount: number;
    transcript: unknown;
    completedAt: Date | null;
  };

  const existing = await db
    .select({
      id: interviews.id,
      turnCount: interviews.turnCount,
      transcript: interviews.transcript,
      completedAt: interviews.completedAt,
    })
    .from(interviews)
    .where(and(eq(interviews.userId, internalUserId), isNull(interviews.completedAt)))
    .limit(1);

  if (existing.length > 0) {
    interviewRow = existing[0]!;
  } else {
    const inserted = await db
      .insert(interviews)
      .values({ userId: internalUserId })
      .returning({
        id: interviews.id,
        turnCount: interviews.turnCount,
        transcript: interviews.transcript,
        completedAt: interviews.completedAt,
      });
    interviewRow = inserted[0]!;
  }

  // 5. Enforce 40-turn limit
  if (interviewRow.turnCount >= 40) {
    return NextResponse.json({ error: "interview_complete" }, { status: 400 });
  }

  // 6. Build the SSE stream
  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: prompts.interviewSystem.content,
          messages: messages as Anthropic.MessageParam[],
        });

        // Stream text chunks to client, stripping <interview_complete> as we go
        anthropicStream.on("text", (chunk: string) => {
          fullText += chunk;
          // Strip the tag from the chunk sent to the client; we only need
          // to check within the accumulated buffer since the tag might span chunks
          const stripped = chunk.replace(/<interview_complete>/g, "");
          if (stripped.length > 0) {
            const sseData = `data: ${JSON.stringify({ text: stripped })}\n\n`;
            controller.enqueue(encoder.encode(sseData));
          }
        });

        // Wait for stream to complete and get usage
        const finalMessage = await anthropicStream.finalMessage();
        const usage = finalMessage.usage;

        // Determine completion
        const isComplete = fullText.includes("<interview_complete>");

        // Send completion event
        const doneEvent = isComplete
          ? `data: ${JSON.stringify({ complete: true })}\n\ndata: [DONE]\n\n`
          : `data: [DONE]\n\n`;
        controller.enqueue(encoder.encode(doneEvent));
        controller.close();

        // 7. Post-stream DB updates — run after closing the stream
        const newTurnCount = interviewRow.turnCount + 1;
        const currentTranscript = parseTranscript(interviewRow.transcript);

        // Append the last user message and the new assistant message
        const lastUserMessage = messages[messages.length - 1];
        const newEntries: TranscriptEntry[] = [];
        if (lastUserMessage && lastUserMessage.role === "user") {
          newEntries.push({ role: "user", content: lastUserMessage.content });
        }
        // Strip the tag from the persisted transcript text
        const cleanedText = fullText.replace(/<interview_complete>/g, "").trim();
        newEntries.push({ role: "assistant", content: cleanedText });

        const updatedTranscript: TranscriptEntry[] = [...currentTranscript, ...newEntries];

        if (isComplete) {
          await db
            .update(interviews)
            .set({
              turnCount: newTurnCount,
              transcript: updatedTranscript,
              completedAt: new Date(),
            })
            .where(eq(interviews.id, interviewRow.id));
        } else {
          await db
            .update(interviews)
            .set({
              turnCount: newTurnCount,
              transcript: updatedTranscript,
            })
            .where(eq(interviews.id, interviewRow.id));
        }

        // 8. Record billing
        await recordLlmSpend({
          userId: internalUserId,
          model: "claude-sonnet-4-6",
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        });
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
