import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { LinkedInSnapshot } from "@/types/linkedin";
import { fixtureBytes } from "./helpers";
import fixtureMetadata from "../../../fixtures/resumes/metadata.json";

// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

// Mock cost-guard to avoid DB hits in unit tests
vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: vi.fn().mockResolvedValue({ allowed: true }),
  computeCostUsd: vi.fn().mockReturnValue(0.001),
  recordLlmSpend: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnthropicResponse(jsonBody: unknown): {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
} {
  return {
    content: [{ type: "text", text: JSON.stringify(jsonBody) }],
    usage: { input_tokens: 500, output_tokens: 200 },
  };
}

function fullSnapshot(overrides: Partial<LinkedInSnapshot> = {}): LinkedInSnapshot {
  return {
    name: "Jane Doe",
    headline: "Senior Software Engineer",
    location: "San Francisco, CA",
    about: "Experienced engineer.",
    experience: [{ title: "SWE", company: "Acme" }],
    education: [{ school: "Stanford" }],
    skills: ["Python", "Go"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: parseLinkedInPdf
// ---------------------------------------------------------------------------

describe("LinkedIn PDF parser — parseLinkedInPdf", () => {
  beforeEach(() => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
  });

  // ---- Fixture-based tests ------------------------------------------------

  it.each(fixtureMetadata)(
    "parses fixture %s.file into a LinkedInSnapshot with name and headline",
    async ({ file, expected }) => {
      mockCreate.mockResolvedValue(
        makeAnthropicResponse({
          name: expected.name,
          headline: expected.headline,
          location: expected.location,
          about: expected.about,
          experience: [],
          education: [],
          skills: [],
        })
      );

      const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
      const bytes = fixtureBytes(`fixtures/resumes/${file}`);
      const result = await parseLinkedInPdf(bytes, "user-1");

      expect(result.name).toBe(expected.name);
      expect(result.headline).toBe(expected.headline);
      expect(result).toHaveProperty("experience");
      expect(result).toHaveProperty("education");
      expect(result).toHaveProperty("skills");
    }
  );

  // ---- Field extraction ---------------------------------------------------

  it("extracts all fields from the Claude response", async () => {
    const snapshot = fullSnapshot();
    mockCreate.mockResolvedValue(makeAnthropicResponse(snapshot));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic
    const result = await parseLinkedInPdf(bytes, "user-1");

    expect(result.name).toBe("Jane Doe");
    expect(result.headline).toBe("Senior Software Engineer");
    expect(result.location).toBe("San Francisco, CA");
    expect(result.about).toBe("Experienced engineer.");
    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]?.title).toBe("SWE");
    expect(result.experience[0]?.company).toBe("Acme");
    expect(result.education).toHaveLength(1);
    expect(result.education[0]?.school).toBe("Stanford");
    expect(result.skills).toEqual(["Python", "Go"]);
  });

  it("strips markdown code fences from the Claude response", async () => {
    const snapshot = fullSnapshot();
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "```json\n" + JSON.stringify(snapshot) + "\n```" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const result = await parseLinkedInPdf(bytes, "user-1");

    expect(result.name).toBe("Jane Doe");
    expect(result.headline).toBe("Senior Software Engineer");
  });

  it("returns partial data on malformed JSON response (no throw)", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "This is not JSON at all." }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    // Should not throw
    const result = await parseLinkedInPdf(bytes, "user-1");

    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("headline");
    expect(result.experience).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  it("returns partial data when the Anthropic API throws (no rethrow)", async () => {
    mockCreate.mockRejectedValue(new Error("Network timeout"));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const result = await parseLinkedInPdf(bytes, "user-1");

    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("headline");
    expect(result.headline).toContain("parse error");
  });

  it("accepts File input in addition to Uint8Array", async () => {
    const snapshot = fullSnapshot();
    mockCreate.mockResolvedValue(makeAnthropicResponse(snapshot));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const file = new File([bytes], "test.pdf", { type: "application/pdf" });

    const result = await parseLinkedInPdf(file, "user-1");
    expect(result.name).toBe("Jane Doe");
  });

  it("sends the PDF as a base64 document in the Anthropic messages API", async () => {
    const snapshot = fullSnapshot();
    mockCreate.mockResolvedValue(makeAnthropicResponse(snapshot));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await parseLinkedInPdf(bytes, "user-1");

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    const userMsg = call.messages[0];
    expect(userMsg.role).toBe("user");
    const docBlock = userMsg.content[0];
    expect(docBlock.type).toBe("document");
    expect(docBlock.source.type).toBe("base64");
    expect(docBlock.source.media_type).toBe("application/pdf");
    expect(typeof docBlock.source.data).toBe("string");
  });

  it("records LLM spend after a successful API call", async () => {
    const { recordLlmSpend } = await import("@/lib/llm/cost-guard");
    const snapshot = fullSnapshot();
    mockCreate.mockResolvedValue(makeAnthropicResponse(snapshot));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await parseLinkedInPdf(bytes, "user-42");

    expect(recordLlmSpend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-42" })
    );
  });

  it("throws ConfigurationError when monthly cap is exceeded", async () => {
    const { checkMonthlyCap } = await import("@/lib/llm/cost-guard");
    vi.mocked(checkMonthlyCap).mockResolvedValueOnce({
      allowed: false,
      resets_at: "2026-07-01T00:00:00.000Z",
    });

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    await expect(parseLinkedInPdf(bytes, "user-1")).rejects.toThrow(
      "Monthly LLM spend cap reached"
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws ConfigurationError when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env["ANTHROPIC_API_KEY"];

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    await expect(parseLinkedInPdf(bytes, "user-1")).rejects.toThrow(
      "ANTHROPIC_API_KEY"
    );
  });

  it("normalises skills to string array, discarding non-strings", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse({
        name: "Alice",
        headline: "Engineer",
        skills: ["Python", 42, null, "Go"],
        experience: [],
        education: [],
      })
    );

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const result = await parseLinkedInPdf(bytes, "user-1");

    expect(result.skills).toEqual(["Python", "Go"]);
  });

  it("defaults experience and education to empty arrays when missing", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse({ name: "Bob", headline: "PM" })
    );

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const result = await parseLinkedInPdf(bytes, "user-1");

    expect(result.experience).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.skills).toEqual([]);
  });
});
