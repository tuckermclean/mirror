import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fixtureBytes(rel: string): Uint8Array {
  return Uint8Array.from(readFileSync(resolve(process.cwd(), rel)));
}

// Mock snapshot responses keyed by fixture name
const MOCK_SNAPSHOTS: Record<string, object> = {
  "resume-01.pdf": {
    name: "Jane Smith",
    headline: "Senior Software Engineer at Acme Corp",
    location: "San Francisco, CA",
    about: "Passionate about building scalable distributed systems.",
    experience: [
      { title: "Senior Software Engineer", company: "Acme Corp", duration: "Jan 2021 - Present" },
      { title: "Software Engineer", company: "Initech", duration: "Jun 2018 - Dec 2020" },
      { title: "Junior Engineer", company: "Startup Co", duration: "2016 - 2018" },
    ],
    education: [
      { school: "UC Berkeley", degree: "Bachelor of Science", field: "Computer Science", years: "2012 - 2016" },
    ],
    skills: ["TypeScript", "React", "Node.js", "Kubernetes", "PostgreSQL", "Redis", "Go", "Python", "AWS", "Docker"],
  },
  "resume-02.pdf": {
    name: "John Doe",
    headline: "Product Manager | B2B SaaS",
    location: "New York, NY",
    about: "Strategic product leader with 8+ years in enterprise software.",
    experience: [
      { title: "VP of Product", company: "BigCo", duration: "2022 - Present" },
      { title: "Senior PM", company: "MidCo", duration: "2020 - 2022" },
      { title: "PM", company: "StartupXYZ", duration: "2018 - 2020" },
      { title: "Associate PM", company: "Corp Inc", duration: "2016 - 2018" },
    ],
    education: [
      { school: "MIT", degree: "MBA", years: "2014 - 2016" },
      { school: "Stanford University", degree: "Bachelor of Arts", field: "Economics", years: "2010 - 2014" },
    ],
    skills: ["Product Strategy", "Roadmapping", "Agile", "SQL", "Analytics", "A/B Testing", "OKRs", "JIRA", "User Research", "Stakeholder Management", "B2B SaaS", "Enterprise Software"],
  },
  "resume-03.pdf": {
    name: "Alex Chen",
    headline: "Data Scientist",
    location: "Seattle, WA",
    about: "ML researcher turned industry practitioner.",
    experience: [
      { title: "Senior Data Scientist", company: "TechGiant", duration: "2021 - Present" },
      { title: "Data Scientist", company: "AI Startup", duration: "2019 - 2021" },
    ],
    education: [
      { school: "Carnegie Mellon University", degree: "Master of Science", field: "Machine Learning", years: "2017 - 2019" },
      { school: "UC San Diego", degree: "Bachelor of Science", field: "Mathematics", years: "2013 - 2017" },
    ],
    skills: ["Python", "TensorFlow", "PyTorch", "scikit-learn", "SQL", "Spark", "R", "Statistics", "Deep Learning", "NLP", "Computer Vision", "MLflow", "Kubernetes", "GCP", "BigQuery"],
  },
  "resume-04.pdf": {
    name: "Maria Garcia",
    headline: "Marketing Director",
    location: "Chicago, IL",
    experience: [
      { title: "Marketing Director", company: "BrandCo", duration: "2020 - Present" },
      { title: "Senior Marketing Manager", company: "AdAgency", duration: "2018 - 2020" },
      { title: "Marketing Manager", company: "RetailChain", duration: "2016 - 2018" },
      { title: "Marketing Coordinator", company: "SmallBiz", duration: "2014 - 2016" },
      { title: "Marketing Assistant", company: "Agency Inc", duration: "2012 - 2014" },
    ],
    education: [
      { school: "Northwestern University", degree: "Bachelor of Science", field: "Marketing", years: "2008 - 2012" },
    ],
    skills: ["Brand Strategy", "Digital Marketing", "SEO/SEM", "Content Marketing", "Email Marketing", "Social Media", "Analytics", "Campaign Management"],
  },
};

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules();

  vi.doMock("@anthropic-ai/sdk", () => {
    const mockCreate = vi.fn(async (_params: { messages: Array<{ content: Array<{ source?: { data?: string }; type: string }> }> }) => {
      // Determine which fixture by inspecting PDF content size
      // (in real usage the PDF bytes differ; here all our fixtures are the same small PDF)
      // We use the fixture index from test context via a closure variable set before mock
      const responseText = JSON.stringify(currentMockSnapshot);
      return {
        content: [{ type: "text", text: responseText }],
        usage: { input_tokens: 1000, output_tokens: 200 },
      };
    });

    return {
      default: vi.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
      })),
      __mockCreate: mockCreate,
    };
  });

  vi.doMock("@/lib/llm/cost-guard", () => ({
    checkMonthlyCap: vi.fn().mockResolvedValue({ allowed: true }),
    computeCostUsd: vi.fn().mockReturnValue(0.005),
    recordLlmSpend: vi.fn().mockResolvedValue(undefined),
  }));
});

