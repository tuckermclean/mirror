import type { ParsedChatHistory } from "@/lib/parsers/types";
import type { LinkedInSnapshot } from "@/types/linkedin";

export type VoiceCard = {
  summary: string;
  source: "chat_history" | "linkedin_pdf";
};

/**
 * Distil a parsed import into a compact Voice Card text used for embedding.
 *
 * For chat history: concatenates the user-side messages into a representative
 * corpus that captures the person's authentic voice and recurring topics.
 *
 * For LinkedIn snapshots: serialises the structured profile fields into a
 * rich prose paragraph optimised for semantic similarity search.
 */
export function extractVoiceCard(
  parsed: ParsedChatHistory | LinkedInSnapshot
): VoiceCard {
  if (isLinkedInSnapshot(parsed)) {
    return extractFromLinkedIn(parsed);
  }
  return extractFromChatHistory(parsed);
}

function isLinkedInSnapshot(
  parsed: ParsedChatHistory | LinkedInSnapshot
): parsed is LinkedInSnapshot {
  return "name" in parsed && "headline" in parsed && "experience" in parsed;
}

function extractFromLinkedIn(snapshot: LinkedInSnapshot): VoiceCard {
  const parts: string[] = [];

  parts.push(`${snapshot.name} — ${snapshot.headline}`);

  if (snapshot.location) {
    parts.push(`Location: ${snapshot.location}`);
  }

  if (snapshot.about) {
    parts.push(`About: ${snapshot.about}`);
  }

  if (snapshot.experience.length > 0) {
    const expLines = snapshot.experience.map((e) => {
      const base = `${e.title} at ${e.company}`;
      const extras = [e.duration, e.description].filter(Boolean).join(" — ");
      return extras ? `${base} (${extras})` : base;
    });
    parts.push(`Experience: ${expLines.join("; ")}`);
  }

  if (snapshot.education.length > 0) {
    const eduLines = snapshot.education.map((e) => {
      const parts = [e.degree, e.field].filter(Boolean).join(" in ");
      return parts ? `${parts} at ${e.school}` : e.school;
    });
    parts.push(`Education: ${eduLines.join("; ")}`);
  }

  if (snapshot.skills.length > 0) {
    parts.push(`Skills: ${snapshot.skills.slice(0, 30).join(", ")}`);
  }

  return { summary: parts.join("\n"), source: "linkedin_pdf" };
}

function extractFromChatHistory(history: ParsedChatHistory): VoiceCard {
  const userMessages = history.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n\n");

  const summary = userMessages.slice(0, 8_000);
  return { summary, source: "chat_history" };
}
