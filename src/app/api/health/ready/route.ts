import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

// auth handled by middleware — public health endpoint
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

type CheckStatus = "ok" | "error";

interface ReadyChecks {
  db: CheckStatus;
  pgvector: CheckStatus;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timerId !== undefined) clearTimeout(timerId);
  });
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
  // Run both checks in parallel; they share the same connection pool so
  // pgvector also fails when the DB is down — no separate short-circuit needed.
  // Keep Kubernetes probe timeoutSeconds ≥ 4 s to accommodate DB_TIMEOUT_MS
  // (3 s) plus network overhead.
  const [dbStatus, pgvectorStatus] = await Promise.all([checkDb(), checkPgvector()]);

  const checks: ReadyChecks = { db: dbStatus, pgvector: pgvectorStatus };
  const allOk = checks.db === "ok" && checks.pgvector === "ok";

  const response = NextResponse.json(
    { status: allOk ? "ok" : "error", checks },
    { status: allOk ? 200 : 503 }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
