/**
 * Types for the Week 4 benchmark corpus (the "moat" table).
 *
 * A benchmark profile is a public top-performer LinkedIn profile, parsed into
 * structured fields, embedded, and tagged with observable performance signals.
 * These flow into `benchmark_profiles` and feed k-NN retrieval at generation.
 */

/** A single role/experience entry parsed from a profile. */
export type BenchmarkExperience = {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string | null;
  bullets: string[];
};

/**
 * Structured profile content — the shape stored in `benchmark_profiles.parsed`
 * and serialized into the generation prompt by `formatExemplars`.
 */
export type BenchmarkParsedProfile = {
  headline: string;
  about: string;
  experience: BenchmarkExperience[];
};

/**
 * Observable performance signals tagged onto a benchmark profile. Values are
 * optional and may be `undefined` (the repo runs `exactOptionalPropertyTypes`,
 * and zod-parsed optionals surface as `T | undefined`).
 */
export type BenchmarkPerformanceSignals = {
  profileViews?: number | undefined;
  recruiterMessages?: number | undefined;
  searchAppearances?: number | undefined;
  postImpressions?: number | undefined;
};

/**
 * A fully-validated fixture profile ready for embedding + insertion. The
 * taxonomy columns (industry/role/seniority/publicUrl) live alongside the
 * structured `parsed` content and the performance signals.
 */
export type BenchmarkFixtureProfile = {
  industry: string;
  role: string;
  seniority: string;
  publicUrl: string;
  parsed: BenchmarkParsedProfile;
  performanceSignals: BenchmarkPerformanceSignals | null;
};

/**
 * A row ready to insert into `benchmark_profiles` — a fixture profile plus its
 * computed 1024-dim embedding vector.
 */
export type BenchmarkRow = {
  industry: string;
  role: string;
  seniority: string;
  publicUrl: string;
  parsed: BenchmarkParsedProfile;
  embedding: number[];
  performanceSignals: BenchmarkPerformanceSignals | null;
};

/** Voyage `voyage-3` (and the schema column) are 1024-dimensional. */
export const BENCHMARK_EMBEDDING_DIM = 1024;
