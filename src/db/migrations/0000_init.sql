-- Mirror — initial database migration
-- Run order: this file is sourced by the docker-compose init script and
-- by the Kubernetes init container before the app starts.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- users
-- Note: voice_profile_id FK to imports is added after imports is created.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id        TEXT UNIQUE NOT NULL,
    email           TEXT NOT NULL,
    plan            TEXT NOT NULL DEFAULT 'free',
    voice_profile_id UUID          -- FK added below after imports exists
);

-- ---------------------------------------------------------------------------
-- interviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interviews (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transcript   JSONB NOT NULL DEFAULT '[]',
    summary      TEXT,
    completed_at TIMESTAMPTZ,
    turn_count   INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- imports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source          TEXT NOT NULL,  -- 'chatgpt' | 'claude' | 'plaintext'
    raw_path        TEXT,
    parsed          JSONB,
    voice_embedding vector(3072)
);

-- Now that imports exists, add the nullable FK on users
ALTER TABLE users
    ADD CONSTRAINT fk_users_voice_profile
    FOREIGN KEY (voice_profile_id) REFERENCES imports(id)
    ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- linkedin_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    raw_html    TEXT,
    parsed      JSONB,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- generations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    input_snapshot_id UUID REFERENCES linkedin_snapshots(id) ON DELETE SET NULL,
    output            JSONB,
    rationale         JSONB,
    model             TEXT NOT NULL,
    prompt_hash       TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- commits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commits (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    generation_id  UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
    fields_accepted JSONB NOT NULL DEFAULT '{}',
    committed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    method         TEXT NOT NULL   -- 'extension' | 'export'
);

-- ---------------------------------------------------------------------------
-- outcomes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outcomes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_of             DATE NOT NULL,
    profile_views       INTEGER NOT NULL DEFAULT 0,
    search_appearances  INTEGER NOT NULL DEFAULT 0,
    recruiter_msgs      INTEGER NOT NULL DEFAULT 0,
    post_impressions    INTEGER NOT NULL DEFAULT 0,
    source              TEXT NOT NULL   -- 'extension' | 'self_report'
);

-- ---------------------------------------------------------------------------
-- benchmark_profiles  (no user FK — shared corpus)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS benchmark_profiles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry            TEXT NOT NULL,
    role                TEXT NOT NULL,
    seniority           TEXT NOT NULL,
    public_url          TEXT NOT NULL,
    parsed              JSONB,
    embedding           vector(3072),
    performance_signals JSONB
);

-- ---------------------------------------------------------------------------
-- outcome_deltas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outcome_deltas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
    baseline_30d  JSONB,
    after_30d     JSONB,
    lift_pct      NUMERIC(5, 2)
);

-- ---------------------------------------------------------------------------
-- llm_spend_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS llm_spend_ledger (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd      NUMERIC(10, 6) NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    accessor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    table_name  TEXT NOT NULL,
    row_id      UUID NOT NULL,
    field_name  TEXT NOT NULL,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason      TEXT,
    ip_address  TEXT
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- HNSW on benchmark_profiles.embedding for sub-200ms cosine k-NN retrieval.
-- ef_search can be tuned at query time: SET hnsw.ef_search = 100;
CREATE INDEX IF NOT EXISTS benchmark_profiles_embedding_hnsw_idx
    ON benchmark_profiles
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- btree on imports.user_id (filter-first before cosine scan per ADR-005)
CREATE INDEX IF NOT EXISTS imports_user_id_idx
    ON imports (user_id);

-- btree on llm_spend_ledger(user_id, recorded_at) for the MTD cost query:
--   SELECT SUM(cost_usd) FROM llm_spend_ledger
--   WHERE user_id = $1 AND recorded_at >= date_trunc('month', NOW())
CREATE INDEX IF NOT EXISTS llm_spend_ledger_user_recorded_at_idx
    ON llm_spend_ledger (user_id, recorded_at);

-- btree on audit_log(user_id, accessed_at) for the per-user audit trail query
CREATE INDEX IF NOT EXISTS audit_log_user_accessed_at_idx
    ON audit_log (user_id, accessed_at);
