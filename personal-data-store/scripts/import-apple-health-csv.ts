import "dotenv/config";
import { readFileSync } from "fs";
import { db } from "../src/db/index.js";
import { healthMetrics } from "../src/domains/health/health.schema.js";

const SOURCE = "apple_health";

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split("\n").filter(l => l.trim());
  const headers = lines[0].split(",");
  const rows = lines.slice(1).map(line => line.split(","));
  return { headers, rows };
}

function parseColumnName(header: string): { name: string; unit: string } | null {
  // Format: "Active Energy (kJ)" or "Blood Pressure [Systolic] (mmHg)"
  const match = header.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) return null;
  let name = match[1].trim();
  const unit = match[2].trim();
  // Normalize name to snake_case
  name = name
    .replace(/\[([^\]]+)\]/g, "_$1") // Blood Pressure [Systolic] -> Blood Pressure _Systolic
    .replace(/[+]/g, "and")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
  return { name, unit };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/import-apple-health-csv.ts <path-to-csv>");
    process.exit(1);
  }

  console.log(`Reading ${filePath}...`);
  const text = readFileSync(filePath, "utf-8");
  const { headers, rows } = parseCSV(text);

  console.log(`${headers.length} columns, ${rows.length} rows`);

  // Parse column metadata (skip Date/Time at index 0)
  const columns: { index: number; name: string; unit: string }[] = [];
  for (let i = 1; i < headers.length; i++) {
    const parsed = parseColumnName(headers[i]);
    if (parsed) columns.push({ index: i, ...parsed });
  }
  console.log(`${columns.length} metric columns identified`);

  let imported = 0;
  let skipped = 0;

  // Batch inserts per row
  for (const row of rows) {
    const dateStr = row[0]?.trim();
    if (!dateStr) continue;
    const recordedAt = new Date(dateStr);

    const values: { source: string; metricType: string; value: string; unit: string; recordedAt: Date }[] = [];

    for (const col of columns) {
      const raw = row[col.index]?.trim();
      if (!raw || raw === "") continue;
      const num = parseFloat(raw);
      if (isNaN(num)) continue;

      values.push({
        source: SOURCE,
        metricType: col.name,
        value: String(num),
        unit: col.unit,
        recordedAt,
      });
    }

    if (values.length === 0) continue;

    // Insert in chunks to avoid huge queries
    for (const v of values) {
      try {
        const inserted = await db.insert(healthMetrics).values(v)
          .onConflictDoNothing().returning({ id: healthMetrics.id });
        if (inserted.length) imported++;
        else skipped++;
      } catch {
        skipped++;
      }
    }
  }

  console.log(`\nDone: ${imported} imported, ${skipped} skipped/duplicates`);
  process.exit(0);
}

main();
