import type { Connector, SyncResult } from "./connector.interface.js";
import { db } from "../db/index.js";
import { wallets, portfolioSnapshots } from "../domains/finance/finance.schema.js";
import { eq } from "drizzle-orm";

const ZERION_BASE = "https://api.zerion.io/v1";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function zerionHeaders(): Record<string, string> {
  const apiKey = process.env.ZERION_API_KEY;
  if (!apiKey) throw new Error("ZERION_API_KEY not configured");
  return {
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    Accept: "application/json",
  };
}

export const cryptoConnector: Connector = {
  name: "crypto",
  schedule: "*/15 * * * *",

  async sync(): Promise<SyncResult> {
    // Get unique EVM addresses (Zerion handles multi-chain per address)
    const allWallets = await db.select().from(wallets).where(eq(wallets.walletType, "onchain"));

    // Dedupe EVM addresses only (0x prefix), Zerion handles multi-chain per address
    const addressMap = new Map<string, typeof allWallets>();
    for (const w of allWallets) {
      if (!w.address.startsWith("0x")) continue;
      const key = w.address.toLowerCase();
      if (!addressMap.has(key)) addressMap.set(key, []);
      addressMap.get(key)!.push(w);
    }

    let recordsSynced = 0;

    for (const [address, walletGroup] of addressMap) {
      await sleep(250); // 4 RPS to stay under Zerion's 5 RPS limit
      try {
        const res = await fetch(
          `${ZERION_BASE}/wallets/${address}/portfolio?currency=usd`,
          { headers: zerionHeaders() },
        );

        if (!res.ok) throw new Error(`Zerion API error: ${res.status}`);

        const json = (await res.json()) as {
          data: {
            attributes: {
              total: { positions: number };
              positions_distribution_by_chain: Record<string, number>;
            };
          };
        };

        const attrs = json.data.attributes;
        const totalUsd = attrs.total.positions;
        const chainBreakdown = attrs.positions_distribution_by_chain;

        // Store one snapshot per address (using first wallet entry)
        await db.insert(portfolioSnapshots).values({
          walletId: walletGroup[0].id,
          totalValueUsd: String(totalUsd),
          positions: chainBreakdown,
          source: "zerion",
          snapshotAt: new Date(),
        });

        recordsSynced++;
      } catch (err) {
        console.error(`[crypto] Failed to fetch portfolio for ${address}:`, (err as Error).message);
      }
    }

    return { recordsSynced };
  },
};
