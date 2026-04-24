import { describe, it, expect } from "vitest";
import { selectToPrune } from "../src/retention.js";

function mk(dates: string[]): string[] {
  return dates.map((d) => `pds-${d}.dump`);
}

describe("selectToPrune", () => {
  it("keeps the N most recent daily dumps", () => {
    const files = mk([
      "2026-04-23-03-00-00",
      "2026-04-22-03-00-00",
      "2026-04-21-03-00-00",
      "2026-04-20-03-00-00",
    ]);
    const prune = selectToPrune(files, { keepDaily: 2, keepMonthly: 0 });
    expect(prune).toEqual([
      "pds-2026-04-21-03-00-00.dump",
      "pds-2026-04-20-03-00-00.dump",
    ]);
  });

  it("keeps one dump per month for the last M months", () => {
    const files = mk([
      "2026-04-01-03-00-00",
      "2026-04-02-03-00-00", // newer April — keep-daily covers
      "2026-03-15-03-00-00", // first-of-month March
      "2026-03-28-03-00-00", // later March — should prune
      "2026-02-10-03-00-00",
      "2025-12-01-03-00-00", // should prune — older than keepMonthly=2
    ]);
    const prune = selectToPrune(files, { keepDaily: 2, keepMonthly: 2 });
    expect(prune).toContain("pds-2026-03-28-03-00-00.dump");
    expect(prune).toContain("pds-2025-12-01-03-00-00.dump");
    expect(prune).not.toContain("pds-2026-03-15-03-00-00.dump");
    expect(prune).not.toContain("pds-2026-02-10-03-00-00.dump");
  });

  it("ignores files that don't match the pds-<stamp>.dump pattern", () => {
    const files = [
      "pds-2026-04-23-03-00-00.dump",
      "README.md",
      "other.dump",
    ];
    const prune = selectToPrune(files, { keepDaily: 0, keepMonthly: 0 });
    expect(prune).toEqual(["pds-2026-04-23-03-00-00.dump"]);
  });
});
