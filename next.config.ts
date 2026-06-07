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
  // onnxruntime-node ships native .node binaries that webpack cannot parse.
  // voyageai is intentionally NOT listed here: webpack must bundle it so that
  // its internal directory imports (import './api') are resolved by webpack's
  // enhanced-resolve rather than the Node.js ESM resolver, which rejects
  // directory imports with ERR_UNSUPPORTED_DIR_IMPORT.
  serverExternalPackages: ["onnxruntime-node", "@huggingface/transformers"],
};

export default nextConfig;
