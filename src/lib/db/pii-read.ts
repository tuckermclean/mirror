import { and, eq } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import { auditLog, imports, interviews, linkedinSnapshots } from "@/db/schema";
import { ValidationError } from "@/lib/errors";

type PiiReadParams = {
  tableName: string;
  rowId: string;
  fieldName: string;
  accessorId: string;
  reason?: string;
  ipAddress?: string;
};

/**
 * Records a PII field access in the audit_log table.
 *
 * @deprecated Use `readPii()` instead — it provides a richer audit row (userId)
 * and returns the data only after the audit write succeeds (fail-safe).
 */
export async function recordPiiRead(params: PiiReadParams): Promise<void> {
  await db.insert(auditLog).values({
    accessorId: params.accessorId,
    tableName: params.tableName,
    rowId: params.rowId,
    fieldName: params.fieldName,
    reason: params.reason,
    ipAddress: params.ipAddress,
  });
}

type ReadPiiAuditParams = {
  userId: string;
  accessorId: string;
  tableName: string;
  rowId: string;
  fieldName: string;
  reason: string;
  ipAddress?: string;
};

/**
 * Executes a PII-field query, writes an audit_log row, and returns the data.
 *
 * `reason` is required by the type — omitting it is a TypeScript compile error.
 * All four PII columns are gated behind this wrapper by an ESLint rule.
 */
export async function readPii<T>(
  query: () => Promise<T>,
  audit: ReadPiiAuditParams
): Promise<T> {
  const result = await query();
  await db.insert(auditLog).values({
    userId: audit.userId,
    accessorId: audit.accessorId,
    tableName: audit.tableName,
    rowId: audit.rowId,
    fieldName: audit.fieldName,
    reason: audit.reason,
    ipAddress: audit.ipAddress,
  });
  return result;
}

type WritePiiAuditParams = {
  userId: string;
  accessorId: string;
  tableName: string;
  rowId: string;
  fieldName: string;
  reason: string;
  ipAddress?: string;
};

/**
 * Executes a PII-field write inside a transaction, then writes an audit_log row.
 *
 * Both the mutation and the audit insert run atomically: if the audit insert
 * fails, the mutation is rolled back — no unaudited PII writes can persist.
 *
 * `reason` is required by the type — omitting it is a TypeScript compile error.
 * Use this wrapper for any mutation of PII columns (parsed, raw_path, transcript).
 */
export async function writePii(
  mutation: (tx: DB) => Promise<void>,
  audit: WritePiiAuditParams
): Promise<void> {
  await db.transaction(async (tx) => {
    await mutation(tx as unknown as DB);
    await tx.insert(auditLog).values({
      userId: audit.userId,
      accessorId: audit.accessorId,
      tableName: audit.tableName,
      rowId: audit.rowId,
      fieldName: audit.fieldName,
      reason: audit.reason,
      ipAddress: audit.ipAddress,
    });
  });
}

/**
 * Fetches the raw_path of an imports row through the PII audit wrapper.
 *
 * raw_path points to a user's full AI chat export in R2 — PII-adjacent
 * (the file contains private conversation history) so every read is audit-logged.
 * The underlying query runs first; data is returned to the caller only if the
 * audit write also succeeds — if the audit insert throws, the read fails closed.
 */
export async function readImportRawPath(
  importId: string,
  accessorId: string,
  reason: string,
  ipAddress?: string
): Promise<{ rawPath: string | null } | undefined> {
  if (!reason.trim()) {
    throw new ValidationError("reason must not be empty");
  }
  const rows = await readPii(
    () =>
      db
        .select({ rawPath: imports.rawPath })
        .from(imports)
        .where(eq(imports.id, importId))
        .limit(1),
    {
      userId: accessorId,
      accessorId,
      tableName: "imports",
      rowId: importId,
      fieldName: "raw_path",
      reason,
      ...(ipAddress !== undefined ? { ipAddress } : {}),
    }
  );
  return rows[0];
}

/**
 * Fetches the transcript of a single interview row through the PII audit wrapper.
 *
 * Callers in other modules should use this rather than referencing
 * `interviews.transcript` directly — the ESLint PII guard enforces this.
 *
 * `accessorId` identifies the principal performing the read and defaults to
 * `userId` (the subject reading their own transcript). Pass an explicit
 * `accessorId` for service-account or support reads so the audit row
 * distinguishes who accessed the data from whose data it is — never let a
 * staff/automated read masquerade as a subject self-read.
 */
export async function readInterviewTranscript(
  interviewId: string,
  userId: string,
  reason: string,
  ipAddress?: string,
  accessorId: string = userId
): Promise<{ transcript: unknown } | undefined> {
  const rows = await readPii(
    () =>
      db
        .select({ transcript: interviews.transcript })
        .from(interviews)
        .where(eq(interviews.id, interviewId))
        .limit(1),
    {
      userId,
      accessorId,
      tableName: "interviews",
      rowId: interviewId,
      fieldName: "transcript",
      reason,
      ...(ipAddress !== undefined ? { ipAddress } : {}),
    }
  );
  return rows[0];
}

/**
 * Fetches the parsed field of a single import row through the PII audit wrapper.
 */
export async function readImportParsed(
  importId: string,
  userId: string,
  reason: string
): Promise<{ parsed: unknown } | undefined> {
  const rows = await readPii(
    () =>
      db
        .select({ parsed: imports.parsed })
        .from(imports)
        .where(eq(imports.id, importId))
        .limit(1),
    {
      userId,
      accessorId: userId,
      tableName: "imports",
      rowId: importId,
      fieldName: "parsed",
      reason,
    }
  );
  return rows[0];
}

/**
 * Fetches the raw_html and parsed fields of a linkedin_snapshots row through the
 * PII audit wrapper.
 *
 * Both columns hold a user's full LinkedIn profile (raw scraped HTML and the
 * parsed structure) — PII that the generation pipeline reads to produce a
 * rewrite. Callers must use this rather than referencing
 * `linkedinSnapshots.rawHtml` / `linkedinSnapshots.parsed` directly — the ESLint
 * PII guard enforces this. The query runs first; data is returned only if the
 * audit write also succeeds (fail-closed).
 */
export async function readLinkedinSnapshot(
  snapshotId: string,
  userId: string,
  reason: string,
  ipAddress?: string
): Promise<{ rawHtml: string | null; parsed: unknown } | undefined> {
  if (!reason.trim()) {
    throw new ValidationError("reason must not be empty");
  }
  const rows = await readPii(
    () =>
      db
        .select({
          rawHtml: linkedinSnapshots.rawHtml,
          parsed: linkedinSnapshots.parsed,
        })
        .from(linkedinSnapshots)
        .where(and(eq(linkedinSnapshots.id, snapshotId), eq(linkedinSnapshots.userId, userId)))
        .limit(1),
    {
      userId,
      accessorId: userId,
      tableName: "linkedin_snapshots",
      rowId: snapshotId,
      fieldName: "raw_html,parsed",
      reason,
      ...(ipAddress !== undefined ? { ipAddress } : {}),
    }
  );
  return rows[0];
}
