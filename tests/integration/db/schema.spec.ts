// Integration tests — requires DATABASE_URL pointing at a migrated postgres+pgvector instance.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required for schema integration tests");
  sql = postgres(url);
  await sql`SELECT 1`; // fast connectivity check — single clear failure vs 29 ECONNREFUSED errors
});

afterAll(async () => {
  await sql?.end();
});

// ---------------------------------------------------------------------------
// 1. All 11 tables exist after migration
// ---------------------------------------------------------------------------
describe("all 11 tables exist in the database after migration", () => {
  const EXPECTED_TABLES = [
    "users",
    "interviews",
    "imports",
    "linkedin_snapshots",
    "generations",
    "commits",
    "outcomes",
    "benchmark_profiles",
    "outcome_deltas",
    "llm_spend_ledger",
    "audit_log",
  ];

  for (const table of EXPECTED_TABLES) {
    it(`table "${table}" exists`, async () => {
      const rows = await sql`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename = ${table}
      `;
      expect(rows).toHaveLength(1);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. vector(3072) columns on benchmark_profiles and imports
// ---------------------------------------------------------------------------
describe("vector(3072) columns", () => {
  it("benchmark_profiles.embedding is vector(3072)", async () => {
    const [row] = await sql`
      SELECT format_type(a.atttypid, a.atttypmod) AS col_type
      FROM   pg_attribute a
      JOIN   pg_class     c ON c.oid = a.attrelid
      WHERE  c.relname  = 'benchmark_profiles'
        AND  a.attname  = 'embedding'
        AND  a.attnum   > 0
        AND  NOT a.attisdropped
    `;
    expect(row).toBeDefined();
    expect(row?.col_type).toBe("vector(3072)");
  });

  it("imports.voice_embedding is vector(3072)", async () => {
    const [row] = await sql`
      SELECT format_type(a.atttypid, a.atttypmod) AS col_type
      FROM   pg_attribute a
      JOIN   pg_class     c ON c.oid = a.attrelid
      WHERE  c.relname  = 'imports'
        AND  a.attname  = 'voice_embedding'
        AND  a.attnum   > 0
        AND  NOT a.attisdropped
    `;
    expect(row).toBeDefined();
    expect(row?.col_type).toBe("vector(3072)");
  });
});

// ---------------------------------------------------------------------------
// 3. llm_spend_ledger column types
// ---------------------------------------------------------------------------
describe("llm_spend_ledger column types", () => {
  it("cost_usd is NUMERIC(10,6)", async () => {
    const [row] = await sql`
      SELECT numeric_precision, numeric_scale
      FROM   information_schema.columns
      WHERE  table_schema = 'public'
        AND  table_name   = 'llm_spend_ledger'
        AND  column_name  = 'cost_usd'
    `;
    expect(row).toBeDefined();
    expect(Number(row?.numeric_precision)).toBe(10);
    expect(Number(row?.numeric_scale)).toBe(6);
  });

  it("input_tokens is INTEGER", async () => {
    const [row] = await sql`
      SELECT data_type
      FROM   information_schema.columns
      WHERE  table_schema = 'public'
        AND  table_name   = 'llm_spend_ledger'
        AND  column_name  = 'input_tokens'
    `;
    expect(row?.data_type).toBe("integer");
  });

  it("output_tokens is INTEGER", async () => {
    const [row] = await sql`
      SELECT data_type
      FROM   information_schema.columns
      WHERE  table_schema = 'public'
        AND  table_name   = 'llm_spend_ledger'
        AND  column_name  = 'output_tokens'
    `;
    expect(row?.data_type).toBe("integer");
  });

  it("recorded_at is TIMESTAMPTZ", async () => {
    const [row] = await sql`
      SELECT udt_name
      FROM   information_schema.columns
      WHERE  table_schema = 'public'
        AND  table_name   = 'llm_spend_ledger'
        AND  column_name  = 'recorded_at'
    `;
    expect(row?.udt_name).toBe("timestamptz");
  });

  it("user_id is NOT NULL", async () => {
    const [row] = await sql`
      SELECT is_nullable
      FROM   information_schema.columns
      WHERE  table_schema = 'public'
        AND  table_name   = 'llm_spend_ledger'
        AND  column_name  = 'user_id'
    `;
    expect(row?.is_nullable).toBe("NO");
  });
});

// ---------------------------------------------------------------------------
// 4. Foreign key constraints
// ---------------------------------------------------------------------------
describe("foreign key constraints enforce referential integrity", () => {
  // Assumes single-column FKs — all current schema FKs are single-column. If a composite
  // FK is ever added, this helper will return multiple rows and toHaveLength(1) will fail.
  async function getFkTarget(childTable: string, childColumn: string) {
    return sql`
      SELECT ccu.table_name  AS referenced_table,
             ccu.column_name AS referenced_column,
             rc.delete_rule
      FROM   information_schema.table_constraints       tc
      JOIN   information_schema.key_column_usage        kcu
               ON  kcu.constraint_name = tc.constraint_name
               AND kcu.table_schema    = tc.table_schema
      JOIN   information_schema.referential_constraints rc
               ON  rc.constraint_name = tc.constraint_name
      JOIN   information_schema.constraint_column_usage ccu
               ON  ccu.constraint_name = rc.unique_constraint_name
               AND ccu.table_schema    = rc.unique_constraint_schema
      WHERE  tc.constraint_type = 'FOREIGN KEY'
        AND  tc.table_schema    = 'public'
        AND  tc.table_name      = ${childTable}
        AND  kcu.column_name    = ${childColumn}
    `;
  }

  it("interviews.user_id → users.id (CASCADE)", async () => {
    const rows = await getFkTarget("interviews", "user_id");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenced_table).toBe("users");
    expect(rows[0]?.delete_rule).toBe("CASCADE");
  });

  it("imports.user_id → users.id (CASCADE)", async () => {
    const rows = await getFkTarget("imports", "user_id");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenced_table).toBe("users");
    expect(rows[0]?.delete_rule).toBe("CASCADE");
  });

  it("generations.input_snapshot_id → linkedin_snapshots.id (SET NULL)", async () => {
    const rows = await getFkTarget("generations", "input_snapshot_id");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenced_table).toBe("linkedin_snapshots");
    expect(rows[0]?.delete_rule).toBe("SET NULL");
  });

  it("commits.generation_id → generations.id (CASCADE)", async () => {
    const rows = await getFkTarget("commits", "generation_id");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenced_table).toBe("generations");
    expect(rows[0]?.delete_rule).toBe("CASCADE");
  });

  it("llm_spend_ledger.generation_id → generations.id (SET NULL)", async () => {
    const rows = await getFkTarget("llm_spend_ledger", "generation_id");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenced_table).toBe("generations");
    expect(rows[0]?.delete_rule).toBe("SET NULL");
  });

  it("audit_log.user_id → users.id (SET NULL — GDPR nullify on user delete)", async () => {
    const rows = await getFkTarget("audit_log", "user_id");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenced_table).toBe("users");
    expect(rows[0]?.delete_rule).toBe("SET NULL");
  });

  it("audit_log.accessor_id → users.id (RESTRICT — prevents deleting users with audit entries)", async () => {
    const rows = await getFkTarget("audit_log", "accessor_id");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenced_table).toBe("users");
    expect(rows[0]?.delete_rule).toBe("RESTRICT");
  });

  it("users.voice_profile_id → imports.id (SET NULL)", async () => {
    const rows = await getFkTarget("users", "voice_profile_id");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.referenced_table).toBe("imports");
    expect(rows[0]?.delete_rule).toBe("SET NULL");
  });

  it("users.voice_profile_id FK is named users_voice_profile_id_imports_id_fk", async () => {
    const rows = await sql`
      SELECT tc.constraint_name
      FROM   information_schema.table_constraints       tc
      JOIN   information_schema.key_column_usage        kcu
               ON  kcu.constraint_name = tc.constraint_name
               AND kcu.table_schema    = tc.table_schema
      WHERE  tc.constraint_type = 'FOREIGN KEY'
        AND  tc.table_schema    = 'public'
        AND  tc.table_name      = 'users'
        AND  kcu.column_name    = 'voice_profile_id'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.constraint_name).toBe("users_voice_profile_id_imports_id_fk");
  });
});

// ---------------------------------------------------------------------------
// 5. HNSW index on benchmark_profiles.embedding
// ---------------------------------------------------------------------------
describe("HNSW index on benchmark_profiles.embedding", () => {
  it("index exists and uses HNSW with cosine distance ops", async () => {
    const rows = await sql`
      SELECT indexname, indexdef
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  tablename  = 'benchmark_profiles'
        AND  indexdef   ILIKE '%hnsw%'
    `;
    expect(rows).toHaveLength(1);
    // pgvector 0.8.x: vector(3072) HNSW uses a halfvec cast expression
    // to bypass the 2000-dimension limit; ops class is halfvec_cosine_ops.
    // Assert both to guard against regression to the pre-fix vector_cosine_ops form.
    expect(rows[0]?.indexdef).toContain("halfvec_cosine_ops");
    expect(rows[0]?.indexdef).toContain("halfvec(3072)");
  });

  it("HNSW index has m=16 and ef_construction=64", async () => {
    const [row] = await sql`
      SELECT array_to_string(pc.reloptions, ',') AS opts
      FROM   pg_class pc
      JOIN   pg_class pt ON pt.relname = 'benchmark_profiles'
      JOIN   pg_index pi ON pi.indexrelid = pc.oid AND pi.indrelid = pt.oid
      WHERE  pc.relname = 'benchmark_profiles_embedding_hnsw_idx'
    `;
    expect(row).toBeDefined();
    const opts = row?.opts ?? "";
    expect(opts).toContain("m=16");
    expect(opts).toContain("ef_construction=64");
  });
});

// ---------------------------------------------------------------------------
// 6. btree index on imports.user_id
// ---------------------------------------------------------------------------
describe("btree index on imports.user_id", () => {
  it("index exists", async () => {
    const rows = await sql`
      SELECT indexname, indexdef
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  tablename  = 'imports'
        AND  indexdef   ILIKE '%btree%'
        AND  indexdef   ILIKE '%user_id%'
    `;
    expect(rows.length).toBeGreaterThan(0);
  });

  it("index name matches convention imports_user_id_idx", async () => {
    const rows = await sql`
      SELECT indexname
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  tablename  = 'imports'
        AND  indexname  = 'imports_user_id_idx'
    `;
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. btree index on llm_spend_ledger(user_id, recorded_at)
// ---------------------------------------------------------------------------
describe("btree index on llm_spend_ledger(user_id, recorded_at)", () => {
  it("llm_spend_ledger_user_recorded_at_idx exists", async () => {
    const rows = await sql`
      SELECT indexname
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  tablename  = 'llm_spend_ledger'
        AND  indexname  = 'llm_spend_ledger_user_recorded_at_idx'
    `;
    expect(rows).toHaveLength(1);
  });

  it("index covers (user_id, recorded_at) for the MTD cost query", async () => {
    const rows = await sql`
      SELECT indexdef
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  indexname  = 'llm_spend_ledger_user_recorded_at_idx'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain("user_id");
    expect(rows[0]?.indexdef).toContain("recorded_at");
  });
});

