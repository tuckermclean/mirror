/**
 * Integration tests for the process-import Inngest function.
 *
 * Requires DATABASE_URL to be set (runs against a real Postgres DB).
 * External APIs (Anthropic, Voyage AI, R2) are mocked so the test
 * runs in CI without live credentials.
 *
 * Validates the full state machine:
 *   seeded import row → parse → embed → imports.voice_embedding set
 *   → users.voice_profile_id updated
 *
 * Invocation: InngestFunction stores the user-supplied callback as `.fn`.
 * We call it directly with a mock `step` that executes each step.run()
 * callback synchronously — no Inngest server needed, no silent skips.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { imports, users } from "@/db/schema";
import { readImportParsed } from "@/lib/db/pii-read";

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before any dynamic imports)
// ---------------------------------------------------------------------------

vi.mock("@/lib/storage/r2", () => ({
  fetchFromR2: vi.fn().mockResolvedValue(
    // Minimal text content representing a LinkedIn PDF import
    new TextEncoder().encode("Jane Smith\nSenior Engineer at Acme\nSan Francisco")
  ),
}));

vi.mock("@/lib/parsers/linkedin-pdf", async () => {
  const actual = await vi.importActual<typeof import("@/lib/parsers/linkedin-pdf")>(
    "@/lib/parsers/linkedin-pdf"
  );
  return {
    ...actual,
    parseLinkedInPdf: vi.fn().mockResolvedValue({
      snapshot: {
        name: "Jane Smith",
        headline: "Senior Engineer at Acme",
        location: "San Francisco",
        about: "Building great products.",
        experience: [{ title: "Senior Engineer", company: "Acme", duration: "2020 - Present" }],
        education: [{ school: "UC Berkeley", degree: "BS", field: "CS", years: "2016 - 2020" }],
        skills: ["TypeScript", "React"],
      },
      partial: false,
    }),
  };
});

vi.mock("@/lib/embeddings", () => ({
  embedVoiceProfile: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
}));

vi.mock("@/lib/llm/cost-guard", () => ({
  checkMonthlyCap: vi.fn().mockResolvedValue({ allowed: true }),
  computeCostUsd: vi.fn().mockReturnValue(0.005),
  recordLlmSpend: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedUser(): Promise<string> {
  const clerkId = `test-clerk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(users)
    .values({ clerkId, email: `${clerkId}@test.example.com` })
    .returning({ id: users.id });
  if (!user) throw new Error("Failed to seed user");
  return user.id;
}

async function seedImport(userId: string, source: string): Promise<string> {
  const [imp] = await db
    .insert(imports)
    .values({ userId, source, rawPath: `test-imports/${userId}/profile.pdf` })
    .returning({ id: imports.id });
  if (!imp) throw new Error("Failed to seed import");
  return imp.id;
}

async function cleanupUser(userId: string): Promise<void> {
  // Cascade deletes imports and related rows
  await db.delete(users).where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processImport — integration (real DB, mocked APIs)", () => {
  let userId: string;
  let importId: string;

  beforeEach(async () => {
    userId = await seedUser();
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  it("processes a linkedin_pdf import end-to-end: sets parsed and voice_embedding", async () => {
    importId = await seedImport(userId, "linkedin_pdf");

    const { processImport } = await import("@/inngest/functions/process-import");

    // Invoke the handler directly (bypassing Inngest event routing)
    // Inngest v4 stores the raw callback on .fn; fall back to .handler/.run for
    // older shapes. Throw rather than silently skip so any API shape change is
    // immediately visible instead of causing tests to pass vacuously.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = processImport as any;
    if (typeof fn.fn === "function") {
      const mockStep = { run: async (_id: string, cb: () => Promise<unknown>) => cb() };
      await fn.fn({ event: { name: "mirror/import.process", data: { importId } }, step: mockStep });
    } else if (typeof fn.handler === "function") {
      await fn.handler({ event: { data: { importId } } });
    } else if (typeof fn.run === "function") {
      await fn.run({ event: { name: "mirror/import.process", data: { importId } } });
    } else {
      throw new Error("Cannot invoke processImport — update invocation pattern for this Inngest version");
    }

    // Check imports.parsed is set (via PII wrapper)
    const parsedRow = await readImportParsed(importId, userId, "integration test: verify parsed output");
    const [impEmbed] = await db
      .select({ voiceEmbedding: imports.voiceEmbedding })
      .from(imports)
      .where(eq(imports.id, importId))
      .limit(1);

    expect(parsedRow).toBeDefined();
    expect(parsedRow?.parsed).not.toBeNull();

    // Check imports.voice_embedding is non-null
    expect(impEmbed?.voiceEmbedding).not.toBeNull();
    expect(Array.isArray(impEmbed?.voiceEmbedding)).toBe(true);

    // Check users.voice_profile_id is updated
    const [user] = await db
      .select({ voiceProfileId: users.voiceProfileId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    expect(user?.voiceProfileId).toBe(importId);
  });

  it("returns error when import row does not exist", async () => {
    const { processImport } = await import("@/inngest/functions/process-import");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = processImport as any;
    const ctx = { event: { name: "mirror/import.process", data: { importId: "00000000-0000-0000-0000-000000000000" } } };
    const mockStep = { run: async (_id: string, cb: () => Promise<unknown>) => cb() };

    let result: unknown;
    if (typeof fn.fn === "function") {
      result = await fn.fn({ ...ctx, step: mockStep });
    } else if (typeof fn.handler === "function") {
      result = await fn.handler(ctx);
    } else if (typeof fn.run === "function") {
      result = await fn.run(ctx);
    } else {
      throw new Error("Cannot invoke processImport — update invocation pattern for this Inngest version");
    }

    expect(result).toMatchObject({ error: "import_not_found" });
  });

  it("processes a chatgpt_zip import end-to-end", async () => {
    // Override R2 mock to return a valid ChatGPT zip structure
    const { zipSync, strToU8 } = await import("fflate");
    const conversations = JSON.stringify([{
      id: "c1", title: "Career chat", create_time: 1, update_time: 2,
      mapping: {
        n1: {
          id: "n1",
          message: { id: "m1", author: { role: "user" }, content: { content_type: "text", parts: ["I want to grow in my career"] }, create_time: 1 },
          parent: null, children: [],
        },
      },
    }]);
    const zipBytes = zipSync({ "conversations.json": strToU8(conversations) });

    const { fetchFromR2 } = await import("@/lib/storage/r2");
    vi.mocked(fetchFromR2).mockResolvedValueOnce(zipBytes);

    importId = await seedImport(userId, "chatgpt_zip");

    const { processImport } = await import("@/inngest/functions/process-import");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn2 = processImport as any;
    const ctx = { event: { name: "mirror/import.process", data: { importId } } };
    const mockStep2 = { run: async (_id: string, cb: () => Promise<unknown>) => cb() };

    if (typeof fn2.fn === "function") {
      await fn2.fn({ ...ctx, step: mockStep2 });
    } else if (typeof fn2.handler === "function") {
      await fn2.handler(ctx);
    } else if (typeof fn2.run === "function") {
      await fn2.run(ctx);
    } else {
      throw new Error("Cannot invoke processImport — update invocation pattern for this Inngest version");
    }

    const parsedRow2 = await readImportParsed(importId, userId, "integration test: verify parsed output");
    const [impEmbed2] = await db
      .select({ voiceEmbedding: imports.voiceEmbedding })
      .from(imports)
      .where(eq(imports.id, importId))
      .limit(1);

    expect(parsedRow2?.parsed).not.toBeNull();
    expect(impEmbed2?.voiceEmbedding).not.toBeNull();
  });

  it("sets imports.status to 'done' on successful processing", async () => {
    importId = await seedImport(userId, "linkedin_pdf");

    const { processImport } = await import("@/inngest/functions/process-import");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = processImport as any;
    const ctx = { event: { name: "mirror/import.process", data: { importId } } };
    const mockStep = { run: async (_id: string, cb: () => Promise<unknown>) => cb() };

    if (typeof fn.fn === "function") {
      await fn.fn({ ...ctx, step: mockStep });
    } else if (typeof fn.handler === "function") {
      await fn.handler(ctx);
    } else if (typeof fn.run === "function") {
      await fn.run(ctx);
    } else {
      throw new Error("Cannot invoke processImport — update invocation pattern for this Inngest version");
    }

    const [row] = await db
      .select({ status: imports.status })
      .from(imports)
      .where(eq(imports.id, importId))
      .limit(1);

    expect(row?.status).toBe("done");
  });

  it("sets imports.status to 'failed' when fetch-and-parse throws a permanent error (MonthlyCapError)", async () => {
    importId = await seedImport(userId, "linkedin_pdf");

    const { fetchFromR2 } = await import("@/lib/storage/r2");
    const { MonthlyCapError } = await import("@/lib/errors");
    vi.mocked(fetchFromR2).mockRejectedValueOnce(new MonthlyCapError("Monthly LLM cap reached"));

    const { processImport } = await import("@/inngest/functions/process-import");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = processImport as any;
    const ctx = { event: { name: "mirror/import.process", data: { importId } } };
    const mockStep = { run: async (_id: string, cb: () => Promise<unknown>) => cb() };

    let result: unknown;
    if (typeof fn.fn === "function") {
      result = await fn.fn({ ...ctx, step: mockStep });
    } else if (typeof fn.handler === "function") {
      result = await fn.handler(ctx);
    } else if (typeof fn.run === "function") {
      result = await fn.run(ctx);
    } else {
      throw new Error("Cannot invoke processImport — update invocation pattern for this Inngest version");
    }

    expect(result).toMatchObject({ error: "permanent_failure" });

    const [row] = await db
      .select({ status: imports.status })
      .from(imports)
      .where(eq(imports.id, importId))
      .limit(1);

    expect(row?.status).toBe("failed");
  });

  it("leaves imports.status as 'processing' when fetch-and-parse throws a retriable error (StorageError)", async () => {
    importId = await seedImport(userId, "linkedin_pdf");

    const { fetchFromR2 } = await import("@/lib/storage/r2");
    const { StorageError } = await import("@/lib/errors");
    vi.mocked(fetchFromR2).mockRejectedValueOnce(new StorageError("R2 network timeout"));

    const { processImport } = await import("@/inngest/functions/process-import");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = processImport as any;
    const ctx = { event: { name: "mirror/import.process", data: { importId } } };
    const mockStep = { run: async (_id: string, cb: () => Promise<unknown>) => cb() };

    // Retriable errors re-throw so Inngest can retry — status must stay "processing",
    // not flash "failed" to users during the retry window.
    await expect(async () => {
      if (typeof fn.fn === "function") {
        await fn.fn({ ...ctx, step: mockStep });
      } else if (typeof fn.handler === "function") {
        await fn.handler(ctx);
      } else if (typeof fn.run === "function") {
        await fn.run(ctx);
      } else {
        throw new Error("Cannot invoke processImport — update invocation pattern for this Inngest version");
      }
    }).rejects.toThrow(StorageError);

    const [row] = await db
      .select({ status: imports.status })
      .from(imports)
      .where(eq(imports.id, importId))
      .limit(1);

    expect(row?.status).toBe("processing");
  });

  it("sets imports.status to 'failed' when rawPath is null", async () => {
    // Insert an import row without rawPath (simulates upload that never completed).
    const [imp] = await db
      .insert(imports)
      .values({ userId, source: "linkedin_pdf" })
      .returning({ id: imports.id });
    importId = imp!.id;

    const { processImport } = await import("@/inngest/functions/process-import");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = processImport as any;
    const ctx = { event: { name: "mirror/import.process", data: { importId } } };
    const mockStep = { run: async (_id: string, cb: () => Promise<unknown>) => cb() };

    let result: unknown;
    if (typeof fn.fn === "function") {
      result = await fn.fn({ ...ctx, step: mockStep });
    } else if (typeof fn.handler === "function") {
      result = await fn.handler(ctx);
    } else if (typeof fn.run === "function") {
      result = await fn.run(ctx);
    } else {
      throw new Error("Cannot invoke processImport — update invocation pattern for this Inngest version");
    }

    expect(result).toMatchObject({ error: "missing_raw_path" });

    const [row] = await db
      .select({ status: imports.status })
      .from(imports)
      .where(eq(imports.id, importId))
      .limit(1);

    expect(row?.status).toBe("failed");
  });
});
