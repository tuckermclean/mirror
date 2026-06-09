/**
 * Unit tests for the weekly outcome aggregation math (Week 4 "Outcome
 * tracking" workstream, SPEC §7). Pure functions — no DB, no network.
 *
 * Covers:
 *  - aggregateWeeklySeries: sort, de-duplicate per week, sum metrics, edge cases.
 *  - computeOutcomeDelta: 30-day baseline vs 30-day after split, lift%.
 *  - Edge cases: no data, single week, partial weeks, zero baseline.
 */
import { describe, it, expect } from "vitest";

import {
  aggregateWeeklySeries,
  computeOutcomeDelta,
  type OutcomeRow,
} from "@/lib/outcomes/aggregation";

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------
function row(partial: Partial<OutcomeRow> & { weekOf: string }): OutcomeRow {
  return {
    profileViews: 0,
    searchAppearances: 0,
    recruiterMsgs: 0,
    postImpressions: 0,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// aggregateWeeklySeries
// ---------------------------------------------------------------------------
describe("aggregateWeeklySeries", () => {
  it("returns an empty array when there are no rows", () => {
    expect(aggregateWeeklySeries([])).toEqual([]);
  });

  it("passes a single week through unchanged", () => {
    const series = aggregateWeeklySeries([
      row({ weekOf: "2026-01-05", profileViews: 10, recruiterMsgs: 2 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      weekOf: "2026-01-05",
      profileViews: 10,
      recruiterMsgs: 2,
      searchAppearances: 0,
      postImpressions: 0,
    });
  });

  it("sorts weeks ascending by weekOf", () => {
    const series = aggregateWeeklySeries([
      row({ weekOf: "2026-02-02", profileViews: 3 }),
      row({ weekOf: "2026-01-05", profileViews: 1 }),
      row({ weekOf: "2026-01-19", profileViews: 2 }),
    ]);
    expect(series.map((s) => s.weekOf)).toEqual([
      "2026-01-05",
      "2026-01-19",
      "2026-02-02",
    ]);
  });

  it("coalesces multiple rows for the same week by summing metrics", () => {
    const series = aggregateWeeklySeries([
      row({ weekOf: "2026-01-05", profileViews: 10, recruiterMsgs: 1 }),
      row({ weekOf: "2026-01-05", profileViews: 5, recruiterMsgs: 2 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      weekOf: "2026-01-05",
      profileViews: 15,
      recruiterMsgs: 3,
    });
  });

  it("sums all four metrics independently across weeks", () => {
    const series = aggregateWeeklySeries([
      row({
        weekOf: "2026-01-05",
        profileViews: 10,
        searchAppearances: 4,
        recruiterMsgs: 1,
        postImpressions: 100,
      }),
      row({
        weekOf: "2026-01-12",
        profileViews: 20,
        searchAppearances: 8,
        recruiterMsgs: 3,
        postImpressions: 250,
      }),
    ]);
    expect(series).toEqual([
      {
        weekOf: "2026-01-05",
        profileViews: 10,
        searchAppearances: 4,
        recruiterMsgs: 1,
        postImpressions: 100,
      },
      {
        weekOf: "2026-01-12",
        profileViews: 20,
        searchAppearances: 8,
        recruiterMsgs: 3,
        postImpressions: 250,
      },
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [
      row({ weekOf: "2026-02-02", profileViews: 3 }),
      row({ weekOf: "2026-01-05", profileViews: 1 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    aggregateWeeklySeries(input);
    expect(input).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// computeOutcomeDelta
// ---------------------------------------------------------------------------
describe("computeOutcomeDelta", () => {
  const committedAt = new Date("2026-02-01T00:00:00.000Z");

  it("returns null lift and zeroed totals when there is no data", () => {
    const delta = computeOutcomeDelta([], committedAt);
    expect(delta.baseline30d).toEqual({
      profileViews: 0,
      searchAppearances: 0,
      recruiterMsgs: 0,
      postImpressions: 0,
    });
    expect(delta.after30d).toEqual({
      profileViews: 0,
      searchAppearances: 0,
      recruiterMsgs: 0,
      postImpressions: 0,
    });
    expect(delta.liftPct).toBeNull();
  });

  it("splits rows into the 30 days before vs after the commit date", () => {
    const delta = computeOutcomeDelta(
      [
        // baseline window (within 30d before 2026-02-01)
        row({ weekOf: "2026-01-05", profileViews: 10 }),
        row({ weekOf: "2026-01-19", profileViews: 10 }),
        // after window (within 30d after 2026-02-01)
        row({ weekOf: "2026-02-02", profileViews: 30 }),
        row({ weekOf: "2026-02-16", profileViews: 30 }),
      ],
      committedAt
    );
    expect(delta.baseline30d.profileViews).toBe(20);
    expect(delta.after30d.profileViews).toBe(60);
  });

  it("excludes rows outside both 30-day windows", () => {
    const delta = computeOutcomeDelta(
      [
        // 60+ days before — excluded from baseline
        row({ weekOf: "2025-11-01", profileViews: 999 }),
        // baseline
        row({ weekOf: "2026-01-19", profileViews: 10 }),
        // after
        row({ weekOf: "2026-02-09", profileViews: 20 }),
        // 60+ days after — excluded from after
        row({ weekOf: "2026-05-01", profileViews: 999 }),
      ],
      committedAt
    );
    expect(delta.baseline30d.profileViews).toBe(10);
    expect(delta.after30d.profileViews).toBe(20);
  });

  it("computes liftPct from the headline metric (profileViews) by default", () => {
    // baseline profileViews = 100, after = 150 => +50%
    const delta = computeOutcomeDelta(
      [
        row({ weekOf: "2026-01-19", profileViews: 100 }),
        row({ weekOf: "2026-02-09", profileViews: 150 }),
      ],
      committedAt
    );
    expect(delta.liftPct).toBe(50);
  });

  it("rounds liftPct to two decimal places", () => {
    // baseline = 30, after = 40 => 33.333...% => 33.33
    const delta = computeOutcomeDelta(
      [
        row({ weekOf: "2026-01-19", profileViews: 30 }),
        row({ weekOf: "2026-02-09", profileViews: 40 }),
      ],
      committedAt
    );
    expect(delta.liftPct).toBe(33.33);
  });

  it("returns negative lift when outcomes decline", () => {
    const delta = computeOutcomeDelta(
      [
        row({ weekOf: "2026-01-19", profileViews: 100 }),
        row({ weekOf: "2026-02-09", profileViews: 80 }),
      ],
      committedAt
    );
    expect(delta.liftPct).toBe(-20);
  });

  it("returns null lift when the baseline headline metric is zero (no division by zero)", () => {
    const delta = computeOutcomeDelta(
      [row({ weekOf: "2026-02-09", profileViews: 50 })],
      committedAt
    );
    expect(delta.baseline30d.profileViews).toBe(0);
    expect(delta.after30d.profileViews).toBe(50);
    expect(delta.liftPct).toBeNull();
  });

  it("treats a row dated exactly at the commit instant as part of the after window", () => {
    const delta = computeOutcomeDelta(
      [row({ weekOf: "2026-02-01", profileViews: 5 })],
      committedAt
    );
    expect(delta.after30d.profileViews).toBe(5);
    expect(delta.baseline30d.profileViews).toBe(0);
  });

  describe("DST boundary correctness", () => {
    /**
     * North-American DST transition (spring-forward) lands on the last Sunday
     * of March. A 30-day epoch-ms offset of `30 * 24 * 3600 * 1000` from a
     * commit date that straddles the clocks-change would shift the boundary
     * by one hour, potentially misclassifying a week that starts at 00:00 UTC
     * as falling just outside the window.
     *
     * The implementation MUST use UTC calendar arithmetic (subtract 30 days
     * on the calendar, anchored at 00:00 UTC) so the boundary is always an
     * exact calendar date regardless of DST or timezone.
     *
     * committedAt = 2024-04-07 UTC (after US spring-forward on 2024-03-10)
     * 30 calendar days before = 2024-03-08 UTC
     * A row for "2024-03-08" must land in the baseline window.
     */
    it("includes a week exactly 30 UTC calendar days before the commit in the baseline window", () => {
      const committedDst = new Date("2024-04-07T00:00:00.000Z");
      const delta = computeOutcomeDelta(
        [row({ weekOf: "2024-03-08", profileViews: 10 })],
        committedDst
      );
      // The row is exactly at the 30-day baseline boundary; it must be included.
      expect(delta.baseline30d.profileViews).toBe(10);
    });

    it("excludes a week exactly 31 UTC calendar days before the commit from the baseline window", () => {
      const committedDst = new Date("2024-04-07T00:00:00.000Z");
      const delta = computeOutcomeDelta(
        [row({ weekOf: "2024-03-07", profileViews: 99 })],
        committedDst
      );
      // 31 calendar days before the commit: must be outside the 30-day window.
      expect(delta.baseline30d.profileViews).toBe(0);
    });

    it("includes a week exactly 29 UTC calendar days after the commit in the after window", () => {
      const committedDst = new Date("2024-04-07T00:00:00.000Z");
      const delta = computeOutcomeDelta(
        [row({ weekOf: "2024-05-06", profileViews: 20 })],
        committedDst
      );
      // 29 calendar days after: must be inside the 30-day after window.
      expect(delta.after30d.profileViews).toBe(20);
    });

    it("excludes a week exactly 30 UTC calendar days after the commit from the after window", () => {
      const committedDst = new Date("2024-04-07T00:00:00.000Z");
      const delta = computeOutcomeDelta(
        [row({ weekOf: "2024-05-07", profileViews: 99 })],
        committedDst
      );
      // 30 calendar days after: must be outside the [commitMs, commitMs+30d) window.
      expect(delta.after30d.profileViews).toBe(0);
    });
  });
});
