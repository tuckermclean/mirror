/**
 * Unit tests for the benchmark corpus parser/loader (src/lib/benchmark).
 *
 * Pure logic only — no DB, no network. Covers:
 *   - LinkedIn public-profile HTML parsing (data-testid fixtures)
 *   - benchmark JSON fixture validation/loading
 *   - deterministic embedding-text construction
 *
 * SPEC Wk4 row: "scraper parser correctness on 10 fixtures". The JSON corpus
 * fixture `clusters.json` carries 11 role-cluster profiles, plus the two HTML
 * fixtures and the legacy `sre-top5.json` — well over the required 10.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseLinkedInProfileHtml,
  parseBenchmarkRecord,
  loadBenchmarkFixtures,
  buildEmbeddingText,
} from "@/lib/benchmark/parser";

const FIXTURE_ROOT = join(process.cwd(), "fixtures");
const html = (name: string) =>
  readFileSync(join(FIXTURE_ROOT, "linkedin-pages", name), "utf8");
const json = (name: string) =>
  readFileSync(join(FIXTURE_ROOT, "benchmark-profiles", name), "utf8");

describe("parseLinkedInProfileHtml", () => {
  it("extracts headline, about, and experience from the profile fixture", () => {
    const res = parseLinkedInProfileHtml(html("profile-fixture.html"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p = res.value;
    expect(p.headline).toContain("Staff Engineer");
    expect(p.about).toContain("systems that scale");
    expect(p.experience.length).toBe(2);
    expect(p.experience[0]?.title).toBe("Staff Software Engineer");
    expect(p.experience[0]?.company).toContain("Acme Cloud");
    expect(p.experience[0]?.bullets[0]).toContain("re-architecture");
  });

  it("parses the second HTML fixture (seed-profile.html)", () => {
    const res = parseLinkedInProfileHtml(html("seed-profile.html"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.headline.length).toBeGreaterThan(0);
    expect(res.value.experience.length).toBeGreaterThan(0);
  });

  it("returns a ParseError when no profile markup is present", () => {
    const res = parseLinkedInProfileHtml("<html><body>nothing here</body></html>");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.name).toBe("ParseError");
  });

  it("decodes HTML entities in extracted text", () => {
    const markup = `
      <div data-testid="profile-headline">Lead &amp; Principal</div>
      <div data-testid="about-text">scaled 0&#8594;1 &lt;fast&gt;</div>
      <div data-testid="experience-item">
        <div data-testid="exp-title">Eng &amp; Ops</div>
        <div data-testid="exp-company">Acme</div>
      </div>`;
    const res = parseLinkedInProfileHtml(markup);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.headline).toBe("Lead & Principal");
    expect(res.value.about).toContain("<fast>");
    expect(res.value.experience[0]?.title).toBe("Eng & Ops");
  });
});

describe("parseBenchmarkRecord", () => {
  const records = JSON.parse(json("clusters.json")) as unknown[];

  it("validates and normalizes all 11 cluster fixtures", () => {
    for (const rec of records) {
      const res = parseBenchmarkRecord(rec);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const p = res.value;
      expect(p.industry.length).toBeGreaterThan(0);
      expect(p.role.length).toBeGreaterThan(0);
      expect(p.seniority.length).toBeGreaterThan(0);
      expect(p.publicUrl).toMatch(/^https?:\/\//);
      expect(p.parsed.headline.length).toBeGreaterThan(0);
      expect(Array.isArray(p.parsed.experience)).toBe(true);
    }
  });

  it("count of cluster fixtures is at least 10 (SPEC: 10 fixtures)", () => {
    expect(records.length).toBeGreaterThanOrEqual(10);
  });

  it("also parses the legacy sre-top5 fixture rows", () => {
    const sre = JSON.parse(json("sre-top5.json")) as unknown[];
    expect(sre.length).toBe(5);
    for (const rec of sre) {
      const res = parseBenchmarkRecord(rec);
      expect(res.ok).toBe(true);
    }
  });

  it("rejects a record missing a required field", () => {
    const res = parseBenchmarkRecord({ role: "PM", seniority: "senior" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.name).toBe("ParseError");
  });

  it("rejects a non-object record", () => {
    expect(parseBenchmarkRecord(null).ok).toBe(false);
    expect(parseBenchmarkRecord("nope").ok).toBe(false);
    expect(parseBenchmarkRecord(42).ok).toBe(false);
  });

  it("preserves performanceSignals when present and tolerates absence", () => {
    const withSignals = parseBenchmarkRecord(records[0]);
    expect(withSignals.ok).toBe(true);
    if (withSignals.ok) {
      expect(withSignals.value.performanceSignals).toBeTruthy();
    }
    const minimal = parseBenchmarkRecord({
      industry: "tech",
      role: "PM",
      seniority: "senior",
      publicUrl: "https://x.test/p",
      headline: "PM",
      about: "I build things",
      experience: [],
    });
    expect(minimal.ok).toBe(true);
    if (minimal.ok) expect(minimal.value.performanceSignals).toBeNull();
  });
});

describe("loadBenchmarkFixtures", () => {
  it("loads an array of records from a JSON string", () => {
    const res = loadBenchmarkFixtures(json("clusters.json"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.length).toBe(11);
  });

  it("returns a ParseError on malformed JSON", () => {
    const res = loadBenchmarkFixtures("{ not json");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.name).toBe("ParseError");
  });

  it("returns a ParseError when the top level is not an array", () => {
    const res = loadBenchmarkFixtures('{"role":"PM"}');
    expect(res.ok).toBe(false);
  });

  it("fails the whole batch if any record is invalid", () => {
    const res = loadBenchmarkFixtures('[{"role":"PM"}]');
    expect(res.ok).toBe(false);
  });
});

describe("buildEmbeddingText", () => {
  it("is deterministic for the same parsed profile", () => {
    const parsed = {
      headline: "Senior PM",
      about: "I build products",
      experience: [
        { title: "PM", company: "Acme", bullets: ["shipped X", "grew Y"] },
      ],
    };
    expect(buildEmbeddingText(parsed)).toBe(buildEmbeddingText(parsed));
  });

  it("includes headline, about, and experience bullets", () => {
    const text = buildEmbeddingText({
      headline: "Senior PM at Figma",
      about: "I turn problems into products",
      experience: [
        { title: "PM", company: "Figma", bullets: ["Led FigJam launch"] },
      ],
    });
    expect(text).toContain("Senior PM at Figma");
    expect(text).toContain("I turn problems into products");
    expect(text).toContain("Led FigJam launch");
    expect(text).toContain("Figma");
  });

  it("produces a non-empty string even with empty experience", () => {
    const text = buildEmbeddingText({
      headline: "PM",
      about: "about",
      experience: [],
    });
    expect(text.length).toBeGreaterThan(0);
  });
});
