export interface ParsedTransaction {
  date: string;
  description: string;
  amount: string;
  currency: string;
  balanceAfter: string | null;
  sourceRef: string | null;
  metadata: Record<string, string>;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

export function parseRevolutCsv(csv: string): ParsedTransaction[] {
  const lines = csv.split("\n").map((l) => l.trimEnd());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const idx = {
    type: header.indexOf("Type"),
    product: header.indexOf("Product"),
    startedDate: header.indexOf("Started Date"),
    completedDate: header.indexOf("Completed Date"),
    description: header.indexOf("Description"),
    amount: header.indexOf("Amount"),
    fee: header.indexOf("Fee"),
    currency: header.indexOf("Currency"),
    state: header.indexOf("State"),
    balance: header.indexOf("Balance"),
  };

  const results: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = parseCsvLine(line);
    const state = fields[idx.state]?.trim();
    if (state !== "COMPLETED") continue;

    const completedDate = fields[idx.completedDate]?.trim() ?? "";
    const date = completedDate.slice(0, 10);

    results.push({
      date,
      description: fields[idx.description]?.trim() ?? "",
      amount: fields[idx.amount]?.trim() ?? "",
      currency: fields[idx.currency]?.trim() ?? "",
      balanceAfter: fields[idx.balance]?.trim() || null,
      sourceRef: null,
      metadata: {
        type: fields[idx.type]?.trim() ?? "",
        product: fields[idx.product]?.trim() ?? "",
        fee: fields[idx.fee]?.trim() ?? "",
        startedDate: fields[idx.startedDate]?.trim() ?? "",
      },
    });
  }

  return results;
}
