import { describe, it, expect } from "vitest";
import type { ParsedChatHistory } from "@/lib/parsers/types";
import { extractVoiceCard } from "@/lib/voice/extract";

function historyFrom(...userMessages: string[]): ParsedChatHistory {
  return {
    source: "claude",
    messages: userMessages.map((content) => ({ role: "user", content })),
  } as ParsedChatHistory;
}

describe("extractVoiceCard — jargon scoping", () => {
  it("does not treat absence of 'guru' as hated jargon", () => {
    // 'guru' was removed from JARGON_CANDIDATES because it appears in
    // legitimate technical contexts (e.g. tool/product names). jargonHated
    // reports candidate buzzwords the user AVOIDS (absent from text); since
    // 'guru' is no longer a candidate, its absence must never surface here.
    const result = extractVoiceCard(
      historyFrom("This is a plain message with no buzzwords at all.")
    );
    expect(result.jargonHated).not.toContain("guru");
  });
});

describe("extractVoiceCard — deterministic emotional register tie-break", () => {
  it("returns the same register for equal-scoring categories across calls", () => {
    // Construct text that scores exactly 1 in two categories (formal + technical)
    // so the tie-break path is exercised. Avoid words from other categories.
    const text = "Therefore the system stands.";
    const first = extractVoiceCard(historyFrom(text)).emotionalRegister;
    const second = extractVoiceCard(historyFrom(text)).emotionalRegister;
    const third = extractVoiceCard(historyFrom(text)).emotionalRegister;
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("breaks ties by a fixed category priority (formal before technical)", () => {
    // "therefore" => formal:1, "system" => technical:1. Tie. The deterministic
    // tie-break must prefer the earliest category in the declared priority order.
    const result = extractVoiceCard(historyFrom("Therefore the system stands."));
    expect(result.emotionalRegister).toBe("formal, precise, structured");
  });
});

describe("extractVoiceCard — hedgesAvoided semantics", () => {
  it("lists hedges absent from the text (not present in user voice)", () => {
    const result = extractVoiceCard(historyFrom("This is concrete and direct."));
    // None of the hedge phrases appear, so all are reported as absent/avoided.
    expect(result.hedgesAvoided).toContain("I think");
    expect(result.hedgesAvoided).toContain("maybe");
  });

  it("excludes hedges that the user actually uses", () => {
    const result = extractVoiceCard(historyFrom("I think maybe this could work."));
    expect(result.hedgesAvoided).not.toContain("I think");
    expect(result.hedgesAvoided).not.toContain("maybe");
  });
});
