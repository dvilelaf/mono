import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../src/db/index.js";
import { wallets } from "../src/domains/finance/finance.schema.js";

const EXCHANGES = new Set(["Binance", "Coinbase", "Coinbase Pro", "Coinlist", "FTX", "Kraken", "Kucoin", "MEXC", "Nexo"]);

function normalizeChain(chain: string): string {
  const map: Record<string, string> = {
    "Binance Smart Chain": "bsc",
    "Binance Relay Chain": "bnb",
    "Cosmos Hub": "cosmos",
    "Secret Network": "secret",
    "Harmony One": "harmony",
    "Terra (new)": "terra2",
    "Terra Classic": "terra_classic",
    "Gnosis Chain": "gnosis",
    "Solana (FTX)": "solana",
    "FTX wallet on Ethereum?": "ethereum",
    "Multi": "multi",
  };
  return map[chain] || chain.toLowerCase();
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/import-wallets.ts <path-to-csv>");
    process.exit(1);
  }

  const lines = readFileSync(filePath, "utf-8").split("\n").filter(l => l.trim());
  const rows = lines.slice(1); // skip header

  // Dedupe by lowercase address + chain
  const seen = new Set<string>();
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const [address, ...chainParts] = row.split(",");
    const chain = chainParts.join(",").trim();
    if (!address || !chain) continue;

    const key = `${address.toLowerCase()}|${normalizeChain(chain)}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);

    const isExchange = EXCHANGES.has(address);
    const walletType = isExchange ? "exchange" : "onchain";

    try {
      const inserted = await db.insert(wallets).values({
        address: address.trim(),
        chain: normalizeChain(chain),
        walletType,
        label: isExchange ? address : null,
      }).onConflictDoNothing().returning({ id: wallets.id });

      if (inserted.length) imported++;
      else skipped++;
    } catch (err) {
      console.error(`  Failed: ${address} ${chain}: ${(err as Error).message}`);
      skipped++;
    }
  }

  console.log(`Done: ${imported} wallets imported, ${skipped} skipped/duplicates`);
  process.exit(0);
}

main();
