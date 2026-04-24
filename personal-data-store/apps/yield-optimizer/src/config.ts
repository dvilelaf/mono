export const config = {
  port: parseInt(process.env.PORT || "3002"),
  pdsUrl: process.env.PDS_URL || "http://localhost:3000",
  pdsApiKey: process.env.PDS_API_KEY || "",
  schedule: process.env.CRON_SCHEDULE || "30 6 * * *", // daily 06:30 UTC
  targetAnnualisedYield: 170_000,

  // ── Hurdle rates ──
  // The risk-free rate is NOT configured here. It is derived at runtime from
  // the actual APY of tradfi benchmark positions in the snapshot (e.g. Revolut
  // GBP Savings). If no tradfi position is present, hurdle checks are skipped.
  stablecoinRiskPremium: Number(process.env.STABLECOIN_RISK_PREMIUM ?? 0.02), // +2% over risk-free
  ethNativeStakingYield: Number(process.env.ETH_NATIVE_STAKING ?? 0.03), // solo/native staking baseline
  ethRiskPremium: Number(process.env.ETH_RISK_PREMIUM ?? 0.005), // +50bps over native for LST smart-contract risk

  // Target minimum crypto allocation — the portion worth keeping on-chain for
  // UX and rotation optionality. Anything beyond this that can't beat the
  // hurdle should be flagged for offramp. Set explicitly once user decides.
  targetCryptoAllocationUsd: Number(process.env.TARGET_CRYPTO_ALLOCATION_USD ?? 0), // 0 = not yet decided
};
