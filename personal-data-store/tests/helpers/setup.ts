import { db } from "../../src/db/index.js";
import { sql } from "drizzle-orm";

export async function resetDb() {
  // Truncate all tables. Each test file calls this in beforeEach.
  // Tables will be added here as domains are built.
  const tables = await db.execute(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  for (const row of tables) {
    const name = (row as { tablename: string }).tablename;
    if (name === "__drizzle_migrations") continue;
    await db.execute(sql.raw(`TRUNCATE TABLE "${name}" CASCADE`));
  }
}
