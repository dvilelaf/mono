import type { ParsedTransaction } from "./revolut.js";

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

function parseDate(str: string): string {
  // "07-04-2026" → "2026-04-07"
  const parts = str.trim().split("-");
  if (parts.length !== 3) return str;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function parseWiseCsv(csv: string): ParsedTransaction[] {
  const lines = csv.split("\n").map(l => l.trimEnd());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const idx: Record<string, number> = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });

  const results: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);

    const wiseId = fields[idx["TransferWise ID"]]?.trim() || "";
    const dateStr = fields[idx["Date"]]?.trim() || "";
    const amount = fields[idx["Amount"]]?.trim() || "";
    const currency = fields[idx["Currency"]]?.trim() || "";
    const description = fields[idx["Description"]]?.trim() || "";
    const balance = fields[idx["Running Balance"]]?.trim() || "";
    const merchant = fields[idx["Merchant"]]?.trim() || "";
    const payeeName = fields[idx["Payee Name"]]?.trim() || "";
    const payerName = fields[idx["Payer Name"]]?.trim() || "";
    const txType = fields[idx["Transaction Type"]]?.trim() || "";
    const txDetailType = fields[idx["Transaction Details Type"]]?.trim() || "";
    const fees = fields[idx["Total fees"]]?.trim() || "";
    const reference = fields[idx["Payment Reference"]]?.trim() || "";

    if (!dateStr || !amount) continue;

    const date = parseDate(dateStr);
    const sourceRef = `wise:${wiseId}`.slice(0, 200);

    results.push({
      date,
      description: description || merchant || payeeName || "Unknown",
      amount,
      currency,
      balanceAfter: balance || null,
      sourceRef: wiseId ? sourceRef : null,
      metadata: {
        type: txDetailType || txType,
        product: "Wise Business",
        fee: fees,
        startedDate: fields[idx["Date Time"]]?.trim() || dateStr,
        merchant: merchant || "",
        payee: payeeName || "",
        payer: payerName || "",
        reference: reference || "",
        wiseId,
      },
    });
  }

  return results;
}
