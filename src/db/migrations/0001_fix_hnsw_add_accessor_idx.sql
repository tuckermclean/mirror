-- Mirror — migration 0001
-- Applies to any environment that already has 0000_init.sql applied.
-- Safe to re-run via drizzle-kit migrate (tracked in the migrations table).
-- DIRECT SQL REPLAY NOTE: DROP INDEX IF EXISTS and CREATE INDEX IF NOT EXISTS
-- are idempotent. The RENAME CONSTRAINT below is wrapped in a DO block to
-- guard against "constraint does not exist" on a second direct execution.

-- ---------------------------------------------------------------------------
-- Fix HNSW index for pgvector 0.8.x 2000-dimension limit
-- ---------------------------------------------------------------------------
-- pgvector 0.8.x limits HNSW to 2000 dims for the plain vector type.
-- Cast to halfvec(3072) in the index expression to lift that limit while
-- keeping the stored column as full-precision vector(3072).
-- Query with: ORDER BY embedding::halfvec(3072) <=> $query::halfvec(3072)
-- ef_search can be tuned at query time: SET hnsw.ef_search = 100;
DROP INDEX IF EXISTS benchmark_profiles_embedding_hnsw_idx;
CREATE INDEX benchmark_profiles_embedding_hnsw_idx
    ON benchmark_profiles
    USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- Add missing index for RESTRICT FK on audit_log.accessor_id
-- ---------------------------------------------------------------------------
-- PostgreSQL must verify no referencing rows exist before DELETE/UPDATE on users
-- when the RESTRICT FK is in effect. Without this index, that check is a full
-- sequential scan of audit_log — which grows with every PII read.
-- Known limitation: not CONCURRENTLY — this migration may run while the app is
-- live but audit_log is expected to be small at this stage (<10k rows). Future
-- migrations adding indexes to high-traffic tables should use CONCURRENTLY.
CREATE INDEX IF NOT EXISTS audit_log_accessor_id_idx
    ON audit_log (accessor_id);

-- ---------------------------------------------------------------------------
-- Align FK constraint name with Drizzle's auto-generated convention
-- ---------------------------------------------------------------------------
-- 0000_init.sql named this constraint fk_users_voice_profile (hand-written).
-- schema.ts now declares the FK via .references(), so drizzle-kit generate
-- expects the name users_voice_profile_id_imports_id_fk. Renaming here means
-- db:generate sees the constraint and does not emit a duplicate ADD CONSTRAINT.
-- Wrapped in DO block so direct SQL replay does not fail if already renamed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_users_voice_profile'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      RENAME CONSTRAINT fk_users_voice_profile TO users_voice_profile_id_imports_id_fk;
  END IF;
END $$;
