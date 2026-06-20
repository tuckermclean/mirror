// ESM migration runner — executed inside the distroless Node.js container.
// drizzle-orm and postgres are runtime dependencies (not devDependencies)
// and are present in the standalone build's node_modules.
//
// This is a standalone Kubernetes Job script, NOT part of the Next.js app
// runtime. It runs in a distroless image with no access to the app's module
// graph, so importing src/lib/logger.ts is not available here. AGENTS.md's
// "no console.log" rule targets production app code (which should use the
// structured logger); console is a reasonable sink for a one-shot Job whose
// output is captured by kubectl.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolve the migrations folder relative to THIS script's location rather than
// the process CWD. The image happens to set WORKDIR /app (so ./src/db/...
// would also work today), but anchoring to import.meta.url keeps this correct
// if the WORKDIR, mount path, or invocation directory ever changes.
// Layout in the image: /app/scripts/migrate.mjs and /app/src/db/migrations.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(scriptDir, '../src/db/migrations');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);
try {
  await migrate(db, { migrationsFolder });
  console.info('Migrations complete');
} finally {
  await client.end();
}
