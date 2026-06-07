import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | undefined;

function getInstance(): DB {
  if (!_db) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL is required");
    _db = drizzle(postgres(connectionString, { max: 10 }), { schema });
  }
  return _db;
}

// Lazy proxy — throws only when first query is made, not at module import time.
// This allows next build to compile routes without DATABASE_URL present.
export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    const instance = getInstance();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
