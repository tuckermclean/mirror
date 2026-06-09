/**
 * src/lib/constants.ts — stable, dependency-free project constants.
 *
 * This module intentionally has no imports so it can be safely imported from
 * route handlers, pages, lib code, and tests without pulling in DB clients or
 * other heavy modules.
 */

/**
 * Sentinel written to `users.plan` after GDPR redaction (ADR-009). Callers that
 * list active users must filter `ne(users.plan, DELETED_PLAN)` to exclude
 * tombstone rows. Downstream guard implementation tracked in issue #36.
 */
export const DELETED_PLAN = "deleted" as const;
