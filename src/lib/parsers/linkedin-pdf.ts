import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { checkMonthlyCap, computeCostUsd, recordLlmSpend } from "@/lib/llm/cost-guard";
import { ApiError, MonthlyCapError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { LinkedInSnapshot } from "@/types/linkedin";
import type { ParsedChatHistory } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "../prompts");

const MODEL = "claude-sonnet-4-6";

// Loaded once at module init — the prompt is static at runtime
const SYSTEM_PROMPT = readFileSync(join(PROMPTS_DIR, "pdf_parse.md"), "utf-8");

function isLinkedInSnapshot(value: unknown): value is LinkedInSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["name"] !== "string") return false;
  if (typeof v["headline"] !== "string") return false;
  if (!Array.isArray(v["experience"])) return false;
  if (!Array.isArray(v["education"])) return false;
  if (!Array.isArray(v["skills"])) return false;
  return true;
}

function toPartialSnapshot(raw: unknown): LinkedInSnapshot {
  if (typeof raw !== "object" || raw === null) {
    return { name: "", headline: "", experience: [], education: [], skills: [] };
  }
  const v = raw as Record<string, unknown>;

  const experience = Array.isArray(v["experience"])
    ? (v["experience"] as unknown[]).flatMap((e) => {
        if (typeof e !== "object" || e === null) return [];
        const exp = e as Record<string, unknown>;
        if (typeof exp["title"] !== "string" || typeof exp["company"] !== "string") return [];
        const item: LinkedInSnapshot["experience"][number] = {
          title: exp["title"],
          company: exp["company"],
        };
        if (typeof exp["duration"] === "string") item.duration = exp["duration"];
        if (typeof exp["description"] === "string") item.description = exp["description"];
        return [item];
      })
    : [];

  const education = Array.isArray(v["education"])
    ? (v["education"] as unknown[]).flatMap((e) => {
        if (typeof e !== "object" || e === null) return [];
        const edu = e as Record<string, unknown>;
        if (typeof edu["school"] !== "string") return [];
        const item: LinkedInSnapshot["education"][number] = { school: edu["school"] };
        if (typeof edu["degree"] === "string") item.degree = edu["degree"];
        if (typeof edu["field"] === "string") item.field = edu["field"];
        if (typeof edu["years"] === "string") item.years = edu["years"];
        return [item];
      })
    : [];

  const skills = Array.isArray(v["skills"])
    ? (v["skills"] as unknown[]).filter((s): s is string => typeof s === "string")
    : [];

  const result: LinkedInSnapshot = {
    name: typeof v["name"] === "string" ? v["name"] : "",
    headline: typeof v["headline"] === "string" ? v["headline"] : "",
    experience,
    education,
    skills,
  };

  if (typeof v["location"] === "string") result.location = v["location"];
  if (typeof v["about"] === "string") result.about = v["about"];

  return result;
}

export type LinkedInParseResult = {
  snapshot: LinkedInSnapshot;
  partial: boolean;
};

/**
 * Parse a LinkedIn profile PDF using Claude's document understanding API.
 *
 * Returns partial data (with partial: true) rather than throwing on Claude
 * response parse failures. Throws only on hard API errors or monthly cap exceeded.
 */
export async function parseLinkedInPdf(
  input: File | Buffer | Uint8Array,
  userId: string
): Promise<LinkedInParseResult> {
  const cap = await checkMonthlyCap();
  if (!cap.allowed) {
    throw new MonthlyCapError(cap.resets_at);
  }

  let bytes: Uint8Array;
  if (input instanceof File) {
    bytes = new Uint8Array(await input.arrayBuffer());
  } else if (Buffer.isBuffer(input)) {
    bytes = new Uint8Array(input);
  } else {
    bytes = input;
  }

  const base64Data = Buffer.from(bytes).toString("base64");
  const client = new Anthropic();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: "Extract the LinkedIn profile data from this PDF and return JSON.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    throw new ApiError(
      `Anthropic API error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = computeCostUsd(MODEL, inputTokens, outputTokens);

  await recordLlmSpend({ userId, model: MODEL, inputTokens, outputTokens, costUsd });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    logger.warn("linkedin-pdf: no text block in response, returning empty snapshot", { userId });
    return {
      snapshot: { name: "", headline: "", experience: [], education: [], skills: [] },
      partial: true,
    };
  }

  let parsed: unknown;
  try {
    const raw = textBlock.text.trim();
    const jsonText = raw.startsWith("```")
      ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      : raw;
    parsed = JSON.parse(jsonText);
  } catch {
    logger.warn("linkedin-pdf: JSON parse failed", { userId, text: textBlock.text.slice(0, 200) });
    return {
      snapshot: { name: "", headline: "", experience: [], education: [], skills: [] },
      partial: true,
    };
  }

  const snapshot = toPartialSnapshot(parsed);
  const partial = !isLinkedInSnapshot(parsed);

  return { snapshot, partial };
}

/**
 * Convert a LinkedInSnapshot into a ParsedChatHistory so it can flow through
 * the same voice-embedding pipeline as AI chat history imports.
 *
 * Each experience entry and the about section become "user" messages,
 * giving the voice extractor enough textual signal to build a voice card.
 */
export function linkedInSnapshotToHistory(snapshot: LinkedInSnapshot): ParsedChatHistory {
  const messages: ParsedChatHistory["messages"] = [];

  if (snapshot.about) {
    messages.push({ role: "user", content: snapshot.about });
  }

  for (const exp of snapshot.experience) {
    const parts = [exp.title, "at", exp.company];
    if (exp.duration) parts.push(`(${exp.duration})`);
    if (exp.description) parts.push(`— ${exp.description}`);
    messages.push({ role: "user", content: parts.join(" ") });
  }

  for (const edu of snapshot.education) {
    const parts = [edu.school];
    if (edu.degree) parts.push(edu.degree);
    if (edu.field) parts.push(`in ${edu.field}`);
    if (edu.years) parts.push(`(${edu.years})`);
    messages.push({ role: "user", content: parts.join(" — ") });
  }

  if (snapshot.skills.length > 0) {
    messages.push({ role: "user", content: `Skills: ${snapshot.skills.join(", ")}` });
  }

  return { source: "linkedin_pdf", messages };
}
