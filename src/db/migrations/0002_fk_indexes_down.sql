-- Mirror — rollback for migration 0002
-- Drops the btree indexes added in 0002_fk_indexes.sql.
-- Run this before reverting to a schema state without these indexes.

DROP INDEX IF EXISTS "commits_user_id_idx";
DROP INDEX IF EXISTS "commits_generation_id_idx";
DROP INDEX IF EXISTS "generations_user_id_idx";
DROP INDEX IF EXISTS "generations_input_snapshot_id_idx";
DROP INDEX IF EXISTS "interviews_user_id_idx";
DROP INDEX IF EXISTS "linkedin_snapshots_user_id_idx";
DROP INDEX IF EXISTS "llm_spend_ledger_generation_id_idx";
DROP INDEX IF EXISTS "outcome_deltas_user_id_idx";
DROP INDEX IF EXISTS "outcome_deltas_generation_id_idx";
DROP INDEX IF EXISTS "outcomes_user_id_idx";
DROP INDEX IF EXISTS "users_voice_profile_id_idx";
