import { describe, it, expect, vi, beforeEach } from "vitest";
import { cryptoConnector } from "../../src/connectors/crypto.connector.js";
import { resetDb } from "../helpers/setup.js";
import { db } from "../../src/db/index.js";
import { wallets, portfolioSnapshots } from "../../src/domains/finance/finance.schema.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Crypto Connector", () => {
  beforeEach(async () => {
    await resetDb();
    mockFetch.mockReset();
  });

  it("fetches portfolio data for each wallet", async () => {
    const [wallet] = await db
      .insert(wallets)
      .values({ address: "0xabc", chain: "ethereum", label: "main" })
      .returning();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalBalanceUsd: 15000,
        assets: [
          { symbol: "ETH", balance: 5, balanceUSD: 10000 },
          { symbol: "USDC", balance: 5000, balanceUSD: 5000 },
        ],
      }),
    });

    const result = await cryptoConnector.sync();
    expect(result.recordsSynced).toBe(1);

    const snapshots = await db.select().from(portfolioSnapshots);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].walletId).toBe(wallet.id);
    expect(snapshots[0].totalValueUsd).toBe("15000");
  });

  it("handles no wallets gracefully", async () => {
    const result = await cryptoConnector.sync();
    expect(result.recordsSynced).toBe(0);
  });
});
