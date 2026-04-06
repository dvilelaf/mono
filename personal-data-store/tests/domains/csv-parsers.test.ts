import { describe, it, expect } from "vitest";
import { parseRevolutCsv } from "../../src/domains/finance/csv-parsers/revolut.js";
import { parseRobinhoodCsv } from "../../src/domains/finance/csv-parsers/robinhood.js";
import { parseFidelityCsv } from "../../src/domains/finance/csv-parsers/fidelity.js";
import { detectInstitution } from "../../src/domains/finance/finance.service.js";

describe("CSV Parsers", () => {
  describe("Revolut", () => {
    it("parses Revolut CSV format", () => {
      const csv = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-01-15 10:30:00,2026-01-15 10:30:00,Tesco Stores,-25.50,0.00,GBP,COMPLETED,1234.50`;
      const rows = parseRevolutCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe("Tesco Stores");
      expect(rows[0].amount).toBe("-25.50");
      expect(rows[0].currency).toBe("GBP");
      expect(rows[0].date).toBe("2026-01-15");
      expect(rows[0].balanceAfter).toBe("1234.50");
    });
  });

  describe("Robinhood", () => {
    it("parses Robinhood CSV format", () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2026,01/15/2026,01/17/2026,AAPL,APPLE INC,Buy,10,150.00,-1500.00`;
      const rows = parseRobinhoodCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe("Buy AAPL - APPLE INC");
      expect(rows[0].amount).toBe("-1500.00");
      expect(rows[0].date).toBe("2026-01-15");
    });
  });

  describe("Fidelity", () => {
    it("parses Fidelity CSV format", () => {
      const csv = `Date,Transaction,Name,Memo,Amount
01/15/2026,DIVIDEND,VANGUARD TOTAL STOCK,REINVEST DIVIDEND,125.43`;
      const rows = parseFidelityCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe("DIVIDEND - VANGUARD TOTAL STOCK");
      expect(rows[0].amount).toBe("125.43");
      expect(rows[0].date).toBe("2026-01-15");
    });
  });

  describe("Institution detection", () => {
    it("detects Revolut from header", () => {
      const csv = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n";
      expect(detectInstitution(csv)).toBe("revolut");
    });
    it("detects Robinhood from header", () => {
      const csv = "Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n";
      expect(detectInstitution(csv)).toBe("robinhood");
    });
    it("detects Fidelity from header", () => {
      const csv = "Date,Transaction,Name,Memo,Amount\n";
      expect(detectInstitution(csv)).toBe("fidelity");
    });
  });
});
