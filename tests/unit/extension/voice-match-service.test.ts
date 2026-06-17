/**
 * Unit tests for computeVoiceMatch — the sole exported function of
 * src/lib/extension/voice-match-service.ts (SPEC §6.3, §6.5).
 *
 * The route-handler test at tests/unit/api/extension/voice-match.spec.ts mocks
 * the entire module, so none of the service's internal logic is exercised there.
 * These tests target the real implementation directly.
 *
 * Mocked boundaries:
 *   @/db/client              — Drizzle query chain (db.select...limit)
 *   @/lib/db/pii-read        — readImportParsed (PII gate)
 *   @/lib/embeddings         — embedVoiceProfile (Voyage AI call)
 *   @/lib/voice/extract      — extractVoiceCard (LLM-derived voice card)
 *   @/lib/voice-match        — scoreVoiceMatch (pure cosine + feature scorer)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any SUT import
// ---------------------------------------------------------------------------

/** Simulates the tail of the Drizzle query chain: .limit(1) */
const mockLimit = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn(() => ({ limit: mockLimit })));
const mockInnerJoin = vi.hoisted(() => vi.fn(() => ({ where: mockWhere })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ innerJoin: mockInnerJoin })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

vi.mock("@/db/client", () => ({
  db: { select: mockSelect },
}));

const mockReadImportParsed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/pii-read", () => ({
  readImportParsed: mockReadImportParsed,
}));

const mockEmbedVoiceProfile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/embeddings", () => ({
  embedVoiceProfile: mockEmbedVoiceProfile,
}));

const mockExtractVoiceCard = vi.hoisted(() => vi.fn());
vi.mock("@/lib/voice/extract", () => ({
  extractVoiceCard: mockExtractVoiceCard,
}));

const mockScoreVoiceMatch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/voice-match", () => ({
  scoreVoiceMatch: mockScoreVoiceMatch,
}));

// ---------------------------------------------------------------------------
// SUT — imported after all vi.mock() calls
// ---------------------------------------------------------------------------
import { computeVoiceMatch } from "@/lib/extension/voice-match-service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = "internal-user-uuid";
const IMPORT_ID = "import-uuid-1234";
const PROFILE_TEXT = "I build calm, durable systems and ship them every sprint.";

const MOCK_EMBEDDING = Array.from({ length: 1024 }, (_, i) => i / 1024);

const MOCK_VOICE_CARD = {
  vocabulary: ["durable", "calm"],
  hedgesAvoided: ["I think"],
  sentenceLengthDistribution: { short: 34, medium: 33, long: 33 },
  emotionalRegister: "confident",
  jargonHated: ["synergy"],
};

const MOCK_PARSED_HISTORY = {
  source: "chatgpt" as const,
  messages: [{ role: "user" as const, content: "I build things." }],
};

const MOCK_SCORE = { score: 87, components: { cosine: 0.91, feature: 0.62 } };

const NEUTRAL_VOICE_CARD = {
  vocabulary: [],
  hedgesAvoided: [],
  sentenceLengthDistribution: { short: 34, medium: 33, long: 33 },
  emotionalRegister: "",
  jargonHated: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wire up the happy-path defaults for all mocked deps. */
function setupHappyPath() {
  mockLimit.mockResolvedValue([{ importId: IMPORT_ID, embedding: MOCK_EMBEDDING }]);
  mockReadImportParsed.mockResolvedValue({ parsed: MOCK_PARSED_HISTORY });
  mockExtractVoiceCard.mockReturnValue(MOCK_VOICE_CARD);
  mockEmbedVoiceProfile.mockResolvedValue(MOCK_EMBEDDING);
  mockScoreVoiceMatch.mockReturnValue({ ok: true, value: MOCK_SCORE });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupHappyPath();
});

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("computeVoiceMatch — missing voice profile scenarios", () => {
  it("returns missing_voice_embedding when DB returns no rows", async () => {
    mockLimit.mockResolvedValue([]);

    const result = await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(result).toEqual({ ok: false, error: "missing_voice_embedding" });
  });

  it("returns missing_voice_embedding when row exists but embedding is an empty array", async () => {
    mockLimit.mockResolvedValue([{ importId: IMPORT_ID, embedding: [] }]);

    const result = await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(result).toEqual({ ok: false, error: "missing_voice_embedding" });
  });

  it("returns missing_voice_embedding when readImportParsed returns null", async () => {
    mockReadImportParsed.mockResolvedValue(null);

    const result = await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(result).toEqual({ ok: false, error: "missing_voice_embedding" });
  });

  it("returns missing_voice_embedding when readImportParsed returns undefined", async () => {
    mockReadImportParsed.mockResolvedValue(undefined);

    const result = await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(result).toEqual({ ok: false, error: "missing_voice_embedding" });
  });

  it("returns missing_voice_embedding when readImportParsed returns a row with null parsed", async () => {
    mockReadImportParsed.mockResolvedValue({ parsed: null });

    const result = await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(result).toEqual({ ok: false, error: "missing_voice_embedding" });
  });

  it("returns missing_voice_embedding when scoreVoiceMatch returns { ok: false }", async () => {
    mockScoreVoiceMatch.mockReturnValue({
      ok: false,
      error: { kind: "missing_embedding", message: "no embedding" },
    });

    const result = await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(result).toEqual({ ok: false, error: "missing_voice_embedding" });
  });
});