afterEach(() => {
  vi.doUnmock("@anthropic-ai/sdk");
  vi.doUnmock("@/lib/llm/cost-guard");
  vi.resetModules();
});

// Current mock snapshot state (mutated per test)
let currentMockSnapshot: object = {};

// ---------------------------------------------------------------------------
// parseLinkedInPdf — 5 fixture PDFs
// ---------------------------------------------------------------------------

describe("parseLinkedInPdf — fixture PDFs", () => {
  it("fixture 01: extracts name and headline for Jane Smith", async () => {
    currentMockSnapshot = MOCK_SNAPSHOTS["resume-01.pdf"]!;
    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");

    const bytes = fixtureBytes("fixtures/resumes/resume-01.pdf");
    const { snapshot, partial } = await parseLinkedInPdf(bytes, "user-1");

    expect(snapshot.name).toBe("Jane Smith");
    expect(snapshot.headline).toBe("Senior Software Engineer at Acme Corp");
    expect(snapshot.location).toBe("San Francisco, CA");
    expect(snapshot.about).toContain("scalable distributed systems");
    expect(snapshot.experience).toHaveLength(3);
    expect(snapshot.education).toHaveLength(1);
    expect(snapshot.skills).toHaveLength(10);
    expect(partial).toBe(false);
  });

  it("fixture 02: extracts name and headline for John Doe", async () => {
    currentMockSnapshot = MOCK_SNAPSHOTS["resume-02.pdf"]!;
    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");

    const bytes = fixtureBytes("fixtures/resumes/resume-02.pdf");
    const { snapshot, partial } = await parseLinkedInPdf(bytes, "user-2");

    expect(snapshot.name).toBe("John Doe");
    expect(snapshot.headline).toBe("Product Manager | B2B SaaS");
    expect(snapshot.experience).toHaveLength(4);
    expect(snapshot.education).toHaveLength(2);
    expect(partial).toBe(false);
  });

  it("fixture 03: extracts name and headline for Alex Chen", async () => {
    currentMockSnapshot = MOCK_SNAPSHOTS["resume-03.pdf"]!;
    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");

    const bytes = fixtureBytes("fixtures/resumes/resume-03.pdf");
    const { snapshot } = await parseLinkedInPdf(bytes, "user-3");

    expect(snapshot.name).toBe("Alex Chen");
    expect(snapshot.headline).toBe("Data Scientist");
    expect(snapshot.skills.length).toBeGreaterThanOrEqual(10);
  });

  it("fixture 04: extracts name and headline for Maria Garcia (no about section)", async () => {
    currentMockSnapshot = MOCK_SNAPSHOTS["resume-04.pdf"]!;
    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");

    const bytes = fixtureBytes("fixtures/resumes/resume-04.pdf");
    const { snapshot, partial } = await parseLinkedInPdf(bytes, "user-4");

    expect(snapshot.name).toBe("Maria Garcia");
    expect(snapshot.headline).toBe("Marketing Director");
    expect(snapshot.about).toBeUndefined();
    expect(snapshot.experience).toHaveLength(5);
    expect(partial).toBe(false);
  });

  it("fixture 05 (malformed): returns partial data gracefully instead of throwing", async () => {
    // Simulate Claude returning invalid JSON for a malformed PDF
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "Sorry, I cannot parse this document." }],
            usage: { input_tokens: 100, output_tokens: 20 },
          }),
        },
      })),
    }));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = fixtureBytes("fixtures/resumes/resume-05-malformed.pdf");

    // Must NOT throw — returns partial data
    const { snapshot, partial } = await parseLinkedInPdf(bytes, "user-5");

    expect(partial).toBe(true);
    expect(snapshot.name).toBe("");
    expect(snapshot.headline).toBe("");
    expect(snapshot.experience).toEqual([]);
    expect(snapshot.education).toEqual([]);
    expect(snapshot.skills).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseLinkedInPdf — core behaviors
// ---------------------------------------------------------------------------

