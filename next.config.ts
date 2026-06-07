import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  // Ensure prompt markdown files are bundled into the standalone output.
  // readFileSync in src/lib/prompts/index.ts resolves relative to __dirname,
  // which moves to .next/standalone at runtime — these files would be missing
  // without an explicit trace include.
  outputFileTracingIncludes: {
    "/api/chat":    ["./src/lib/prompts/**/*"],
    "/api/inngest": ["./src/lib/prompts/**/*"],
  },
  // Prevent webpack from bundling voyageai and its transitive dependencies.
  // voyageai's ESM extended client imports @huggingface/transformers via a
  // dynamic import() which webpack follows into onnxruntime-node's native
  // binary files, causing "Module parse failed" for .node binaries.
  //
  // Adding voyageai here makes webpack emit require('voyageai') instead of
  // bundling it. Node.js resolves this through voyageai's CJS build
  // (package.json "type": "commonjs", main: dist/cjs/extended/index.js).
  // CJS require() handles directory imports (require('./api') → ./api/index.js)
  // unlike the ESM loader, so ERR_UNSUPPORTED_DIR_IMPORT is not a concern here.
  //
  // For Vitest, voyageai is still inlined (see vitest.config.ts server.deps.inline)
  // so that Vite's bundler resolves its ESM directory imports during test runs.
  serverExternalPackages: ["voyageai", "onnxruntime-node", "@huggingface/transformers"],
};

export default nextConfig;
