/**
 * Unit tests for the self-report input validation schema (Week 4 "Outcome
 * tracking"). Pure zod schema — no DB, no network.
 */
import { describe, it, expect } from "vitest";

import { selfReportSchema } from "@/lib/outcomes/self-report-schema";

const valid = {
  weekOf: "2026-02-02",
  profileViews: 42,
  searchAppearances: 8,
  recruiterMsgs: 3,
  postImpressions: 1200,
};

describe("selfReportSchema", () => {
  it("accepts a fully populated, well-formed report", () => {
    const parsed = selfReportSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("defaults missing metrics to 0", () => {
    const parsed = selfReportSchema.safeParse({ weekOf: "2026-02-02" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.profileViews).toBe(0);
      expect(parsed.data.searchAppearances).toBe(0);
      expect(parsed.data.recruiterMsgs).toBe(0);
      expect(parsed.data.postImpressions).toBe(0);
    }
  });

  it("rejects a missing weekOf", () => {
    const parsed = selfReportSchema.safeParse({ profileViews: 1 });
    expect(parsed.success).toBe(false);
  });

  it("rejects a weekOf that is not an ISO date (YYYY-MM-DD)", () => {
    for (const weekOf of ["2026/02/02", "02-02-2026", "not-a-date", "2026-13-40"]) {
      const parsed = selfReportSchema.safeParse({ ...valid, weekOf });
      expect(parsed.success, weekOf).toBe(false);
    }
  });

  it("rejects negative metric values", () => {
    const parsed = selfReportSchema.safeParse({ ...valid, profileViews: -1 });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-integer metric values", () => {
    const parsed = selfReportSchema.safeParse({ ...valid, profileViews: 1.5 });
    expect(parsed.success).toBe(false);
  });

  it("rejects absurdly large metric values (sanity cap)", () => {
    const parsed = selfReportSchema.safeParse({ ...valid, profileViews: 100_000_001 });
    expect(parsed.success).toBe(false);
  });
});
