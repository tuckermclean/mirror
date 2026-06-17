/**
 * Benchmark corpus parser/loader.
 *
 * Two ingest paths produce the same `BenchmarkParsedProfile`:
 *   1. LinkedIn public-profile HTML fixtures (data-testid markup) → parsed via
 *      dependency-free regex extraction (no cheerio/jsdom in the dep tree).
 *   2. Curated JSON fixtures (`fixtures/benchmark-profiles/*.json`) → validated
 *      with zod into full collectible profiles.
 *
 * All functions return a typed `Result` (AGENTS.md: no naked throws in lib).
 */
import { z } from "zod";
import { ParseError, type Result } from "@/lib/errors";
import type {
  BenchmarkExperience,
  BenchmarkFixtureProfile,
  BenchmarkParsedProfile,
} from "@/lib/benchmark/types";

const ok = <T>(value: T): Result<T, ParseError> => ({ ok: true, value });
const err = (message: string): Result<never, ParseError> => ({
  ok: false,
  error: new ParseError(message),
});

// ---------------------------------------------------------------------------
// HTML parsing (dependency-free)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the small set of HTML entities that appear in profile text. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** Strip tags, collapse whitespace, and decode entities. */
function clean(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Inner text of the first element matching attribute `attr="value"`.
 *
 * IMPORTANT: `attr` and `value` must be string literals from controlled call
 * sites (e.g. "data-testid", "profile-headline"). They are interpolated
 * directly into a RegExp without escaping — passing user-supplied strings
 * would introduce a ReDoS vector if callers change.
 */
function firstByAttr(html: string, attr: string, value: string): string | null {
  const re = new RegExp(`${attr}="${value}"[^>]*>([\\s\\S]*?)<\\/`, "i");
  const m = re.exec(html);
  return m ? clean(m[1] ?? "") : null;
}

/**
 * Inner text of the first element whose class list contains `cls`.
 *
 * IMPORTANT: `cls` must be a string literal from a controlled call site
 * (e.g. "top-card-layout__headline"). It is interpolated directly into a
 * RegExp without escaping — passing user-supplied strings would introduce a
 * ReDoS vector if callers change.
 */
function firstByClass(html: string, cls: string): string | null {
  const re = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/`, "i");
  const m = re.exec(html);
  return m ? clean(m[1] ?? "") : null;
}

/** All outer-markup blocks whose class list contains `cls`. */
function blocksByClass(html: string, cls: string): string[] {
  const re = new RegExp(
    `<div[^>]*class="[^"]*\\b${cls}\\b[^"]*"[\\s\\S]*?<\\/div>\\s*<\\/(?:div|li)>`,
    "gi"
  );
  return html.match(re) ?? [];
}

/** Split an HTML `<ul><li>` description into one bullet per `<li>`. */
function listToBullets(descriptionHtml: string | null): string[] {
  if (!descriptionHtml) return [];
  const items = descriptionHtml.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  if (items && items.length > 0) {
    return items.map((li) => clean(li)).filter(Boolean);
  }
  const text = clean(descriptionHtml);
  return text ? [text] : [];
}

/** Parse a data-testid experience block (profile-fixture.html style). */
function parseTestIdExperience(block: string): BenchmarkExperience {
  return {
    title: firstByAttr(block, "data-testid", "exp-title") ?? "",
    company: firstByAttr(block, "data-testid", "exp-company") ?? "",
    bullets: listToBullets(rawByTestId(block, "exp-description")),
  };
}

/** Parse a class-based experience block (seed-profile.html style). */
function parseClassExperience(block: string): BenchmarkExperience {
  return {
    title: firstByClass(block, "experience-item__title") ?? "",
    company: firstByClass(block, "experience-item__subtitle") ?? "",
    bullets: listToBullets(rawByClass(block, "experience-item__description")),
  };
}

/** Inner RAW html (tags preserved) of the first data-testid match. */
function rawByTestId(html: string, id: string): string | null {
  const re = new RegExp(`data-testid="${id}"[^>]*>([\\s\\S]*?)<\\/div>`, "i");
  const m = re.exec(html);
  return m ? (m[1] ?? "") : null;
}

/** Inner RAW html (tags preserved) of the first class match. */
function rawByClass(html: string, cls: string): string | null {
  const re = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, "i");
  const m = re.exec(html);
  return m ? (m[1] ?? "") : null;
}

/**
 * Parse a LinkedIn public-profile HTML fixture into structured content.
 * Supports both the data-testid markup (profile-fixture.html) and the
 * class-based markup (seed-profile.html). Returns ParseError when neither a
 * headline nor any experience can be found.
 */
export function parseLinkedInProfileHtml(
  html: string
): Result<BenchmarkParsedProfile, ParseError> {
  const headline =
    firstByAttr(html, "data-testid", "profile-headline") ??
    firstByClass(html, "top-card-layout__headline") ??
    "";
  const about =
    firstByAttr(html, "data-testid", "about-text") ??
    firstByClass(html, "inline-show-more-text") ??
    "";

  const testIdBlocks = html.match(
    /data-testid="experience-item"[\s\S]*?<\/div>\s*<\/div>/gi
  );
  const experience =
    testIdBlocks && testIdBlocks.length > 0
      ? testIdBlocks.map(parseTestIdExperience)
      : blocksByClass(html, "experience-item").map(parseClassExperience);

  if (!headline && experience.length === 0) {
    return err("no LinkedIn profile markup found (missing headline and experience)");
  }
  return ok({ headline, about, experience });
}

// ---------------------------------------------------------------------------
// JSON fixture validation
// ---------------------------------------------------------------------------

const experienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  bullets: z.array(z.string()).default([]),
});

const recordSchema = z.object({
  id: z.string().min(1).optional(),
  industry: z.string().min(1),
  role: z.string().min(1),
  seniority: z.string().min(1),
  // publicUrl is optional in curated fixtures; when absent we synthesize a
  // stable URL from `id` so the NOT NULL `public_url` column is satisfied and
  // idempotency keys off a deterministic value.
  publicUrl: z.string().url().optional(),
  headline: z.string().min(1),
  about: z.string().default(""),
  experience: z.array(experienceSchema).default([]),
  performanceSignals: z
    .object({
      profileViews: z.number().optional(),
      recruiterMessages: z.number().optional(),
      searchAppearances: z.number().optional(),
      postImpressions: z.number().optional(),
    })
    .nullable()
    .optional(),
});

/** Validate and normalize one raw fixture record into a collectible profile. */
export function parseBenchmarkRecord(
  record: unknown
): Result<BenchmarkFixtureProfile, ParseError> {
  const parsed = recordSchema.safeParse(record);
  if (!parsed.success) {
    return err(`invalid benchmark record: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`);
  }
  const d = parsed.data;
  const publicUrl = d.publicUrl ?? (d.id ? `https://linkedin.test/in/${d.id}` : undefined);
  if (!publicUrl) {
    return err("benchmark record requires either publicUrl or id");
  }
  return ok({
    industry: d.industry,
    role: d.role,
    seniority: d.seniority,
    publicUrl,
    parsed: {
      headline: d.headline,
      about: d.about,
      experience: d.experience.map((e) => ({
        title: e.title,
        company: e.company,
        ...(e.startDate !== undefined ? { startDate: e.startDate } : {}),
        endDate: e.endDate ?? null,
        bullets: e.bullets,
      })),
    },
    performanceSignals: d.performanceSignals ?? null,
  });
}

/** Load and validate an entire JSON fixture file (array of records). */
export function loadBenchmarkFixtures(
  jsonText: string
): Result<BenchmarkFixtureProfile[], ParseError> {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return err("benchmark fixture is not valid JSON");
  }
  if (!Array.isArray(raw)) {
    return err("benchmark fixture must be a JSON array of records");
  }
  const out: BenchmarkFixtureProfile[] = [];
  for (const rec of raw) {
    const res = parseBenchmarkRecord(rec);
    if (!res.ok) return res;
    out.push(res.value);
  }
  return ok(out);
}

// ---------------------------------------------------------------------------
// Embedding text
// ---------------------------------------------------------------------------

/**
 * Deterministically render a parsed profile into the text we embed. Order is
 * fixed (headline → about → per-experience title/company/bullets) so the same
 * profile always yields the same vector input.
 */
export function buildEmbeddingText(parsed: BenchmarkParsedProfile): string {
  const expText = parsed.experience
    .map((e) => [`${e.title} @ ${e.company}`, ...e.bullets].join("\n"))
    .join("\n\n");
  return [parsed.headline, parsed.about, expText].filter(Boolean).join("\n\n");
}
