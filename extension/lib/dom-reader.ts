/**
 * dom-reader — parse a live LinkedIn profile DOM into structured fields.
 *
 * Pure function over a `Document` or `Element` so it is unit-testable against
 * fixture HTML. LinkedIn ships (at least) two materially different DOMs:
 *   1. The authenticated app view: `pv-top-card`, `pv-profile-section`,
 *      with `data-testid` hooks on the fixtures.
 *   2. The public / SEO view: `top-card-layout__*`, `core-section-container`,
 *      `experience-item__*`.
 * The reader probes for both and falls back gracefully, returning empty strings
 * / arrays rather than throwing when a section is absent — a profile with no
 * About is valid input, not an error.
 */

export interface ExperienceEntry {
  title: string;
  company: string;
  bullets: string[];
}

export interface ProfileFields {
  headline: string;
  about: string;
  experience: ExperienceEntry[];
}

type Root = Document | Element;

/** Collapse runs of whitespace and trim; decodes entities via textContent. */
function clean(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/** First matching element's cleaned textContent, or "". */
function textOf(root: Root, selectors: string[]): string {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return clean(el.textContent);
  }
  return "";
}

const HEADLINE_SELECTORS = [
  '[data-testid="profile-headline"]',
  ".top-card-layout__headline",
  ".pv-top-card .text-body-medium",
];

const ABOUT_SELECTORS = [
  '[data-testid="about-text"]',
  '[data-section="summary"] .core-section-container__content',
  '#about .about-text',
];

function readHeadline(root: Root): string {
  return textOf(root, HEADLINE_SELECTORS);
}

function readAbout(root: Root): string {
  // For the public variant the About body lives in <p> blocks; join them with
  // blank lines so paragraph structure survives. For the app variant the text
  // is a single node and `clean` collapses it.
  const container =
    root.querySelector('[data-section="summary"] .core-section-container__content') ??
    root.querySelector('[data-testid="about-text"]') ??
    root.querySelector("#about .about-text");
  if (!container) return "";
  const paragraphs = Array.from(container.querySelectorAll("p"));
  if (paragraphs.length > 0) {
    return paragraphs.map((p) => clean(p.textContent)).filter(Boolean).join("\n\n");
  }
  return clean(container.textContent);
}

/** Strip LinkedIn's "· Full-time" / "· Contract" employment-type suffix. */
function stripCompanySuffix(raw: string): string {
  return clean(raw.split("·")[0]);
}

function readBullets(item: Element): string[] {
  const listItems = Array.from(item.querySelectorAll("ul li"));
  if (listItems.length > 0) {
    return listItems.map((li) => clean(li.textContent)).filter(Boolean);
  }
  const description = item.querySelector(
    '[data-testid="exp-description"], .exp-description, .experience-item__description',
  );
  const text = clean(description?.textContent);
  return text ? [text] : [];
}

function readExperienceItem(item: Element): ExperienceEntry | null {
  const title = textOf(item, [
    '[data-testid="exp-title"]',
    ".experience-item__title",
    ".exp-title",
  ]);
  const company = stripCompanySuffix(
    textOf(item, [
      '[data-testid="exp-company"]',
      ".experience-item__subtitle",
      ".exp-company",
    ]),
  );
  if (!title || !company) return null;
  return { title, company, bullets: readBullets(item) };
}

const EXPERIENCE_ITEM_SELECTORS = [
  '[data-testid="experience-item"]',
  '[data-section="experience"] .experience-item',
  ".experience-section .experience-item",
];

function readExperience(root: Root): ExperienceEntry[] {
  let items: Element[] = [];
  for (const sel of EXPERIENCE_ITEM_SELECTORS) {
    items = Array.from(root.querySelectorAll(sel));
    if (items.length > 0) break;
  }
  return items
    .map(readExperienceItem)
    .filter((e): e is ExperienceEntry => e !== null);
}

/** Parse a LinkedIn profile DOM into structured fields. */
export function readProfile(root: Root): ProfileFields {
  return {
    headline: readHeadline(root),
    about: readAbout(root),
    experience: readExperience(root),
  };
}

/**
 * Concatenate the structured fields into the `profileText` blob consumed by
 * `POST /api/extension/voice-match`.
 */
export function profileToText(profile: ProfileFields): string {
  const parts: string[] = [];
  if (profile.headline) parts.push(profile.headline);
  if (profile.about) parts.push(profile.about);
  for (const exp of profile.experience) {
    parts.push(`${exp.title} — ${exp.company}`);
    for (const bullet of exp.bullets) parts.push(bullet);
  }
  return parts.join("\n");
}
