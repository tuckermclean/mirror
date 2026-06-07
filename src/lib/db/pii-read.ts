import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, imports, interviews } from "@/db/schema";
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
 */
export async function readInterviewTranscript(
  interviewId: string,
  userId: string,
  reason: string,
  ipAddress?: string
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
      accessorId: userId,
      tableName: "interviews",
      rowId: interviewId,
      fieldName: "transcript",
      reason,
      ...(ipAddress !== undefined ? { ipAddress } : {}),
    }
  );
  return rows[0];
}
