/**
 * Pure weekly outcome aggregation math (Week 4 "Outcome tracking", SPEC §7).
 *
 * No DB, no network — all functions are deterministic over their inputs so the
 * unit tests in tests/unit/outcomes/ fully pin the behaviour. The API layer is
 * responsible for fetching raw `outcomes` rows and persisting the results.
 */

/** A single raw outcome row's metrics plus the ISO week it belongs to. */
export interface OutcomeRow {
  /** ISO date (YYYY-MM-DD) of the Monday the week starts — `outcomes.week_of`. */
  weekOf: string;
  profileViews: number;
  searchAppearances: number;
  recruiterMsgs: number;
  postImpressions: number;
}

/** One coalesced point in the weekly series (one entry per distinct week). */
export type WeeklyPoint = OutcomeRow;

/** The four metric totals over a window, with no week dimension. */
export interface MetricTotals {
  profileViews: number;
  searchAppearances: number;
  recruiterMsgs: number;
  postImpressions: number;
}

/** Result of the baseline-vs-after delta computation for `outcome_deltas`. */
export interface OutcomeDelta {
  baseline30d: MetricTotals;
  after30d: MetricTotals;
  /**
   * Percentage lift in the headline metric (profileViews) from baseline to
   * after, rounded to 2 dp. `null` when the baseline is 0 (division undefined).
   */
  liftPct: number | null;
}

const ZERO_TOTALS: MetricTotals = {
  profileViews: 0,
  searchAppearances: 0,
  recruiterMsgs: 0,
  postImpressions: 0,
};

/**
 * Add `days` calendar days to a UTC date, returning a new UTC midnight.
 * Uses Date.UTC arithmetic instead of epoch-ms multiplication so the boundary
 * is always an exact calendar date regardless of DST or local timezone.
 */
function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days
    )
  );
}

/** Add `b`'s metrics into a fresh copy of `a`. */
function addMetrics(a: MetricTotals, b: OutcomeRow): MetricTotals {
  return {
    profileViews: a.profileViews + b.profileViews,
    searchAppearances: a.searchAppearances + b.searchAppearances,
    recruiterMsgs: a.recruiterMsgs + b.recruiterMsgs,
    postImpressions: a.postImpressions + b.postImpressions,
  };
}

/**
 * Aggregate raw outcome rows into a weekly series: one point per distinct
 * `weekOf`, metrics summed across duplicate rows, sorted ascending by week.
 * Does not mutate the input.
 */
export function aggregateWeeklySeries(rows: readonly OutcomeRow[]): WeeklyPoint[] {
  const byWeek = new Map<string, WeeklyPoint>();
  for (const r of rows) {
    const existing = byWeek.get(r.weekOf);
    byWeek.set(
      r.weekOf,
      existing
        ? { weekOf: r.weekOf, ...addMetrics(existing, r) }
        : {
            weekOf: r.weekOf,
            profileViews: r.profileViews,
            searchAppearances: r.searchAppearances,
            recruiterMsgs: r.recruiterMsgs,
            postImpressions: r.postImpressions,
          }
    );
  }
  return [...byWeek.values()].sort((a, b) => a.weekOf.localeCompare(b.weekOf));
}

/** Round to 2 decimal places, avoiding `-0`. */
function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

/**
 * Compute the 30-day baseline (the 30 days before `committedAt`) vs the 30-day
 * after window, plus the headline-metric lift%.
 *
 * A row at exactly `committedAt` counts as "after" (the commit took effect that
 * instant). `liftPct` is null when the baseline headline metric is 0.
 */
export function computeOutcomeDelta(
  rows: readonly OutcomeRow[],
  committedAt: Date
): OutcomeDelta {
  // UTC calendar boundaries for the 30-day windows. Using addUtcDays instead
  // of epoch-ms multiplication ensures the boundary is always an exact calendar
  // date even when DST transitions fall within the window.
  const commitMs = committedAt.getTime();
  const baselineStartMs = addUtcDays(committedAt, -30).getTime();
  const afterEndMs = addUtcDays(committedAt, 30).getTime();
  let baseline = { ...ZERO_TOTALS };
  let after = { ...ZERO_TOTALS };

  for (const r of rows) {
    const weekMs = new Date(`${r.weekOf}T00:00:00.000Z`).getTime();
    if (weekMs >= commitMs && weekMs < afterEndMs) {
      after = addMetrics(after, r);
    } else if (weekMs < commitMs && weekMs >= baselineStartMs) {
      baseline = addMetrics(baseline, r);
    }
  }

  const liftPct =
    baseline.profileViews === 0
      ? null
      : round2(
          ((after.profileViews - baseline.profileViews) / baseline.profileViews) *
            100
        );

  return { baseline30d: baseline, after30d: after, liftPct };
}
