import { defineConfig } from "vitest/config";

// The extension is its own pnpm package with its own test runner. It is
// deliberately NOT wired into the repo-root Vitest config: `pnpm test:unit`
// at the root must pass without installing the extension's dependencies.
//
// `environment: "happy-dom"` gives the DOM-reader and assisted-write tests a
// real, spec-compliant `document` / `DOMParser` / events implementation, so the
// fixtures parse and `input` events dispatch exactly as they would in a browser.
export default defineConfig({
  esbuild: {
    // Use the automatic JSX runtime so .tsx files don't require `import React`.
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/**/*.spec.ts", "tests/**/*.spec.tsx"],
  },
});
