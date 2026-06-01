import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

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
 * Call before returning any value from a PII column:
 * interviews.transcript, imports.raw_path, imports.parsed,
 * linkedin_snapshots.raw_html.
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
