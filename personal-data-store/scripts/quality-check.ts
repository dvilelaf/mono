import "dotenv/config";
import { db } from "../src/db/index.js";
import { sql } from "drizzle-orm";
import { semanticSearch } from "../src/domains/documents/documents.service.js";

async function main() {
  const count = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM documents WHERE type = 'file'`,
  );
  console.log("=== Document count (type=file) ===");
  console.log(count.rows ?? count);

  // skip listing docs in this run

  const emb = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM embeddings
    WHERE document_id IN (SELECT id FROM documents WHERE type = 'file')
  `);
  console.log("\n=== Embedding count ===");
  console.log(emb.rows ?? emb);

  const queries = [
    "crypto tax treatment stablecoins",
    "CountDefi report feedback",
    "RUNE profit loss calculation",
    "health insurance medical",
    "property rental",
    "invoice payment",
  ];

  for (const q of queries) {
    console.log(`\n=== Search: ${q} ===`);
    const r = await semanticSearch(q, 3, { fileOnly: true });
    console.log(JSON.stringify(r, null, 2));
  }

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
