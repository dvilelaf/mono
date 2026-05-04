import "dotenv/config";
import { hybridSearch } from "../src/domains/documents/search-v2.js";

async function main() {
  const query = process.argv.slice(2).join(" ") || "crypto tax stablecoins";
  console.log(`query: ${query}\n`);
  const hits = await hybridSearch(query, 10);
  for (const h of hits) {
    console.log(
      `score=${h.combinedScore.toFixed(3)} vec=${h.vectorScore?.toFixed(3) ?? "—"} kw=${h.keywordScore?.toFixed(3) ?? "—"} chunk=${h.chunkIndex}${h.pageNumber ? `/p${h.pageNumber}` : ""} :: ${h.title}`,
    );
    console.log(`  ${h.filePath}`);
    console.log(`  ${h.text.slice(0, 200).replace(/\s+/g, " ")}…`);
    console.log();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
