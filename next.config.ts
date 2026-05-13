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
};

export default nextConfig;