// ---------------------------------------------------------------------------
// 8. btree index on audit_log(user_id, accessed_at)
// ---------------------------------------------------------------------------
describe("btree index on audit_log(user_id, accessed_at)", () => {
  it("audit_log_user_accessed_at_idx exists", async () => {
    const rows = await sql`
      SELECT indexname
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  tablename  = 'audit_log'
        AND  indexname  = 'audit_log_user_accessed_at_idx'
    `;
    expect(rows).toHaveLength(1);
  });

  it("index covers (user_id, accessed_at) for per-user audit trail queries", async () => {
    const rows = await sql`
      SELECT indexdef
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  indexname  = 'audit_log_user_accessed_at_idx'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain("user_id");
    expect(rows[0]?.indexdef).toContain("accessed_at");
  });
});

// ---------------------------------------------------------------------------
// 9. btree index on audit_log(accessor_id) for RESTRICT FK enforcement
// ---------------------------------------------------------------------------
describe("btree index on audit_log(accessor_id)", () => {
  // PostgreSQL must verify no referencing rows exist before DELETE/UPDATE on users
  // when the RESTRICT FK is in effect. Without this index, that check is a full
  // sequential scan of audit_log — which grows with every PII read.
  it("audit_log_accessor_id_idx exists", async () => {
    const rows = await sql`
      SELECT indexname
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  tablename  = 'audit_log'
        AND  indexname  = 'audit_log_accessor_id_idx'
    `;
    expect(rows).toHaveLength(1);
  });

  it("index covers accessor_id for fast RESTRICT FK check on user delete", async () => {
    const rows = await sql`
      SELECT indexdef
      FROM   pg_indexes
      WHERE  schemaname = 'public'
        AND  indexname  = 'audit_log_accessor_id_idx'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain("accessor_id");
  });
});
