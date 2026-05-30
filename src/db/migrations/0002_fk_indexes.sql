-- Mirror — migration 0002
-- Adds the btree indexes that back every foreign-key column in the schema.
-- Without these, PostgreSQL falls back to a sequential scan of the child
-- table on every parent UPDATE/DELETE (cascade, set null, restrict) — the
-- single most common cause of "DELETE got slow as the table grew".
--
-- DIRECT SQL REPLAY NOTE: CREATE INDEX IF NOT EXISTS is idempotent. This
-- file is safe to re-run via drizzle-kit migrate (tracked in the migrations
-- table) or directly via psql \i.
--
-- Known limitation: not CONCURRENTLY. These tables are still small at this
-- stage of the project; future migrations adding indexes to high-traffic
-- tables (e.g. audit_log once PII reads start landing) should use the
-- CONCURRENTLY form, which requires running outside a transaction block.
--
-- Skipped (already covered):
--   imports(user_id)              → imports_user_id_idx                  (0000)
--   llm_spend_ledger(user_id)     → llm_spend_ledger_user_recorded_at_idx (0000, leading col)
--   audit_log(user_id, ...)       → audit_log_user_accessed_at_idx       (0000, leading col)
--   audit_log(accessor_id)        → audit_log_accessor_id_idx            (0001)

CREATE INDEX IF NOT EXISTS "commits_user_id_idx" ON "commits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commits_generation_id_idx" ON "commits" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_user_id_idx" ON "generations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_input_snapshot_id_idx" ON "generations" USING btree ("input_snapshot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interviews_user_id_idx" ON "interviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linkedin_snapshots_user_id_idx" ON "linkedin_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_spend_ledger_generation_id_idx" ON "llm_spend_ledger" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_deltas_user_id_idx" ON "outcome_deltas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_deltas_generation_id_idx" ON "outcome_deltas" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcomes_user_id_idx" ON "outcomes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_voice_profile_id_idx" ON "users" USING btree ("voice_profile_id");
