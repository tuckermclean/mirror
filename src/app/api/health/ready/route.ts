import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

type CheckStatus = "ok" | "error";

interface ReadyChecks {
  db: CheckStatus;
  pgvector: CheckStatus;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  );
  return Promise.race([promise, timeout]);
}

async function checkDb(): Promise<CheckStatus> {
  try {
    await withTimeout(db.execute(sql`SELECT 1`), DB_TIMEOUT_MS);
    return "ok";
  } catch {
    return "error";
  }
}

async function checkPgvector(): Promise<CheckStatus> {
  try {
    const rows = await withTimeout(
      db.execute(sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`),
      DB_TIMEOUT_MS
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

  const response = NextResponse.json(
    { status: allOk ? "ok" : "error", checks },
    { status: allOk ? 200 : 503 }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
