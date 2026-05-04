import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index.js";

async function main() {
  const bad = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM documents WHERE type='file'
      AND (summary LIKE '%I can see%' OR summary LIKE '%I misread%'
           OR summary LIKE '%Could you provide%' OR summary LIKE '%Let me%')
  `)) as unknown as Array<{ n: number }>;
  const total = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM documents WHERE type='file'
  `)) as unknown as Array<{ n: number }>;
  console.log(`bad=${bad[0].n} total=${total[0].n} good=${total[0].n - bad[0].n}`);
  process.exit(0);
}
main();
