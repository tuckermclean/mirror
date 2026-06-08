-- Add unique constraint on outcomes (user_id, week_of, source) so that
-- re-submitting a self-report for the same week is an idempotent upsert
-- (via ON CONFLICT DO UPDATE) rather than creating duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS "outcomes_user_week_source_idx"
  ON "outcomes" ("user_id", "week_of", "source");
