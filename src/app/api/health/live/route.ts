import { NextResponse } from "next/server";

// auth handled by middleware — public health endpoint
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const response = NextResponse.json({ status: "ok", ts: new Date().toISOString() });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
