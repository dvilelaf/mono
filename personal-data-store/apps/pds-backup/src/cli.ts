import { dump } from "./dump.js";
import { prune } from "./retention.js";
import { restore } from "./restore.js";

const cmd = process.argv[2];

async function main() {
  if (cmd === "backup") {
    const r = await dump();
    await prune();
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (cmd === "prune") {
    const r = await prune();
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (cmd === "restore") {
    const file = process.argv[3];
    const targetDb = process.argv[4];
    const allowProd = process.argv.includes("--allow-prod");
    if (!file || !targetDb) {
      console.error(
        "usage: tsx src/cli.ts restore <dump-file> <target-db-name> [--allow-prod]",
      );
      process.exit(2);
    }
    await restore({ file, targetDb, allowProdRestore: allowProd });
    console.log("restore: ok");
    return;
  }
  console.error("usage: tsx src/cli.ts <backup|prune|restore>");
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
