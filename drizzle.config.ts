import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  // `out` is relative to the process CWD. drizzle-kit is always run from the
  // repo root (and the container WORKDIR is /app, where src/db/migrations is
  // copied), so this resolves correctly today. If the CWD/WORKDIR ever changes,
  // this path — and the matching ./src/db/migrations in scripts/migrate.mjs —
  // must be updated together.
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "",
  },
} satisfies Config;
