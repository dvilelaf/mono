import type { DefiLlamaPool } from "./types.js";

// Pool IDs for current positions (from scripts/calculate-yield-income.ts)
export const DEFILLAMA_POOLS: Record<string, string> = {
  "Steakhouse Prime Instant": "b55f43a8-f444-4cd8-a3a4-0a4e786ba566",
  "Staked Ethena USDe": "66985a81-9c51-46ca-9977-42b4fe7bc6df",
  "Savings USDS": "d8c4eff5-c8a9-46fc-a888-057c4c668e72",
  "Syrup USDT": "8edfdf02-cdbb-43f7-bca6-954e5fe56813",
  "Jupiter Lend USDT": "a2fbc7ec-22c2-43fe-aa42-49f854aa940d",
  "Lido Staked ETH": "747c1d2a-c668-4682-b9f9-296708a3dd90",
  "Jupiter Lend WSOL": "86d5dc3c-682f-4227-b1c9-7e51c6e60cda",
};

const MANUAL_APYS: Record<string, number> = {
  "Coinbase Earn (Stablecoins)": 0.035,
  "Revolut GBP Savings": 0.04, // Instant Access — tradfi benchmark, update if rate changes
};

// ── Risk parameters ──

// Protocols with meaningful track record, audits, and TVL history.
// Anything not on this list gets filtered out of recommendations.
const TRUSTED_PROTOCOLS = new Set([
  // Blue-chip lending/yield
  "aave-v3", "aave-v2", "compound-v3", "compound-v2",
  "morpho", "morpho-blue", "morpho-v1",
  "maker", "sky", "sky-lending",
  "spark",
  // Staking
  "lido", "rocket-pool", "coinbase-wrapped-staked-eth", "frax-ether",
  // Stablecoins
  "ethena", "ethena-usde",
  // Established lending
  "maple", "maple-v2",
  "jupiter-lend", "jupiter-perps",
  "fluid",
  "kamino-lend",
  // Large DEX single-sided
  "curve-dex", "convex-finance",
  // Vaults
  "yearn-finance", "yearn-v3",
  "steakhouse",
  "gauntlet",
  "mellow-protocol",
  // CeFi
  "coinbase",
]);

const MIN_TVL = 100_000_000; // $100M minimum TVL — battle-tested only
const MAX_APY = 0.15; // 15% cap — anything higher is likely unsustainable or risky
const MAX_PROTOCOL_EXPOSURE = 0.30; // Max 30% of total portfolio in any single protocol
const MIN_BASE_APY_SHARE = 1.0; // 100% of APY must come from base yield — no reward token farming
const MIN_DATA_POINTS = 14; // At least 14 days of DeFiLlama data — no brand-new vaults

export { MAX_PROTOCOL_EXPOSURE, MIN_BASE_APY_SHARE, MIN_DATA_POINTS };

// ── Asset classification ──

const STABLECOIN_TOKENS = new Set(["USDC", "USDT", "USDe", "USDS", "DAI", "FRAX", "LUSD", "GHO", "crvUSD"]);
const ETH_TOKENS = new Set(["ETH", "stETH", "wstETH", "rETH", "cbETH", "WETH"]);

const TRADFI_TOKENS = new Set(["GBP", "USD", "EUR"]);

export function getAssetClass(token: string): "stablecoin" | "eth" | "tradfi" | "other" {
  if (TRADFI_TOKENS.has(token.toUpperCase())) return "tradfi";
  if (STABLECOIN_TOKENS.has(token)) return "stablecoin";
  for (const s of STABLECOIN_TOKENS) {
    if (token.toUpperCase().includes(s)) return "stablecoin";
  }
  if (ETH_TOKENS.has(token)) return "eth";
  for (const e of ETH_TOKENS) {
    if (token.toUpperCase().includes(e)) return "eth";
  }
  return "other";
}

export function isTrustedProtocol(project: string): boolean {
  return TRUSTED_PROTOCOLS.has(project);
}

// ── Data fetching ──

export async function fetchPoolApy(poolId: string): Promise<number | null> {
  if (!poolId) return null;
  try {
    const res = await fetch(`https://yields.llama.fi/chart/${poolId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const points = data.data || [];
    if (points.length === 0) return null;
    return points[points.length - 1].apy / 100;
  } catch {
    return null;
  }
}

export async function fetchCurrentApys(positionNames: string[]): Promise<Map<string, number>> {
  const apys = new Map<string, number>();

  await Promise.all(
    positionNames.map(async (name) => {
      const manual = MANUAL_APYS[name];
      if (manual !== undefined) {
        apys.set(name, manual);
        return;
      }
      const poolId = DEFILLAMA_POOLS[name];
      if (poolId) {
        const apy = await fetchPoolApy(poolId);
        if (apy !== null) apys.set(name, apy);
      }
    })
  );

  return apys;
}

const RELEVANT_CHAINS = new Set([
  "Ethereum", "Solana", "Base", "Arbitrum", "Optimism",
]);

export async function fetchTopAlternatives(): Promise<DefiLlamaPool[]> {
  try {
    const res = await fetch("https://yields.llama.fi/pools");
    if (!res.ok) return [];
    const data = await res.json();
    const pools: DefiLlamaPool[] = data.data || [];

    return pools
      .filter((p) => {
        // Protocol & chain trust
        if (!RELEVANT_CHAINS.has(p.chain)) return false;
        if (!isTrustedProtocol(p.project)) return false;

        // Asset type: stablecoin or ETH only, single exposure
        if (!p.stablecoin && !ETH_TOKENS.has(p.symbol.split("-")[0])) return false;
        if (p.exposure !== "single") return false;
        if (p.symbol.includes("-")) return false;

        // TVL & APY bounds
        if (p.tvlUsd < MIN_TVL) return false;
        if (p.apy <= 0 || p.apy / 100 >= MAX_APY) return false;

        // Vault maturity: need enough data history
        if ((p.count || 0) < MIN_DATA_POINTS) return false;

        // No reward tokens — base yield only
        if ((p.apyReward ?? 0) > 0.01) return false; // tolerance for rounding

        // Skip pools DeFiLlama predicts will decline with high confidence
        if (p.predictions?.predictedClass === "Down" && p.predictions.binnedConfidence >= 3) return false;

        return true;
      })
      .sort((a, b) => (b.apyBase ?? b.apy) - (a.apyBase ?? a.apy)) // sort by base APY, not inflated reward APY
      .slice(0, 50);
  } catch (e) {
    console.error("Failed to fetch DeFiLlama pools:", e);
    return [];
  }
}
