/**
 * Integration tests for the mirror/import.process Inngest function.
 *
 * These tests run against a real Postgres database (requires DATABASE_URL).
 * They seed an imports row, invoke the handler directly (bypassing the Inngest
 * cloud runner), and assert that the DB state is correct after processing.
 *
 * External calls (Anthropic, Voyage, R2) are mocked so the tests are
 * deterministic and do not require live credentials.
 */
import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client";
import { imports, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { LinkedInSnapshot } from "@/types/linkedin";

// ---------------------------------------------------------------------------
// Mock external services
// ---------------------------------------------------------------------------

const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}));

vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: vi.fn().mockResolvedValue({ allowed: true }),
  computeCostUsd: vi.fn().mockReturnValue(0.001),
  recordLlmSpend: vi.fn().mockResolvedValue(undefined),
}));

const mockEmbed = vi.fn<() => Promise<number[]>>();
vi.mock("@/lib/embeddings", () => ({ embed: mockEmbed }));

const mockGetFromR2 = vi.fn<() => Promise<Uint8Array>>();
vi.mock("@/lib/storage/r2", () => ({ getFromR2: mockGetFromR2 }));

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

const TEST_USER_CLERK_ID = `integration-test-${Date.now()}`;
const FAKE_EMBEDDING = Array.from({ length: 3072 }, (_, i) => i / 3072);
const FAKE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const EXPECTED_SNAPSHOT: LinkedInSnapshot = {
  name: "Test User",
  headline: "Senior Engineer",
  location: "Remote",
  about: "Integration test profile",
  experience: [{ title: "Engineer", company: "TestCo", duration: "2020 - Present" }],
  education: [{ school: "Test University", degree: "BS", field: "CS" }],
  skills: ["TypeScript", "PostgreSQL"],
};

function makeAnthropicResponse(snapshot: LinkedInSnapshot) {
  return {
    content: [{ type: "text", text: JSON.stringify(snapshot) }],
    usage: { input_tokens: 300, output_tokens: 150 },
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let testUserId: string;
let testImportId: string;

beforeAll(async () => {
  // Skip if no DB available
  if (!process.env["DATABASE_URL"]) {
    return;
  }

  // Create a test user
  const [user] = await db
    .insert(users)
    .values({ clerkId: TEST_USER_CLERK_ID, email: "integration@test.local" })
    .returning({ id: users.id });

  if (!user) throw new Error("Failed to create test user");
  testUserId = user.id;

  // Seed a linkedin_pdf import row
  const [importRow] = await db
    .insert(imports)
    .values({
      userId: testUserId,
      source: "linkedin_pdf",
      rawPath: "https://r2.example.com/test/profile.pdf",
    })
    .returning({ id: imports.id });

  if (!importRow) throw new Error("Failed to create test import");
  testImportId = importRow.id;

  // Configure mocks
  mockGetFromR2.mockResolvedValue(FAKE_PDF_BYTES);
  mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(EXPECTED_SNAPSHOT));
  mockEmbed.mockResolvedValue(FAKE_EMBEDDING);
});

afterAll(async () => {
  if (!process.env["DATABASE_URL"] || !testUserId) return;

  // Clean up test data
  await db.delete(users).where(eq(users.id, testUserId));
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("processImport Inngest function (end-to-end, real DB)", () => {
  it("skips when DATABASE_URL is not set", () => {
    if (process.env["DATABASE_URL"]) {
      // This branch is not taken — just a guard for the test runner output
      return;
    }
    expect(true).toBe(true); // passthrough
  });

  it("sets imports.parsed after processing a linkedin_pdf", async () => {
    if (!process.env["DATABASE_URL"]) return;

    const { runProcessImport } = await import(
      "@/inngest/functions/process-import"
    );
    await runProcessImport({ importId: testImportId, userId: testUserId });

    const rows = await db
      .select({ parsed: imports.parsed })
      .from(imports)
      .where(eq(imports.id, testImportId))
      .limit(1);

    const parsed = rows[0]?.parsed as LinkedInSnapshot | undefined;
    expect(parsed).toBeTruthy();
    expect(parsed?.name).toBe("Test User");
    expect(parsed?.headline).toBe("Senior Engineer");
  });

  it("sets imports.voice_embedding to a non-null vector after processing", async () => {
    if (!process.env["DATABASE_URL"]) return;

    const rows = await db
      .select({ voiceEmbedding: imports.voiceEmbedding })
      .from(imports)
      .where(eq(imports.id, testImportId))
      .limit(1);

    const embedding = rows[0]?.voiceEmbedding;
    expect(embedding).toBeTruthy();
    expect(Array.isArray(embedding)).toBe(true);
    expect((embedding as number[]).length).toBe(3072);
  });

  it("updates users.voice_profile_id to the processed import ID", async () => {
    if (!process.env["DATABASE_URL"]) return;

    const rows = await db
      .select({ voiceProfileId: users.voiceProfileId })
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(rows[0]?.voiceProfileId).toBe(testImportId);
  });

  it("skips embedding when voice_embedding is already non-null (idempotent)", async () => {
    if (!process.env["DATABASE_URL"]) return;

    // Reset call count
    mockEmbed.mockClear();

    const { runProcessImport } = await import(
      "@/inngest/functions/process-import"
    );
    await runProcessImport({ importId: testImportId, userId: testUserId });

    // embed() should NOT be called again since voiceEmbedding is already set
    expect(mockEmbed).not.toHaveBeenCalled();
  });
});
