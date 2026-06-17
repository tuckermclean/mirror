// Test-only DOM helper for the Plasmo extension unit tests.
//
// The extension's `dom-reader` is a pure function over a standard `Document`.
// These tests run under the extension's own Vitest config, which sets
// `environment: "happy-dom"` — so a spec-compliant global `document` /
// `DOMParser` is already present. We parse fixtures with `DOMParser` rather
// than constructing a `Window` by hand.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, "fixtures/linkedin-pages");

/** Parse an HTML string into a queryable Document. */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** Load a LinkedIn fixture HTML file and parse it into a Document. */
export function loadFixture(name: string): Document {
  const html = readFileSync(join(FIXTURE_DIR, name), "utf8");
  return parseHtml(html);
}

/** The five fixture profiles the DOM reader must handle. */
export const FIXTURES = [
  "profile-fixture.html",
  "seed-profile.html",
  "profile-pm.html",
  "profile-designer.html",
  "profile-minimal.html",
] as const;
