import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  numeric,
  timestamp,
  date,
  customType,
  index,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// pgvector custom type
// ---------------------------------------------------------------------------
const vectorColumn = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(",").map(Number);
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
  })(name);

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").unique().notNull(),
  email: text("email").notNull(),
  plan: text("plan").notNull().default("free"),
  // Nullable FK to imports — set null on import delete (no cascade).
  // Uses AnyPgColumn return type to resolve the forward reference to imports
  // without a TypeScript "used before declaration" error.
  voiceProfileId: uuid("voice_profile_id").references(
    (): AnyPgColumn => imports.id,
    { onDelete: "set null" }
  ),
});

// ---------------------------------------------------------------------------
// interviews
// ---------------------------------------------------------------------------
export const interviews = pgTable("interviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  transcript: jsonb("transcript").notNull().default([]),
  summary: text("summary"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  turnCount: integer("turn_count").notNull().default(0),
});

// ---------------------------------------------------------------------------
// imports
// ---------------------------------------------------------------------------
export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    rawPath: text("raw_path"),
    parsed: jsonb("parsed"),
    voiceEmbedding: vectorColumn("voice_embedding", 3072),
  },
  (table) => [index("imports_user_id_idx").on(table.userId)]
);

// ---------------------------------------------------------------------------
// linkedinSnapshots
// ---------------------------------------------------------------------------
export const linkedinSnapshots = pgTable("linkedin_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rawHtml: text("raw_html"),
  parsed: jsonb("parsed"),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// generations
// ---------------------------------------------------------------------------
export const generations = pgTable("generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  inputSnapshotId: uuid("input_snapshot_id").references(
    () => linkedinSnapshots.id,
    { onDelete: "set null" }
  ),
  output: jsonb("output"),
  rationale: jsonb("rationale"),
  model: text("model").notNull(),
  promptHash: text("prompt_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// commits
// ---------------------------------------------------------------------------
export const commits = pgTable("commits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => generations.id, { onDelete: "cascade" }),
  fieldsAccepted: jsonb("fields_accepted").notNull().default({}),
  committedAt: timestamp("committed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  method: text("method").notNull(),
});

// ---------------------------------------------------------------------------
// outcomes
// ---------------------------------------------------------------------------
export const outcomes = pgTable("outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekOf: date("week_of").notNull(),
  profileViews: integer("profile_views").notNull().default(0),
  searchAppearances: integer("search_appearances").notNull().default(0),
  recruiterMsgs: integer("recruiter_msgs").notNull().default(0),
  postImpressions: integer("post_impressions").notNull().default(0),
  source: text("source").notNull(),
});

// ---------------------------------------------------------------------------
// benchmarkProfiles
// ---------------------------------------------------------------------------
export const benchmarkProfiles = pgTable(
  "benchmark_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    industry: text("industry").notNull(),
    role: text("role").notNull(),
    seniority: text("seniority").notNull(),
    publicUrl: text("public_url").notNull(),
    parsed: jsonb("parsed"),
    embedding: vectorColumn("embedding", 3072),
    performanceSignals: jsonb("performance_signals"),
  },
  (table) => [
    // halfvec_cosine_ops is embedded in the sql template rather than via .op()
    // because Drizzle cannot yet position an operator class on an expression index
    // (only on plain column indexes). The template is passed verbatim to CREATE INDEX,
    // so it works today — but if Drizzle adds expression-index .op() support, migrate
    // to that API to avoid placement issues if Drizzle ever parses the expression list.
    // Track: https://github.com/drizzle-team/drizzle-orm/issues/1006 (expression-index ops)
    index("benchmark_profiles_embedding_hnsw_idx")
      .using("hnsw", sql`(${table.embedding}::halfvec(3072)) halfvec_cosine_ops`)
      .with({ m: 16, ef_construction: 64 }),
  ]
);

// ---------------------------------------------------------------------------
// outcomeDeltas
// ---------------------------------------------------------------------------
export const outcomeDeltas = pgTable("outcome_deltas", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => generations.id, { onDelete: "cascade" }),
  baseline30d: jsonb("baseline_30d"),
  after30d: jsonb("after_30d"),
  liftPct: numeric("lift_pct", { precision: 5, scale: 2 }),
});

// ---------------------------------------------------------------------------
// llmSpendLedger
// ---------------------------------------------------------------------------
export const llmSpendLedger = pgTable(
  "llm_spend_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Nullable: chat calls don't have a generation; set null when generation deleted
    generationId: uuid("generation_id").references(() => generations.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Backs the MTD cost query called before every LLM generation (AGENTS.md architecture rule)
    index("llm_spend_ledger_user_recorded_at_idx").on(table.userId, table.recordedAt),
  ]
);

// ---------------------------------------------------------------------------
// auditLog
// ---------------------------------------------------------------------------
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: the subject user may be deleted; nullify on delete (GDPR)
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // The user performing the read — FK to users with RESTRICT so audit records
    // outlive soft-deletes; hard-delete of an accessor must be handled explicitly.
    accessorId: uuid("accessor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tableName: text("table_name").notNull(),
    rowId: uuid("row_id").notNull(),
    fieldName: text("field_name").notNull(),
    accessedAt: timestamp("accessed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reason: text("reason"),
    ipAddress: text("ip_address"),
  },
  (table) => [
    index("audit_log_user_accessed_at_idx").on(table.userId, table.accessedAt),
  ]
);
