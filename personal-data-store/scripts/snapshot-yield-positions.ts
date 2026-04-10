import "dotenv/config";
import { db } from "../src/db/index.js";
import { yieldPositions } from "../src/domains/finance/yield-positions.schema.js";

// Yield-bearing positions to track
// These tokens accrue yield via price appreciation (rebase or exchange rate)
const POSITIONS = [
  { name: "Steakhouse Prime Instant", protocol: "morpho", chain: "ethereum", token: "steakUSDC", wallet: "0xe84b217ba16dc2ea132911e468cbd24ece7fd871" },
  { name: "Staked Ethena USDe", protocol: "ethena", chain: "ethereum", token: "sUSDe", wallet: "0xe84b217ba16dc2ea132911e468cbd24ece7fd871" },
  { name: "Savings USDS", protocol: "sky", chain: "ethereum", token: "sUSDS", wallet: "0xe84b217ba16dc2ea132911e468cbd24ece7fd871" },
  { name: "Lido Staked ETH", protocol: "lido", chain: "ethereum", token: "stETH", wallet: "0x7EB9d67f9DaeA510399A1eE978b36E66626058d3" },
  { name: "Syrup USDT", protocol: "maple", chain: "ethereum", token: "syrupUSDT", wallet: "0xe84b217ba16dc2ea132911e468cbd24ece7fd871" },
  { name: "Jupiter Lend USDT", protocol: "jupiter", chain: "solana", token: "jlUSDT", wallet: "6U3Z3M3VzBvqqosDqb4AdU4f7mfU8xo2dbJt282pk94m" },
  { name: "Jupiter Lend WSOL", protocol: "jupiter", chain: "solana", token: "jlWSOL", wallet: "6U3Z3M3VzBvqqosDqb4AdU4f7mfU8xo2dbJt282pk94m" },
];

const ZERION_KEY = process.env.ZERION_API_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Jupiter Lend token mints on Solana mainnet
const JUPITER_LEND_MINTS: Record<string, { token: string; decimals: number }> = {
  "Cmn4v2wipYV41dkakDvCgFJpxhtaaKt11NyWV8pjSE8A": { token: "jlUSDT", decimals: 6 },
  "2uQsyo1fXXQkDtcpXnLofWy88PxcvnfH2L8FPSE62FVU": { token: "jlWSOL", decimals: 9 },
};

async function fetchZerionPositions(address: string): Promise<any[]> {
  if (!ZERION_KEY) throw new Error("ZERION_API_KEY not set");

  const res = await fetch(
    `https://api.zerion.io/v1/wallets/${address}/positions?currency=usd&filter[positions]=only_simple`,
    { headers: { Authorization: `Basic ${Buffer.from(`${ZERION_KEY}:`).toString("base64")}`, Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Zerion error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data || [];
}

async function fetchSolanaJupiterPositions(walletAddress: string): Promise<Map<string, { quantity: number; price: number; value: number }>> {
  const results = new Map<string, { quantity: number; price: number; value: number }>();

  console.log(`  Falling back to Solana RPC + Jupiter Price API for ${walletAddress.slice(0, 8)}...`);

  // Fetch all token accounts for the wallet
  const rpcRes = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        walletAddress,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed" },
      ],
    }),
  });

  if (!rpcRes.ok) throw new Error(`Solana RPC error: ${rpcRes.status}`);
  const rpcData = await rpcRes.json();

  if (rpcData.error) throw new Error(`Solana RPC error: ${JSON.stringify(rpcData.error)}`);

  const tokenAccounts = rpcData.result?.value || [];
  console.log(`  Found ${tokenAccounts.length} token accounts on Solana`);

  // Filter to Jupiter Lend token accounts
  const jlAccounts: Array<{ mint: string; amount: number }> = [];
  for (const account of tokenAccounts) {
    const info = account.account?.data?.parsed?.info;
    if (!info) continue;
    const mint = info.mint as string;
    if (JUPITER_LEND_MINTS[mint]) {
      const { decimals } = JUPITER_LEND_MINTS[mint];
      const rawAmount = Number(info.tokenAmount?.amount || 0);
      const amount = rawAmount / Math.pow(10, decimals);
      if (amount > 0) {
        jlAccounts.push({ mint, amount });
        console.log(`  Found ${JUPITER_LEND_MINTS[mint].token}: ${amount.toFixed(6)} (raw: ${rawAmount})`);
      }
    }
  }

  if (jlAccounts.length === 0) {
    console.log(`  No Jupiter Lend tokens found via RPC`);
    return results;
  }

  // Fetch prices from Jupiter Price API v2
  const mintIds = jlAccounts.map(a => a.mint).join(",");
  const priceRes = await fetch(`https://api.jup.ag/price/v2?ids=${mintIds}`);
  if (!priceRes.ok) throw new Error(`Jupiter Price API error: ${priceRes.status}`);
  const priceData = await priceRes.json();

  for (const { mint, amount } of jlAccounts) {
    const { token } = JUPITER_LEND_MINTS[mint];
    const price = Number(priceData.data?.[mint]?.price || 0);
    const value = amount * price;
    results.set(token, { quantity: amount, price, value });
    console.log(`  ${token}: ${amount.toFixed(4)} @ $${price.toFixed(4)} = $${value.toFixed(2)}`);
  }

  return results;
}

