import { db } from "../../src/db/index.js";
import { sql } from "drizzle-orm";

export async function resetDb() {
  // GUARD — refuse to truncate unless the DB is clearly a test DB.
  // Accidentally running `npm test` against prod has already wiped data once.
  const [dbRow] = await db.execute(sql`SELECT current_database() AS name`);
  const dbName = (dbRow as { name: string })?.name ?? "";
  const looksLikeTest = /test/i.test(dbName) || dbName.endsWith("_test");
  const override = process.env.ALLOW_RESET_DB === "1";
  if (!looksLikeTest && !override) {
    throw new Error(
      `resetDb() refused: current database "${dbName}" does not look like a test DB. ` +
        `Point DATABASE_URL at a database whose name contains "test" (e.g. personal_data_store_test), ` +
        `or set ALLOW_RESET_DB=1 to override (NOT recommended — will TRUNCATE all tables).`,
    );
  }

  const tables = await db.execute(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  for (const row of tables) {
    const name = (row as { tablename: string }).tablename;
    if (name === "__drizzle_migrations") continue;
    await db.execute(sql.raw(`TRUNCATE TABLE "${name}" CASCADE`));
  }
}
