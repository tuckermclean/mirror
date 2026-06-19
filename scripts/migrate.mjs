// Standalone k8s migration job — console.log is intentional here (no logger available).
// ESM migration runner — executed inside the distroless Node.js container.
// drizzle-orm and postgres are runtime dependencies (not devDependencies)
// and are present in the standalone build's node_modules.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);
try {
  // Use an absolute path derived from this file's location so the script works
  // regardless of the process working directory (relative paths silently break
  // when the container WORKDIR differs from the project root).
  const migrationsFolder = new URL('./src/db/migrations', import.meta.url).pathname;
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete');
} finally {
  await client.end();
}
