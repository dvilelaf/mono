import type { ParsedTransaction } from "./revolut.js";

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Sept: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseDate(str: string): string {
  const parts = str.trim().split(" ");
  if (parts.length !== 3) return "1970-01-01";
  const [day, mon, year] = parts;
  return `${year}-${MONTHS[mon] || "01"}-${day.padStart(2, "0")}`;
}

function parseAmount(str: string): string | null {
  if (!str || !str.trim()) return null;
  const cleaned = str.replace(/[£€$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : String(num);
}

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

function detectCurrency(str: string): string {
  if (str.includes("£")) return "GBP";
  if (str.includes("$")) return "USD";
  if (str.includes("€")) return "EUR";
  return "GBP";
}

export function parseRevolutSavingsCsv(csv: string): ParsedTransaction[] {
  const lines = csv.split("\n").map(l => l.trimEnd());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const colCount = header.length;

  const results: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    const dateStr = fields[0]?.trim();
    if (!dateStr) continue;

    const date = parseDate(dateStr);
    if (date === "1970-01-01") continue;

    let description: string;
    let amount: string | null = null;
    let currency = "GBP";
    let balanceAfter: string | null = null;

    if (colCount === 5) {
      // Standard: Date,Description,Money out,Money in,Balance
      description = fields[1]?.trim() || "";
      const moneyOut = parseAmount(fields[2]);
      const moneyIn = parseAmount(fields[3]);
      if (moneyOut) { amount = "-" + moneyOut; currency = detectCurrency(fields[2]); }
      else if (moneyIn) { amount = moneyIn; currency = detectCurrency(fields[3]); }
      balanceAfter = parseAmount(fields[4]);
      if (fields[4]) currency = detectCurrency(fields[4]);
    } else if (colCount >= 6) {
      // Investec-style: Date,Account,Description/Type,Money out,Money in,Balance
      description = [fields[1], fields[2]].filter(Boolean).map(s => s.trim()).join(" — ");
      const moneyOut = parseAmount(fields[3]);
      const moneyIn = parseAmount(fields[4]);
      if (moneyOut) { amount = "-" + moneyOut; currency = detectCurrency(fields[3]); }
      else if (moneyIn) { amount = moneyIn; currency = detectCurrency(fields[4]); }
      balanceAfter = parseAmount(fields[5]);
      if (fields[5]) currency = detectCurrency(fields[5]);
    } else {
      continue;
    }

    if (!amount) continue;

    const sourceRef = `rev-sav:${dateStr}:${amount}:${description}`.slice(0, 200);

    results.push({
      date,
      description,
      amount,
      currency,
      balanceAfter,
      sourceRef,
      metadata: {
        type: "Savings",
        product: "Savings",
        fee: "0.00",
        startedDate: dateStr,
      },
    });
  }

  return results;
}
