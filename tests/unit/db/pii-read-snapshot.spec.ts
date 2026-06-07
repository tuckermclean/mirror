/**
 * Unit tests for readLinkedinSnapshot() — verifies the PII audit wrapper contract.
 *
 * Security contract: reads from linkedin_snapshots.raw_html / parsed MUST be gated
 * behind the PII audit wrapper so every access is recorded in audit_log.
 *
 * DB is fully mocked; no DATABASE_URL needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before SUT import
// ---------------------------------------------------------------------------
const mockValues = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockInsert = vi.hoisted(() => vi.fn(() => ({ values: mockValues })));
const mockLimit = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn(() => ({ limit: mockLimit })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ where: mockWhere })));
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));

vi.mock("@/db/client", () => ({
  db: { insert: mockInsert, select: mockSelect },
}));

vi.mock("@/db/schema", () => ({
  auditLog: Symbol("auditLog"),
  imports: {
    rawPath: Symbol("imports.rawPath"),
    parsed: Symbol("imports.parsed"),
    id: Symbol("imports.id"),
  },
  interviews: {
    transcript: Symbol("interviews.transcript"),
    id: Symbol("interviews.id"),
  },
  linkedinSnapshots: {
    rawHtml: Symbol("linkedinSnapshots.rawHtml"),
    parsed: Symbol("linkedinSnapshots.parsed"),
    id: Symbol("linkedinSnapshots.id"),
  },
}));

import { readLinkedinSnapshot } from "@/lib/db/pii-read";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SNAPSHOT_ID = "snapshot-uuid-1";
const USER_ID = "user-uuid-1";
const REASON = "generation pipeline: read snapshot for rewrite";
const SNAPSHOT_ROW = {
  rawHtml: "<html>profile</html>",
  parsed: { headline: "Engineer", experience: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockImplementation(() => ({ values: mockValues }));
  mockValues.mockResolvedValue([]);
  mockLimit.mockResolvedValue([SNAPSHOT_ROW]);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("readLinkedinSnapshot", () => {
  it("returns the rawHtml and parsed for the given snapshotId", async () => {
    const result = await readLinkedinSnapshot(SNAPSHOT_ID, USER_ID, REASON);
    expect(result).toEqual(SNAPSHOT_ROW);
  });

  it("returns undefined when no snapshot row is found", async () => {
    mockLimit.mockResolvedValue([]);
    const result = await readLinkedinSnapshot(SNAPSHOT_ID, USER_ID, REASON);
    expect(result).toBeUndefined();
  });

  it("writes an audit_log row with correct tableName and fieldName", async () => {
    await readLinkedinSnapshot(SNAPSHOT_ID, USER_ID, REASON);
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "linkedin_snapshots",
        rowId: SNAPSHOT_ID,
        fieldName: "raw_html",
        reason: REASON,
      })
    );
  });

  it("sets userId equal to accessorId in the audit row (system self-access)", async () => {
    await readLinkedinSnapshot(SNAPSHOT_ID, USER_ID, REASON);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        accessorId: USER_ID,
      })
    );
  });

  it("forwards ipAddress to the audit row when provided", async () => {
    await readLinkedinSnapshot(SNAPSHOT_ID, USER_ID, REASON, "203.0.113.7");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: "203.0.113.7" })
    );
  });

  it("does NOT return data when audit write fails (fail-closed)", async () => {
    mockValues.mockRejectedValueOnce(new Error("audit DB down"));
    await expect(
      readLinkedinSnapshot(SNAPSHOT_ID, USER_ID, REASON)
    ).rejects.toThrow("audit DB down");
  });

  it("rejects an empty reason — prevents silent audit bypass", async () => {
    await expect(
      readLinkedinSnapshot(SNAPSHOT_ID, USER_ID, "")
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("rejects a whitespace-only reason — prevents silent audit bypass", async () => {
    await expect(
      readLinkedinSnapshot(SNAPSHOT_ID, USER_ID, "   ")
    ).rejects.toMatchObject({ name: "ValidationError" });
  });
});