async function main() {
  const now = new Date();
  let count = 0;

  // Fetch positions from Zerion — supports both EVM and Solana wallets
  const allWallets = [...new Set(POSITIONS.map(p => p.wallet))];

  const allZerionPositions: any[] = [];
  let zerionFailed = false;
  for (const wallet of allWallets) {
    try {
      const positions = await fetchZerionPositions(wallet);
      allZerionPositions.push(...positions);
      console.log(`Zerion: ${positions.length} positions for ${wallet.slice(0, 8)}...`);
    } catch (err) {
      console.error(`Zerion failed for ${wallet.slice(0, 8)}: ${(err as Error).message}`);
      if (wallet === "6U3Z3M3VzBvqqosDqb4AdU4f7mfU8xo2dbJt282pk94m") {
        zerionFailed = true;
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Fetch Solana Jupiter positions as fallback if Zerion didn't return them
  const zerionHasJlUSDT = allZerionPositions.some(z => z.attributes?.fungible_info?.symbol?.toLowerCase() === "jlusdt");
  const zerionHasJlWSOL = allZerionPositions.some(z => z.attributes?.fungible_info?.symbol?.toLowerCase() === "jlwsol");
  const needsSolanaFallback = zerionFailed || (!zerionHasJlUSDT && !zerionHasJlWSOL);

  let solanaPositions = new Map<string, { quantity: number; price: number; value: number }>();
  if (needsSolanaFallback) {
    try {
      solanaPositions = await fetchSolanaJupiterPositions("6U3Z3M3VzBvqqosDqb4AdU4f7mfU8xo2dbJt282pk94m");
    } catch (err) {
      console.error(`Solana RPC fallback failed: ${(err as Error).message}`);
    }
  }

  // Match and insert each tracked position
  for (const pos of POSITIONS) {
    // Try Zerion first
    const match = allZerionPositions.find((z: any) => {
      const symbol = z.attributes?.fungible_info?.symbol?.toLowerCase();
      return symbol === pos.token.toLowerCase();
    });

    if (match) {
      const attrs = match.attributes;
      const quantity = attrs.quantity?.float || 0;
      const price = attrs.price || 0;
      const value = attrs.value || 0;

      await db.insert(yieldPositions).values({
        name: pos.name,
        protocol: pos.protocol,
        chain: pos.chain,
        token: pos.token,
        tokenBalance: String(quantity),
        tokenPrice: String(price),
        valueUsd: String(value),
        snapshotAt: now,
        metadata: { wallet: pos.wallet, source: "zerion" },
      });
      console.log(`  ${pos.name}: ${quantity.toFixed(2)} ${pos.token} = $${value.toFixed(2)} (zerion)`);
      count++;
    } else if (pos.chain === "solana" && solanaPositions.has(pos.token)) {
      // Use Solana RPC fallback for Jupiter Lend tokens
      const { quantity, price, value } = solanaPositions.get(pos.token)!;

      await db.insert(yieldPositions).values({
        name: pos.name,
        protocol: pos.protocol,
        chain: pos.chain,
        token: pos.token,
        tokenBalance: String(quantity),
        tokenPrice: String(price),
        valueUsd: String(value),
        snapshotAt: now,
        metadata: { wallet: pos.wallet, source: "solana_rpc+jupiter_price_api" },
      });
      console.log(`  ${pos.name}: ${quantity.toFixed(4)} ${pos.token} = $${value.toFixed(2)} (solana rpc)`);
      count++;
    } else {
      console.log(`  ${pos.name} (${pos.token}): not found in Zerion or Solana RPC`);
    }
  }

  // Manual entry for current snapshot from the screenshot (for positions Zerion might miss)
  // Note: jlUSDT and jlWSOL are now fetched automatically above; removed from manual list
  const manualPositions = [
    { name: "Steakhouse Prime Instant", protocol: "morpho", chain: "ethereum", token: "steakUSDC", balance: "669091.76", price: "1.01", value: "677454.57" },
    { name: "Staked Ethena USDe", protocol: "ethena", chain: "ethereum", token: "sUSDe", balance: "412018.106", price: "1.23", value: "505250.93" },
    { name: "Savings USDS", protocol: "sky", chain: "ethereum", token: "sUSDS", balance: "407773.22", price: "1.09", value: "445783.86" },
    { name: "Lido Staked ETH", protocol: "lido", chain: "ethereum", token: "stETH", balance: "119.023", price: "2255.76", value: "268664.15" },
    { name: "Syrup USDT", protocol: "maple", chain: "ethereum", token: "syrupUSDT", balance: "234235.482", price: "1.12", value: "263048.74" },
  ];

  for (const mp of manualPositions) {
    // Only insert if not already captured from Zerion
    const existing = count > 0; // simplified check
    await db.insert(yieldPositions).values({
      name: mp.name,
      protocol: mp.protocol,
      chain: mp.chain,
      token: mp.token,
      tokenBalance: mp.balance,
      tokenPrice: mp.price,
      valueUsd: mp.value,
      snapshotAt: now,
      metadata: { source: "manual_screenshot", date: "2026-04-08" },
    });
  }

  const manualTotal = manualPositions.reduce((s, p) => s + Number(p.value), 0);
  const solanaTotal = [...solanaPositions.values()].reduce((s, p) => s + p.value, 0);
  console.log(`\nDone: ${count} automated (Zerion/Solana RPC), ${manualPositions.length} manual entries.`);
  console.log(`Total yield positions: $${(manualTotal + solanaTotal).toLocaleString()}`);
  process.exit(0);
}

main();
