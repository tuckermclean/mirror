// ESM migration runner — executed inside the distroless Node.js container.
// drizzle-orm and postgres are runtime dependencies (not devDependencies)
// and are present in the standalone build's node_modules.

// standalone k8s Job — logger not available without full app init
import path from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Resolve the migrations folder relative to this script file so the path
// remains correct regardless of the process working directory or WORKDIR.
const migrationsFolder = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  'src/db/migrations'
);

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client);
try {
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete');
} finally {
  await client.end();
}
