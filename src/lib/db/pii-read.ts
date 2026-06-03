import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, interviews } from "@/db/schema";

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
 * @deprecated Use `readPii()` instead — it provides richer audit data (`userId`
 * in addition to `accessorId`) and returns data only after the audit write
 * succeeds (fail-safe ordering).
 *
 * **Removal target**: Mirror v1.0 (planned 2026-Q3). This function will be
 * deleted once all callers are migrated.
 *
 * **Migration guide** — replace:
 * ```ts
 * await recordPiiRead({ tableName, rowId, fieldName, accessorId, reason, ipAddress });
 * ```
 * with:
 * ```ts
 * const data = await readPii(
 *   () => db.select({ ... }).from(table).where(eq(table.id, rowId)).limit(1),
 *   { userId: currentUserId, accessorId, tableName, rowId, fieldName, reason, ipAddress }
 * );
 * ```
 * If `userId` is unavailable (e.g. a background job), pass the service-account
 * identifier for both `userId` and `accessorId`.
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

type ReadInterviewTranscriptOptions = {
  /** Client IP forwarded from the request, for the audit trail. */
  ipAddress?: string;
  /**
   * The identity that is accessing the data. Defaults to `userId`.
   * Pass a service-account ID here for background jobs or admin reads
   * so the audit log accurately reflects who/what made the access.
   */
  accessorId?: string;
};

/**
 * Fetches the transcript of a single interview row through the PII audit wrapper.
 *
 * Callers in other modules should use this rather than referencing
 * `interviews.transcript` directly — the ESLint PII guard enforces this.
 *
 * @param interviewId - UUID of the interview row to fetch.
 * @param userId - The authenticated user on whose behalf the read is made.
 * @param reason - Human-readable justification written to the audit log.
 * @param options - Optional `ipAddress` and `accessorId` (defaults to `userId`).
 */
export async function readInterviewTranscript(
  interviewId: string,
  userId: string,
  reason: string,
  options?: ReadInterviewTranscriptOptions
): Promise<{ transcript: unknown } | undefined> {
  const accessorId = options?.accessorId ?? userId;
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
      ...(options?.ipAddress !== undefined ? { ipAddress: options.ipAddress } : {}),
    }
  );
  return rows[0];
}
