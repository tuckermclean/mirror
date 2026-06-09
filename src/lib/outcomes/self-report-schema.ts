import { z } from "zod";

/**
 * Validation schema for a weekly self-reported outcome (Week 4 "Outcome
 * tracking"). Pure — used by POST /api/outcomes to validate request bodies.
 *
 * All metrics are non-negative integers with a generous sanity cap (no real
 * LinkedIn weekly figure approaches 100M; the cap guards against typos and
 * malformed input rather than legitimate scale).
 */
const METRIC_MAX = 100_000_000;

const metric = z
  .number()
  .int()
  .min(0)
  .max(METRIC_MAX)
  .default(0);

// YYYY-MM-DD, validated as a real calendar date (rejects 2026-13-40).
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "weekOf must be an ISO date (YYYY-MM-DD)")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "weekOf must be a valid calendar date");

export const selfReportSchema = z.object({
  weekOf: isoDate,
  profileViews: metric,
  searchAppearances: metric,
  recruiterMsgs: metric,
  postImpressions: metric,
});

export type SelfReport = z.infer<typeof selfReportSchema>;
