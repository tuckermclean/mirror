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
 * Scaffold: the function exists but call sites are wired in Wk 2 when the
 * ESLint rule blocking direct reads outside this wrapper is added. For now,
 * the table and function are present so the DB migration is complete and
 * callers can opt in immediately.
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
