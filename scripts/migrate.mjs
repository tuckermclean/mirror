// ESM migration runner — executed inside the distroless Node.js container.
// drizzle-orm and postgres are runtime dependencies (not devDependencies)
// and are present in the standalone build's node_modules.
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