describe("computeVoiceMatch — happy path", () => {
  it("returns { ok: true, value: score } when all deps succeed", async () => {
    const result = await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(result).toEqual({ ok: true, value: MOCK_SCORE });
  });

  it("invokes the DB select chain with limit(1)", async () => {
    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockSelect).toHaveBeenCalledOnce();
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it("forwards internalUserId to readImportParsed as userId argument", async () => {
    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockReadImportParsed).toHaveBeenCalledWith(
      IMPORT_ID,
      USER_ID,
      expect.any(String)
    );
  });

  it("passes profileText to embedVoiceProfile as a plain_text user message", async () => {
    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockEmbedVoiceProfile).toHaveBeenCalledWith(
      { source: "plain_text", messages: [{ role: "user", content: PROFILE_TEXT }] },
      expect.objectContaining({ emotionalRegister: "", vocabulary: [] })
    );
  });

  it("uses NEUTRAL_VOICE_CARD (not the user voice card) when embedding candidate text", async () => {
    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    const [, secondArg] = mockEmbedVoiceProfile.mock.calls[0];
    expect(secondArg).toEqual(NEUTRAL_VOICE_CARD);
  });

  it("passes the user voice card (from extractVoiceCard) to scoreVoiceMatch, not the neutral card", async () => {
    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockScoreVoiceMatch).toHaveBeenCalledWith(
      expect.objectContaining({ voiceCard: MOCK_VOICE_CARD })
    );
  });

  it("passes the persisted user embedding as userVoiceEmbedding, not the candidate embedding", async () => {
    const differentCandidateEmbedding = MOCK_EMBEDDING.map((v) => v * 0.5);
    mockEmbedVoiceProfile.mockResolvedValue(differentCandidateEmbedding);

    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockScoreVoiceMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userVoiceEmbedding: MOCK_EMBEDDING,
        candidateEmbedding: differentCandidateEmbedding,
      })
    );
  });

  it("passes profileText as candidateText to scoreVoiceMatch", async () => {
    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockScoreVoiceMatch).toHaveBeenCalledWith(
      expect.objectContaining({ candidateText: PROFILE_TEXT })
    );
  });
});

describe("computeVoiceMatch — short-circuit behaviour", () => {
  it("does not call readImportParsed when DB returns no rows", async () => {
    mockLimit.mockResolvedValue([]);

    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockReadImportParsed).not.toHaveBeenCalled();
  });

  it("does not call embedVoiceProfile when loadVoiceProfile fails (no DB rows)", async () => {
    mockLimit.mockResolvedValue([]);

    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockEmbedVoiceProfile).not.toHaveBeenCalled();
  });

  it("does not call scoreVoiceMatch when readImportParsed returns null", async () => {
    mockReadImportParsed.mockResolvedValue(null);

    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockScoreVoiceMatch).not.toHaveBeenCalled();
  });

  it("does not call scoreVoiceMatch when DB row has an empty embedding", async () => {
    mockLimit.mockResolvedValue([{ importId: IMPORT_ID, embedding: [] }]);

    await computeVoiceMatch(USER_ID, PROFILE_TEXT);

    expect(mockScoreVoiceMatch).not.toHaveBeenCalled();
  });
});