describe("parseLinkedInPdf — core behaviors", () => {
  it("returns partial=true when Claude returns malformed JSON", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "not json {{" }],
            usage: { input_tokens: 100, output_tokens: 10 },
          }),
        },
      })),
    }));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes

    const { snapshot, partial } = await parseLinkedInPdf(bytes, "user-x");
    expect(partial).toBe(true);
    expect(snapshot.name).toBe("");
  });

  it("returns partial=true when Claude returns no text block", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [],
            usage: { input_tokens: 100, output_tokens: 0 },
          }),
        },
      })),
    }));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const { partial } = await parseLinkedInPdf(bytes, "user-x");
    expect(partial).toBe(true);
  });

  it("strips markdown code fences from Claude JSON response", async () => {
    const snap = { name: "Test User", headline: "Engineer", experience: [], education: [], skills: [] };
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: "text", text: "```json\n" + JSON.stringify(snap) + "\n```" }],
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        },
      })),
    }));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const { snapshot, partial } = await parseLinkedInPdf(bytes, "user-x");
    expect(snapshot.name).toBe("Test User");
    expect(partial).toBe(false);
  });

  it("throws ApiError when Anthropic SDK throws", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: {
          create: vi.fn().mockRejectedValue(new Error("Rate limit exceeded")),
        },
      })),
    }));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const { ApiError } = await import("@/lib/errors");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const rejection = parseLinkedInPdf(bytes, "user-x");
    await expect(rejection).rejects.toThrow(ApiError);
    // Verify we get ApiError specifically, not just any Error
    await rejection.catch((err) => {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.name).toBe("ApiError");
    });
  });

  it("throws when monthly cap is exceeded", async () => {
    vi.doMock("@/lib/llm/cost-guard", () => ({
      checkMonthlyCap: vi.fn().mockResolvedValue({ allowed: false, resets_at: "2026-07-01T00:00:00.000Z" }),
      computeCostUsd: vi.fn(),
      recordLlmSpend: vi.fn(),
    }));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    await expect(parseLinkedInPdf(bytes, "user-x")).rejects.toThrow("monthly_cap_reached");
  });

  it("records LLM spend after a successful parse", async () => {
    currentMockSnapshot = { name: "Test", headline: "Engineer", experience: [], education: [], skills: [] };
    const recordLlmSpend = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/llm/cost-guard", () => ({
      checkMonthlyCap: vi.fn().mockResolvedValue({ allowed: true }),
      computeCostUsd: vi.fn().mockReturnValue(0.01),
      recordLlmSpend,
    }));

    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    await parseLinkedInPdf(bytes, "user-spend-test");
    expect(recordLlmSpend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-spend-test", model: "claude-sonnet-4-6" })
    );
  });

  it("accepts a File input", async () => {
    currentMockSnapshot = { name: "File User", headline: "Dev", experience: [], education: [], skills: [] };
    const { parseLinkedInPdf } = await import("@/lib/parsers/linkedin-pdf");

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const file = new File([pdfBytes], "profile.pdf", { type: "application/pdf" });

    const { snapshot } = await parseLinkedInPdf(file, "user-file");
    expect(snapshot.name).toBe("File User");
  });
});

// ---------------------------------------------------------------------------
// linkedInSnapshotToHistory
// ---------------------------------------------------------------------------

describe("linkedInSnapshotToHistory", () => {
  it("converts a full snapshot into a ParsedChatHistory with source=linkedin_pdf", async () => {
    const { linkedInSnapshotToHistory } = await import("@/lib/parsers/linkedin-pdf");

    const snapshot = {
      name: "Jane Smith",
      headline: "Engineer",
      location: "SF",
      about: "I build things.",
      experience: [
        { title: "SWE", company: "Acme", duration: "2020 - Now", description: "Built stuff." },
      ],
      education: [
        { school: "MIT", degree: "BS", field: "CS", years: "2016 - 2020" },
      ],
      skills: ["TypeScript", "React"],
    };

    const history = linkedInSnapshotToHistory(snapshot);

    expect(history.source).toBe("linkedin_pdf");
    expect(history.messages.length).toBeGreaterThan(0);
    expect(history.messages.every((m) => m.role === "user")).toBe(true);

    const texts = history.messages.map((m) => m.content);
    expect(texts.some((t) => t.includes("I build things"))).toBe(true);
    expect(texts.some((t) => t.includes("Acme"))).toBe(true);
    expect(texts.some((t) => t.includes("MIT"))).toBe(true);
    expect(texts.some((t) => t.includes("TypeScript"))).toBe(true);
  });

  it("produces an empty message list for a minimal snapshot", async () => {
    const { linkedInSnapshotToHistory } = await import("@/lib/parsers/linkedin-pdf");

    const snapshot = {
      name: "Ghost",
      headline: "Unknown",
      experience: [],
      education: [],
      skills: [],
    };

    const history = linkedInSnapshotToHistory(snapshot);
    expect(history.source).toBe("linkedin_pdf");
    expect(history.messages).toHaveLength(0);
  });

  it("includes skills as a single concatenated message", async () => {
    const { linkedInSnapshotToHistory } = await import("@/lib/parsers/linkedin-pdf");

    const snapshot = {
      name: "Skilful",
      headline: "Dev",
      experience: [],
      education: [],
      skills: ["Go", "Rust", "C++"],
    };

    const history = linkedInSnapshotToHistory(snapshot);
    const skillsMsg = history.messages.find((m) => m.content.includes("Skills:"));
    expect(skillsMsg).toBeDefined();
    expect(skillsMsg?.content).toContain("Go");
    expect(skillsMsg?.content).toContain("Rust");
  });
});
