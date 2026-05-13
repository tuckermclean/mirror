-- Mirror database initialization script
-- Runs once on first container start via /docker-entrypoint-initdb.d/
-- Enables the pgvector extension required for voice_embedding and benchmark_profiles.embedding columns.

CREATE EXTENSION IF NOT EXISTS vector;
