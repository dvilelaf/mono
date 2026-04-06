import type { ParsedTransaction } from "./revolut.js";
export type { ParsedTransaction };

function mmddyyyyToIso(dateStr: string): string {
  const [month, day, year] = dateStr.trim().split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseRobinhoodCsv(csv: string): ParsedTransaction[] {
  const lines = csv.split("\n").map((l) => l.trimEnd());
  if (lines.length < 2) return [];

  const header = lines[0].split(",");
  const idx = {
    activityDate: header.indexOf("Activity Date"),
    processDate: header.indexOf("Process Date"),
    settleDate: header.indexOf("Settle Date"),
    instrument: header.indexOf("Instrument"),
    description: header.indexOf("Description"),
    transCode: header.indexOf("Trans Code"),
    quantity: header.indexOf("Quantity"),
    price: header.indexOf("Price"),
    amount: header.indexOf("Amount"),
  };

  const results: ParsedTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const fields = line.split(",");
    const activityDate = fields[idx.activityDate]?.trim() ?? "";
    const instrument = fields[idx.instrument]?.trim() ?? "";
    const description = fields[idx.description]?.trim() ?? "";
    const transCode = fields[idx.transCode]?.trim() ?? "";

    results.push({
      date: mmddyyyyToIso(activityDate),
      description: `${transCode} ${instrument} - ${description}`,
      amount: fields[idx.amount]?.trim() ?? "",
      currency: "USD",
      balanceAfter: null,
      sourceRef: null,
      metadata: {
        processDate: fields[idx.processDate]?.trim() ?? "",
        settleDate: fields[idx.settleDate]?.trim() ?? "",
        quantity: fields[idx.quantity]?.trim() ?? "",
        price: fields[idx.price]?.trim() ?? "",
        transCode,
        instrument,
      },
    });
  }

  return results;
}
