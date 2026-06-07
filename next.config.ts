import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  // Ensure prompt markdown files are bundled into the standalone output.
  // readFileSync in src/lib/prompts/index.ts resolves relative to __dirname,
  // which moves to .next/standalone at runtime — these files would be missing
  // without an explicit trace include.
  outputFileTracingIncludes: {
    "/api/chat": ["./src/lib/prompts/**/*"],
  },
  // voyageai bundles @huggingface/transformers → onnxruntime-node which ships
  // native .node binaries; webpack cannot parse them. Mark as server-external
  // so Node.js require() handles them at runtime instead of bundling.
  serverExternalPackages: ["voyageai", "onnxruntime-node", "@huggingface/transformers"],
};

export default nextConfig;
