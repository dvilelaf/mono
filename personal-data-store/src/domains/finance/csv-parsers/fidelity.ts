import type { ParsedTransaction } from "./revolut.js";
export type { ParsedTransaction };

function mmddyyyyToIso(dateStr: string): string {
  const [month, day, year] = dateStr.trim().split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseFidelityCsv(csv: string): ParsedTransaction[] {
  const lines = csv.split("\n").map((l) => l.trimEnd());
  if (lines.length < 2) return [];

  const header = lines[0].split(",");
  const idx = {
    date: header.indexOf("Date"),
    transaction: header.indexOf("Transaction"),
    name: header.indexOf("Name"),
    memo: header.indexOf("Memo"),
    amount: header.indexOf("Amount"),
  };

  const results: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = line.split(",");
    const dateStr = fields[idx.date]?.trim() ?? "";
    const transaction = fields[idx.transaction]?.trim() ?? "";
    const name = fields[idx.name]?.trim() ?? "";

    results.push({
      date: mmddyyyyToIso(dateStr),
      description: `${transaction} - ${name}`,
      amount: fields[idx.amount]?.trim() ?? "",
      currency: "USD",
      balanceAfter: null,
      sourceRef: null,
      metadata: {
        memo: fields[idx.memo]?.trim() ?? "",
        transaction,
      },
    });
  }

  return results;
}
