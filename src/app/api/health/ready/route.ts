import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

interface ReadyChecks {
  db: CheckStatus;
  pgvector: CheckStatus;
}

async function checkDb(): Promise<CheckStatus> {
  try {
    await db.execute(sql`SELECT 1`);
    return "ok";
  } catch {
    return "error";
  }
}

async function checkPgvector(): Promise<CheckStatus> {
  try {
    const rows = await db.execute(
      sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`
    );
    return rows.length > 0 ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function GET(): Promise<NextResponse> {
  const dbStatus = await checkDb();

  // Skip pgvector check if DB itself is down — avoids a second failing query.
  const pgvectorStatus: CheckStatus =
    dbStatus === "ok" ? await checkPgvector() : "error";

  const checks: ReadyChecks = { db: dbStatus, pgvector: pgvectorStatus };
  const allOk = checks.db === "ok" && checks.pgvector === "ok";

  return NextResponse.json(
    { status: allOk ? "ok" : "error", checks },
    { status: allOk ? 200 : 503 }
  );
}
