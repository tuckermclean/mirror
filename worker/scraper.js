/**
 * worker/scraper.js — LinkedIn Tier A Playwright scraper
 *
 * Tier A: the user provides their own li_at session cookie. The worker uses
 * Playwright to load their profile as them, and extracts structured data.
 *
 * Security invariants (CRITICAL):
 *   - The sessionCookie value is NEVER logged.
 *   - The sessionCookie value is NEVER written to disk.
 *   - The browser context (which holds the cookie) is always closed after use.
 *   - Only userId is included in log messages, never the cookie.
 */

import { chromium } from "playwright";
import { log } from "./logger.js";

// ---------------------------------------------------------------------------
// DOM extraction — runs inside the browser (serialisable function)
// ---------------------------------------------------------------------------

/**
 * Extract profile data from the LinkedIn profile page DOM.
 * This function is serialised and executed inside the browser by Playwright.
 * It must be self-contained (no closures over outer variables).
 *
 * @returns {Object} parsed profile fields
 */
function extractProfileFromDom() {
  /**
   * @param {string} selector
   * @param {Element|Document} root
   * @returns {string}
   */
  function getText(selector, root = document) {
    const el = root.querySelector(selector);
    return el ? (el.textContent || "").trim() : "";
  }

  const name = getText("h1") ||
    getText(".text-heading-xlarge") ||
    getText(".pv-text-details__left-panel h1");

  const headline = getText(".text-body-medium.break-words") ||
    getText(".pv-text-details__left-panel .text-body-medium") ||
    getText("[data-generated-suggestion-target='urn:li:fsd_profileHeadline']");

  // About / summary section
  const aboutEl =
    document.querySelector("#about ~ div .visually-hidden") ||
    document.querySelector(".pv-about-section .pv-about__summary-text") ||
    document.querySelector("[data-generated-suggestion-target='urn:li:fsd_profileSummary'] span");
  const about = aboutEl ? (aboutEl.textContent || "").trim() : "";

  // Experience section
  const experienceItems = [];
  const expSection = document.querySelector("#experience");
  if (expSection) {
    const expParent = expSection.closest("section") ||
      expSection.parentElement?.parentElement?.parentElement;
    if (expParent) {
      const items = expParent.querySelectorAll("li.artdeco-list__item, li[data-view-name]");
      items.forEach((item) => {
        const title = getText(".t-bold span[aria-hidden='true']", item) ||
          getText(".mr1.t-bold span[aria-hidden='true']", item) ||
          getText(".pv-entity__secondary-title", item) ||
          getText("span[aria-hidden='true']", item);
        const company = getText(".t-14.t-normal span[aria-hidden='true']", item) ||
          getText(".pv-entity__secondary-title", item) ||
          getText(".t-normal.t-black--light span[aria-hidden='true']", item);
        const dates = getText(".t-14.t-normal.t-black--light span[aria-hidden='true']", item) ||
          getText(".pv-entity__dates span[aria-hidden='true']", item);
        const bulletEls = item.querySelectorAll(".pvs-list__item--no-padding-in-columns span[aria-hidden='true']");
        const bullets = Array.from(bulletEls)
          .map((b) => (b.textContent || "").trim())
          .filter((b) => b.length > 0);
        if (title || company) {
          experienceItems.push({ title, company, dates, bullets });
        }
      });
    }
  }

  // Skills section
  const skills = [];
  const skillSection = document.querySelector("#skills");
  if (skillSection) {
    const skillParent = skillSection.closest("section") ||
      skillSection.parentElement?.parentElement?.parentElement;
    if (skillParent) {
      const skillEls = skillParent.querySelectorAll(".t-bold span[aria-hidden='true']");
      skillEls.forEach((el) => {
        const skill = (el.textContent || "").trim();
        if (skill) skills.push(skill);
      });
    }
  }

  return { name, headline, about, experience: experienceItems, skills };
}

// ---------------------------------------------------------------------------
// Main scraper function
// ---------------------------------------------------------------------------

/**
 * Scrape a LinkedIn profile given a profile URL and decrypted session cookie.
 *
 * @param {string} profileUrl    full LinkedIn profile URL
 * @param {string} sessionCookie decrypted li_at cookie value (NEVER log this)
 * @returns {Promise<{name: string, headline: string, about: string, experience: Array, skills: Array}>}
 * @throws if the page fails to load or returns an auth error
 */
export async function scrapeLinkedInProfile(profileUrl, sessionCookie) {
  // Extract userId from URL for logging — never log the cookie
  const profileSlug = profileUrl.split("/in/").pop()?.split("/")[0] ?? "unknown";

  log("info", "[scraper] starting profile scrape", { profileSlug });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  let context = null;
  try {
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });

    // Set the session cookie only when one was provided (Tier A).
    // When sessionCookie is null, skip addCookies entirely — this is the
    // public-browsing path (no authenticated session).
    if (sessionCookie) {
      // Strip "li_at=" prefix if the caller passed a name=value string.
      // Playwright's addCookies expects the token value only, not the header form.
      const cookieValue = sessionCookie.replace(/^li_at=/, "");

      // Set the session cookie — this is the only place it appears in memory
      await context.addCookies([
        {
          name: "li_at",
          value: cookieValue,
          domain: ".linkedin.com",
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "None",
        },
      ]);
    }

    const page = await context.newPage();

    try {
      await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (navErr) {
      throw new Error(
        `[scraper] failed to load profile page "${profileUrl}": ${String(navErr)}`
      );
    }

    // Wait for core profile content to appear
    await page.waitForSelector("h1, .pv-text-details__left-panel", {
      timeout: 15000,
    }).catch(() => {
      // Non-fatal — profile page might use different selectors
    });

    // Extract profile data from the DOM. If both name and headline are empty
    // the page is almost certainly the LinkedIn login page returned because the
    // li_at cookie has expired — surface that as an AuthWallError.
    const parsed = await page.evaluate(extractProfileFromDom);
    if (!parsed.name && !parsed.headline) {
      throw new AuthWallError();
    }

    await page.close();
    log("info", "[scraper] profile scrape complete", { profileSlug });

    return parsed;
  } finally {
    // Always close context to ensure cookie is removed from memory
    if (context) {
      await context.close().catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
  }
}

/**
 * Thrown when LinkedIn redirects to the login page instead of the profile.
 * Indicates the li_at session cookie has expired or is invalid.
 */
export class AuthWallError extends Error {
  constructor() {
    super(
      "[scraper] authentication wall detected — li_at cookie is expired or invalid"
    );
    this.name = "AuthWallError";
  }
}
