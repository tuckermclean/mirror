import { selfReportSchema, type SelfReport } from "@/lib/outcomes/self-report-schema";

/**
 * Pure helpers for the weekly self-report capture UI (Week 4 "Outcome
 * tracking"). Keeping field parsing here lets the React component stay thin and
 * lets the logic be unit-tested without a DOM runner.
 */

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Parse one metric input field. Empty string → 0; otherwise a non-negative int. */
export function parseMetricField(raw: string): ParseResult<number> {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: 0 };
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "Enter a whole number of 0 or more" };
  }
  return { ok: true, value: Number(trimmed) };
}

export interface ReportFormFields {
  weekOf: string;
  profileViews: string;
  searchAppearances: string;
  recruiterMsgs: string;
  postImpressions: string;
}

/**
 * Build a validated self-report payload from raw string fields. Runs the same
 * zod schema the API uses, so client and server agree on what is valid.
 */
export function buildReportPayload(
  fields: ReportFormFields
): ParseResult<SelfReport> {
  const candidate = {
    weekOf: fields.weekOf,
    profileViews: parseMetricField(fields.profileViews),
    searchAppearances: parseMetricField(fields.searchAppearances),
    recruiterMsgs: parseMetricField(fields.recruiterMsgs),
    postImpressions: parseMetricField(fields.postImpressions),
  };

  for (const key of [
    "profileViews",
    "searchAppearances",
    "recruiterMsgs",
    "postImpressions",
  ] as const) {
    const parsed = candidate[key];
    if (!parsed.ok) return { ok: false, error: `${key}: ${parsed.error}` };
  }

  const result = selfReportSchema.safeParse({
    weekOf: candidate.weekOf,
    profileViews: (candidate.profileViews as { value: number }).value,
    searchAppearances: (candidate.searchAppearances as { value: number }).value,
    recruiterMsgs: (candidate.recruiterMsgs as { value: number }).value,
    postImpressions: (candidate.postImpressions as { value: number }).value,
  });

  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid report" };
  }
  return { ok: true, value: result.data };
}

/** The Monday (ISO week start) of the given date, as a YYYY-MM-DD string. */
export function isoWeekStart(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // getUTCDay: 0=Sun..6=Sat. Days since Monday: Sun→6, Mon→0, ..., Sat→5.
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}
