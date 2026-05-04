import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../src/db/index.js";
import { financialAccounts } from "../src/domains/finance/finance.schema.js";
import { eq, and } from "drizzle-orm";
import { importCsv } from "../src/domains/finance/finance.service.js";

async function ensureAccount(institution: string, accountName: string, currency: string, accountType = "checking") {
  const existing = await db
    .select()
    .from(financialAccounts)
    .where(and(eq(financialAccounts.institution, institution), eq(financialAccounts.accountName, accountName)));
  if (existing.length) return existing[0].id;
  const [created] = await db
    .insert(financialAccounts)
    .values({ institution, accountName, accountType, currency })
    .returning({ id: financialAccounts.id });
  return created.id;
}

async function importFile(accountId: string, path: string, institutionHint?: string) {
  const csv = readFileSync(path, "utf-8");
  const result = await importCsv(accountId, csv, institutionHint);
  console.log(`  ${path.split("/").pop()}: imported ${result.imported}/${result.total}`);
}

async function main() {
  const revolutId = await ensureAccount("revolut", "Revolut Personal", "GBP");
  const wiseGbpId = await ensureAccount("wise", "Wise Business GBP", "GBP");
  const wiseEurId = await ensureAccount("wise", "Wise Business EUR", "EUR");
  const wiseUsdId = await ensureAccount("wise", "Wise Business USD", "USD");

  console.log("Revolut Personal:");
  await importFile(revolutId, "/Users/gcd/Downloads/account-statement_2017-11-11_2026-04-08_en-gb_eaca31.csv", "revolut");

  console.log("\nWise:");
  await importFile(wiseGbpId, "/Users/gcd/Downloads/statement_2023-05-13_2026-04-08_csv/statement_57445023_GBP_2023-05-13_2026-04-08.csv", "wise");
  await importFile(wiseEurId, "/Users/gcd/Downloads/statement_2023-05-13_2026-04-08_csv/statement_63091391_EUR_2023-05-13_2026-04-08.csv", "wise");
  await importFile(wiseUsdId, "/Users/gcd/Downloads/statement_2023-05-13_2026-04-08_csv/statement_57445024_USD_2023-05-13_2026-04-08.csv", "wise");

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
