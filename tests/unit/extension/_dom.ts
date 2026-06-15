// Test-only DOM helper for the Plasmo extension unit tests.
//
// The extension's `dom-reader` is a pure function over a standard `Document`.
// The root Vitest config runs in the `node` environment with no DOM library
// installed at the repo root, and the assignment forbids touching the root
// package.json / lockfile. happy-dom is therefore declared as a devDependency
// of the *extension* package and resolved here via its concrete path inside
// `extension/node_modules`. This keeps the root quality gates untouched while
// still giving these tests a real, spec-compliant DOM to parse fixtures with.
//
// eslint is configured to ignore `extension/**`; this file lives under tests/
// and is intentionally excluded from `tsconfig.build.json` (src-only).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// happy-dom is a devDependency of the *extension* package; it is resolved here
// at runtime via its concrete path inside extension/node_modules so the root
// package.json / lockfile stay untouched (per the assignment constraints).
import { Window } from "../../../extension/node_modules/happy-dom/lib/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, "../../../fixtures/linkedin-pages");

/** Parse an HTML string into a queryable Document. */
export function parseHtml(html: string): Document {
  const win = new Window({ url: "https://www.linkedin.com/in/test/" });
  win.document.documentElement.innerHTML = html;
  // happy-dom's Document is structurally a standard DOM Document for our use.
  return win.document as unknown as Document;
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
