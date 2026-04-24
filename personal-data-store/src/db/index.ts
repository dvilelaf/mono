import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

// Defence in depth: if a test runner is active and the DATABASE_URL doesn't
// point at a test database, refuse to connect. The in-test resetDb() guard
// catches most cases; this catches the rest (a test that forgets to call
// resetDb but still writes/deletes, misconfigured CI, etc.).
const underTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
if (underTest) {
  const dbName = new URL(config.databaseUrl).pathname.replace(/^\//, "");
  if (!/test/i.test(dbName) && process.env.ALLOW_RESET_DB !== "1") {
    throw new Error(
      `Refusing to open DB connection from a test context: DATABASE_URL points at "${dbName}", ` +
        `which does not look like a test database. Set DATABASE_URL to a _test DB before running tests.`,
    );
  }
}

const client = postgres(config.databaseUrl);
export const db = drizzle(client, { schema });
export type Database = typeof db;
