import type { Connector, SyncResult } from "./connector.interface.js";
import { db } from "../db/index.js";
import { wallets, portfolioSnapshots } from "../domains/finance/finance.schema.js";

export const cryptoConnector: Connector = {
  name: "crypto",
  schedule: "*/15 * * * *",

  async sync(): Promise<SyncResult> {
    const allWallets = await db.select().from(wallets);
    let recordsSynced = 0;

    for (const wallet of allWallets) {
      try {
        const apiKey = process.env.ZAPPER_API_KEY;
        const res = await fetch(
          `https://api.zapper.xyz/v2/balances?addresses[]=${wallet.address}&networks[]=${wallet.chain}`,
          {
            headers: apiKey
              ? { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` }
              : {},
          }
        );

        if (!res.ok) throw new Error(`Zapper API error: ${res.status}`);

        const data = (await res.json()) as {
          totalBalanceUsd: number;
          assets: { symbol: string; balance: number; balanceUSD: number }[];
        };

        await db.insert(portfolioSnapshots).values({
          walletId: wallet.id,
          totalValueUsd: String(data.totalBalanceUsd),
          positions: data.assets,
          source: "zapper",
          snapshotAt: new Date(),
        });

        recordsSynced++;
      } catch (err) {
        console.error(`[crypto] Failed to fetch portfolio for ${wallet.address}:`, err);
      }
    }

    return { recordsSynced };
  },
};
