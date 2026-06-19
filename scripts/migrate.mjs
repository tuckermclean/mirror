// ESM migration runner — executed inside the distroless Node.js container.
// drizzle-orm and postgres are runtime dependencies (not devDependencies)
// and are present in the standalone build's node_modules.
//
// Intentional `console` use (exempt from the AGENTS.md "use src/lib/logger.ts"
// rule): this is a standalone one-shot migration entrypoint run as a Kubernetes
// Job, outside the Next.js app runtime and bundler. It must not import app code
// (no logger, no module-resolution context) — keeping it dependency-light is
// what lets it run on the distroless image with only node + the two runtime
// deps below. Job stdout/stderr is the correct sink for `kubectl logs`.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);
try {
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.log('Migrations complete');
} finally {
  await client.end();
}
