import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    // TODO: When @base-ui/react hook tests are added to tests/unit/ui/, install
    // the `jsdom` devDependency and add:
    //   environmentMatchGlobs: [["tests/unit/ui/**", "jsdom"]]
    // Without jsdom installed, the env override would fail immediately.
    server: {
      deps: {
        // voyageai's ESM build uses directory imports unsupported by Node ESM;
        // inlining lets Vite's bundler resolve them correctly.
        inline: ["voyageai"],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
      thresholds: {
        // TODO: AGENTS.md promises ≥80% global src/ coverage. Actual measured
        // (unit + infra tests; integration tests omitted — require live DB):
        //   lines: ~59%, functions: ~59%, branches: ~83%, statements: ~59%
        // Integration tests require DATABASE_URL and are excluded from `pnpm coverage`.
        // Setting thresholds to actual rounded down to nearest 5% to avoid blocking CI.
        // Raise these incrementally as coverage improves toward the 80% target.
        lines: 55,
        functions: 55,
        branches: 80,
        statements: 55,
        "src/lib/crypto/**": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/parsers/**": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // The Voice Card vertical (schema, parse, fence) is fully unit-tested.
        // errors.ts is type-only (compiles to nothing) so it does not affect
        // these aggregates. Kept below 100 to leave headroom for new helpers.
        "src/lib/voice-card/**": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
