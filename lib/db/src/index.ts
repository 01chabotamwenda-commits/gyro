import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// DATABASE_URL is optional — the app runs in offline / in-memory mode when absent.
// Routes that use `db` must catch errors or check `if (!db)` and fall back to the
// in-memory store in artifacts/api-server/src/lib/mem-store.ts.
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

// Type assertion keeps existing route code compiling without changes.
// At runtime `db` is null when DATABASE_URL is absent; routes use try/catch.
export const db = pool
  ? drizzle(pool, { schema })
  : (null as unknown as ReturnType<typeof drizzle<typeof schema>>);

export * from "./schema";
