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
  },
});
