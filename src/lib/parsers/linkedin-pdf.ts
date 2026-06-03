import Anthropic from "@anthropic-ai/sdk";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { prompts } from "@/lib/prompts";
import { ConfigurationError } from "@/lib/errors";
import type { LinkedInSnapshot } from "@/types/linkedin";

const MODEL = "claude-sonnet-4-6" as const;

function getClient(): Anthropic {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new ConfigurationError("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function parseSnapshot(raw: string): Partial<LinkedInSnapshot> {
  let text = raw.trim();

  // Strip markdown code fences if present
  const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fence) {
    text = fence[1]!.trim();
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Partial<LinkedInSnapshot>;
  } catch {
    return {};
  }
}

function normaliseSnapshot(partial: Partial<LinkedInSnapshot>): LinkedInSnapshot {
  return {
    name: typeof partial.name === "string" ? partial.name.trim() : "",
    headline: typeof partial.headline === "string" ? partial.headline.trim() : "",
    location:
      typeof partial.location === "string" && partial.location.trim()
        ? partial.location.trim()
        : undefined,
    about:
      typeof partial.about === "string" && partial.about.trim()
        ? partial.about.trim()
        : undefined,
    experience: Array.isArray(partial.experience)
      ? partial.experience
          .filter(
            (e): e is { title: string; company: string } =>
              typeof e === "object" &&
              e !== null &&
              typeof (e as { title?: unknown }).title === "string" &&
              typeof (e as { company?: unknown }).company === "string"
          )
          .map((e) => ({
            title: (e as { title: string }).title,
            company: (e as { company: string }).company,
            duration:
              typeof (e as { duration?: unknown }).duration === "string"
                ? (e as { duration: string }).duration
                : undefined,
            description:
              typeof (e as { description?: unknown }).description === "string"
                ? (e as { description: string }).description
                : undefined,
          }))
      : [],
    education: Array.isArray(partial.education)
      ? partial.education
          .filter(
            (e): e is { school: string } =>
              typeof e === "object" &&
              e !== null &&
              typeof (e as { school?: unknown }).school === "string"
          )
          .map((e) => ({
            school: (e as { school: string }).school,
            degree:
              typeof (e as { degree?: unknown }).degree === "string"
                ? (e as { degree: string }).degree
                : undefined,
            field:
              typeof (e as { field?: unknown }).field === "string"
                ? (e as { field: string }).field
                : undefined,
            years:
              typeof (e as { years?: unknown }).years === "string"
                ? (e as { years: string }).years
                : undefined,
          }))
      : [],
    skills: Array.isArray(partial.skills)
      ? partial.skills.filter((s): s is string => typeof s === "string")
      : [],
  };
}

/**
 * Parse a LinkedIn PDF export into a structured LinkedInSnapshot.
 *
 * Sends the PDF bytes to Claude via the Anthropic document API.
 * Returns partial data (with empty/default fields) on parse failure
 * rather than throwing, so the Inngest function can still store what
 * was extracted and continue the pipeline.
 *
 * Throws only for configuration errors (missing API key, monthly cap
 * exceeded) and hard network failures.
 *
 * @param input - Raw PDF bytes as File or Uint8Array
 * @param userId - Clerk user ID for spend recording
 */
export async function parseLinkedInPdf(
  input: File | Uint8Array,
  userId: string
): Promise<LinkedInSnapshot> {
  const capResult = await checkMonthlyCap();
  if (!capResult.allowed) {
    throw new ConfigurationError(
      `Monthly LLM spend cap reached. Resets at ${capResult.resets_at}.`
    );
  }

  let bytes: Uint8Array;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(await input.arrayBuffer());
  }

  const client = getClient();
  const { content: systemPrompt } = prompts.pdfParse;

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: toBase64(bytes),
              },
            },
            {
              type: "text",
              text: "Extract the LinkedIn profile information from this PDF and return it as JSON.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    // API error — return minimal partial snapshot so the pipeline can continue
    const name = "";
    const headline =
      err instanceof Error ? `[parse error: ${err.message}]` : "[parse error]";
    return normaliseSnapshot({ name, headline });
  }

  const costUsd = computeCostUsd(
    MODEL,
    response.usage.input_tokens,
    response.usage.output_tokens
  );
  await recordLlmSpend({
    userId,
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsd,
  });

  const rawText =
    response.content.find((b) => b.type === "text")?.text ?? "";

  const partial = parseSnapshot(rawText);
  return normaliseSnapshot(partial);
}
