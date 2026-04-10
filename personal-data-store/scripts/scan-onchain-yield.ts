import "dotenv/config";
import { db } from "../src/db/index.js";
import { incomeStreams } from "../src/domains/finance/income.schema.js";
import { wallets } from "../src/domains/finance/finance.schema.js";
import { eq } from "drizzle-orm";

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || "IJQ4A62AT8GY6793UZT7YQZKDYM1H7B7ZW";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Chain configs for Etherscan V2
const CHAINS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  optimism: 10,
  arbitrum: 42161,
  polygon: 137,
};

// Known yield/reward token contracts and patterns
const YIELD_TOKENS = new Set([
  "steth", "wsteth", "reth", "cbeth", // liquid staking
  "olas", // OLAS rewards
  "usdc", "usdt", "dai", // stablecoin yields
  "comp", "aave", // governance rewards
  "crv", "cvx", // curve/convex rewards
]);

// Transfers FROM 0x000...000 are mints (often staking rewards)
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface TokenTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
}

async function fetchTokenTxns(address: string, chainId: number): Promise<TokenTx[]> {
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=1000&sort=desc&apikey=${ETHERSCAN_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Etherscan error: ${res.status}`);
  const data = await res.json() as { status: string; result: TokenTx[] | string };
  if (data.status !== "1" || !Array.isArray(data.result)) return [];
  return data.result;
}

function isYieldTransaction(tx: TokenTx, walletAddress: string): boolean {
  const toUs = tx.to.toLowerCase() === walletAddress.toLowerCase();
  if (!toUs) return false;

  const symbol = tx.tokenSymbol.toLowerCase();

  // Mints from zero address (staking rewards, rebases)
  if (tx.from.toLowerCase() === ZERO_ADDRESS) return true;

  // Known yield tokens being transferred TO us (not from us)
  if (YIELD_TOKENS.has(symbol)) return true;

  return false;
}

function formatValue(value: string, decimals: string): number {
  const d = parseInt(decimals) || 18;
  return Number(value) / Math.pow(10, d);
}

async function main() {
  // Get top EVM wallets
  const evmWallets = await db.select().from(wallets)
    .where(eq(wallets.walletType, "onchain"));

  // Dedupe by address
  const addresses = [...new Set(evmWallets.filter(w => w.address.startsWith("0x")).map(w => w.address.toLowerCase()))];

  console.log(`Scanning ${addresses.length} unique EVM addresses across ${Object.keys(CHAINS).length} chains...\n`);

  let totalYield = 0;
  let recordsInserted = 0;

  for (const address of addresses) {
    for (const [chainName, chainId] of Object.entries(CHAINS)) {
      await sleep(250); // rate limit

      try {
        const txns = await fetchTokenTxns(address, chainId);
        if (txns.length === 0) continue;

        const yieldTxns = txns.filter(tx => isYieldTransaction(tx, address));
        if (yieldTxns.length === 0) continue;

        console.log(`${address.slice(0, 8)}... on ${chainName}: ${yieldTxns.length} yield txns out of ${txns.length} total`);

        for (const tx of yieldTxns) {
          const amount = formatValue(tx.value, tx.tokenDecimal);
          if (amount < 0.001) continue; // skip dust

          const date = new Date(Number(tx.timeStamp) * 1000);
          const endDate = new Date(date);
          endDate.setDate(endDate.getDate() + 1);

          try {
            const inserted = await db.insert(incomeStreams).values({
              source: `onchain_${chainName}`,
              streamType: tx.from.toLowerCase() === ZERO_ADDRESS ? "staking_reward" : "yield",
              asset: tx.tokenSymbol,
              amount: String(amount),
              currency: tx.tokenSymbol,
              periodStart: date,
              periodEnd: endDate,
              metadata: {
                chain: chainName,
                txHash: tx.hash,
                from: tx.from,
                tokenName: tx.tokenName,
                contractAddress: tx.contractAddress,
                walletAddress: address,
                rawValue: tx.value,
              },
            }).onConflictDoNothing().returning({ id: incomeStreams.id });

            if (inserted.length) {
              recordsInserted++;
              totalYield += amount;
            }
          } catch {}
        }
      } catch (err) {
        // Skip errors silently (rate limits, unsupported chains)
      }
    }
  }

  console.log(`\nDone: ${recordsInserted} yield records inserted.`);

  // Summary
  const summary = await db.execute(
    require("drizzle-orm").sql`
      SELECT source, asset, count(*) AS entries,
        round(sum(amount::numeric)::numeric, 4) AS total
      FROM income_streams
      WHERE source LIKE 'onchain_%'
      GROUP BY source, asset ORDER BY total DESC
    `
  );
  console.log("\nOn-chain yield summary:");
  for (const row of summary as any[]) {
    console.log(`  ${row.source} ${row.asset}: ${row.total} (${row.entries} txns)`);
  }

  process.exit(0);
}

main();
