/**
 * Unit tests for the pure self-report form helpers (Week 4 "Outcome
 * tracking"). The capture UI component stays thin by delegating field parsing
 * and the current-ISO-week default to these tested functions.
 */
import { describe, it, expect } from "vitest";

import {
  parseMetricField,
  buildReportPayload,
  isoWeekStart,
} from "@/lib/outcomes/report-form";

describe("parseMetricField", () => {
  it("treats an empty string as 0", () => {
    expect(parseMetricField("")).toEqual({ ok: true, value: 0 });
  });

  it("parses a valid non-negative integer", () => {
    expect(parseMetricField("42")).toEqual({ ok: true, value: 42 });
  });

  it("rejects a negative number", () => {
    expect(parseMetricField("-1").ok).toBe(false);
  });

  it("rejects a non-integer", () => {
    expect(parseMetricField("1.5").ok).toBe(false);
  });

  it("rejects non-numeric text", () => {
    expect(parseMetricField("abc").ok).toBe(false);
  });
});

describe("buildReportPayload", () => {
  it("assembles a valid payload from string fields", () => {
    const result = buildReportPayload({
      weekOf: "2026-02-02",
      profileViews: "10",
      searchAppearances: "",
      recruiterMsgs: "2",
      postImpressions: "300",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        weekOf: "2026-02-02",
        profileViews: 10,
        searchAppearances: 0,
        recruiterMsgs: 2,
        postImpressions: 300,
      },
    });
  });

  it("fails when any field is invalid", () => {
    const result = buildReportPayload({
      weekOf: "2026-02-02",
      profileViews: "-3",
      searchAppearances: "0",
      recruiterMsgs: "0",
      postImpressions: "0",
    });
    expect(result.ok).toBe(false);
  });
});

describe("isoWeekStart", () => {
  it("returns the Monday of the week as YYYY-MM-DD", () => {
    // 2026-02-04 is a Wednesday → Monday is 2026-02-02.
    expect(isoWeekStart(new Date("2026-02-04T12:00:00.000Z"))).toBe("2026-02-02");
  });

  it("returns the same day when the date is already Monday", () => {
    expect(isoWeekStart(new Date("2026-02-02T00:00:00.000Z"))).toBe("2026-02-02");
  });

  it("maps Sunday back to the preceding Monday", () => {
    // 2026-02-08 is a Sunday → its ISO week started Monday 2026-02-02.
    expect(isoWeekStart(new Date("2026-02-08T23:00:00.000Z"))).toBe("2026-02-02");
  });
});
