import { db } from "@/db/client";
import {
  users,
  interviews,
  imports,
  linkedinSnapshots,
  generations,
  commits,
  outcomes,
  outcomeDeltas,
  llmSpendLedger,
} from "@/db/schema";
import { eq } from "drizzle-orm";

// DELETED_PLAN now lives in the dependency-free constants module so that
// route/page files can import it without pulling in this DB-heavy module.
// Re-exported here for backward compatibility with existing call sites.
import { DELETED_PLAN } from "@/lib/constants";
export { DELETED_PLAN };

/**
 * GDPR Article 17 erasure — redaction-in-place ("soft delete"). See ADR-009.
 *
 * A true `DELETE FROM users` is impossible once the user has ever performed a
 * PII read, because `audit_log.accessor_id` is `NOT NULL ON DELETE RESTRICT`
 * (a threat-model requirement so that every PII read is permanently
 * attributable to a non-deletable accessor). This helper therefore deletes all
 * PII-bearing child rows and overwrites the user's PII columns in place,
 * leaving an opaque `users.id` tombstone the audit log can keep pointing at.
 *
 * Idempotent: calling on an already-redacted user is a no-op (the placeholders
 * are deterministic in `users.id`, so the UPDATE is a write-of-same).
 *
 * **R2 objects are NOT deleted by this function.** `imports.rawPath` stores
 * paths to R2 objects that contain raw PII (AI chat exports, LinkedIn HTML).
 * Callers are responsible for deleting those objects before or after calling
 * this helper. In production, this is done by the Inngest erasure function —
 * do not call this helper in isolation or Art. 17 erasure will be incomplete.
 */
export async function deleteUser(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Order is chosen so that referencing rows are gone before their referents.
    // Each table's own `user_id` FK is `ON DELETE CASCADE` from `users`, but we
    // can't rely on that here because we are deliberately *not* deleting the
    // `users` row.
    await tx.delete(commits).where(eq(commits.userId, userId));
    await tx.delete(outcomeDeltas).where(eq(outcomeDeltas.userId, userId));
    await tx.delete(llmSpendLedger).where(eq(llmSpendLedger.userId, userId));
    await tx.delete(outcomes).where(eq(outcomes.userId, userId));
    await tx.delete(generations).where(eq(generations.userId, userId));
    await tx.delete(linkedinSnapshots).where(eq(linkedinSnapshots.userId, userId));
    await tx.delete(imports).where(eq(imports.userId, userId));
    await tx.delete(interviews).where(eq(interviews.userId, userId));

    // Deterministic placeholders keyed off the immutable `users.id`. `.invalid`
    // is a reserved TLD (RFC 2606), so the email can never collide with a real
    // address or be deliverable. The `clerk_id` placeholder is unique by
    // construction because `users.id` is a primary key.
    await tx
      .update(users)
      .set({
        email: `deleted+${userId}@deleted.invalid`,
        clerkId: `deleted:${userId}`,
        voiceProfileId: null,
        plan: DELETED_PLAN,
      })
      .where(eq(users.id, userId));
  });
}
