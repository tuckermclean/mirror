import { db } from "@/db/client.js";
import { auditLog } from "@/db/schema.js";

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
 * Call this before returning any value from a PII column
 * (interviews.transcript, imports.raw_path, imports.parsed,
 * linkedin_snapshots.raw_html, etc.).
 *
 * The userId on the audit row is intentionally left null here because
 * the caller already knows the accessorId; if the subject row belongs
 * to a specific user, pass userId via the optional extension below or
 * derive it from the query that fetches the PII row.
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
