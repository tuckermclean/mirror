-- Realign vector column dimensions from 3072 to 1024.
-- voyage-3 (the embedding model) produces 1024-dimensional vectors by default;
-- 3072 was an incorrect initial value that caused embedVoiceProfile() to always throw.
ALTER TABLE "imports" ALTER COLUMN "voice_embedding" TYPE vector(1024);--> statement-breakpoint
DROP INDEX IF EXISTS "benchmark_profiles_embedding_hnsw_idx";--> statement-breakpoint
ALTER TABLE "benchmark_profiles" ALTER COLUMN "embedding" TYPE vector(1024);--> statement-breakpoint
CREATE INDEX "benchmark_profiles_embedding_hnsw_idx" ON "benchmark_profiles" USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
