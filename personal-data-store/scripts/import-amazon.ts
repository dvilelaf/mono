import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../src/db/index.js";
import { transactions, financialAccounts } from "../src/domains/finance/finance.schema.js";
import { eq } from "drizzle-orm";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/import-amazon.ts <Order History.csv>");
    process.exit(1);
  }

  // Find or create Amazon account
  let [account] = await db.select().from(financialAccounts).where(eq(financialAccounts.institution, "amazon"));
  if (!account) {
    [account] = await db.insert(financialAccounts).values({
      institution: "amazon",
      accountName: "Amazon UK",
      accountType: "shopping",
      currency: "GBP",
    }).returning();
    console.log(`Created Amazon account: ${account.id}`);
  }

  const lines = readFileSync(filePath, "utf-8").split("\n");
  const header = parseCsvLine(lines[0]);
  const idx: Record<string, number> = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });

  console.log(`Columns: ${header.length}, Rows: ${lines.length - 1}`);

  let imported = 0;
  let skipped = 0;
  const batch: {
    accountId: string; date: string; description: string; amount: string;
    currency: string; source: string; sourceRef: string;
    category: string; metadata: Record<string, string>;
  }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    const orderId = fields[idx["Order ID"]]?.trim();
    const orderDate = fields[idx["Order Date"]]?.trim();
    const productName = fields[idx["Product Name"]]?.trim();
    const totalAmount = fields[idx["Total Amount"]]?.trim();
    const unitPrice = fields[idx["Unit Price"]]?.trim();
    const currency = fields[idx["Currency"]]?.trim() || "GBP";
    const status = fields[idx["Order Status"]]?.trim();
    const asin = fields[idx["ASIN"]]?.trim();
    const quantity = fields[idx["Original Quantity"]]?.trim();

    if (!orderDate || !productName || productName === "Not Available") continue;
    if (status === "Cancelled") { skipped++; continue; }

    const date = orderDate.slice(0, 10);
    const amount = totalAmount || unitPrice || "0";
    if (Number(amount) === 0) { skipped++; continue; }

    const sourceRef = `amazon:${orderId}:${asin}`;

    batch.push({
      accountId: account.id,
      date,
      description: productName.slice(0, 300),
      amount: `-${amount}`,
      currency,
      source: "amazon_export",
      sourceRef: sourceRef.slice(0, 200),
      category: "shopping",
      metadata: {
        orderId: orderId || "",
        asin: asin || "",
        quantity: quantity || "1",
        status: status || "",
        productName: productName || "",
      },
    });
  }

  // Batch insert
  const batchSize = 100;
  for (let i = 0; i < batch.length; i += batchSize) {
    const chunk = batch.slice(i, i + batchSize);
    const result = await db.insert(transactions).values(chunk).onConflictDoNothing().returning({ id: transactions.id });
    imported += result.length;
    skipped += chunk.length - result.length;
  }

  console.log(`Done: ${imported} imported, ${skipped} skipped`);
  process.exit(0);
}

main();
