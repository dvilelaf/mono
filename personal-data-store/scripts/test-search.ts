import "dotenv/config";
import { semanticSearch } from "../src/domains/documents/documents.service.js";

async function main() {
  const query = process.argv[2] ?? "crypto tax treatment stablecoins";
  const r = await semanticSearch(query, 5, { fileOnly: true });
  console.log(`Query: ${query}`);
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}
main();
