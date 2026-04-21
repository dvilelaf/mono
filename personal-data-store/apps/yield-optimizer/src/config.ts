export const config = {
  port: parseInt(process.env.PORT || "3002"),
  pdsUrl: process.env.PDS_URL || "http://localhost:3000",
  pdsApiKey: process.env.PDS_API_KEY || "",
  schedule: process.env.CRON_SCHEDULE || "30 6 * * *", // daily 06:30 UTC
  targetAnnualisedYield: 170_000,

  // ── Hurdle rates ──
  // These positions are an ALTERNATIVE to tradfi. Crypto yield must compensate
  // for smart-contract risk, custody risk, depeg risk, and the tax/accounting
  // overhead of staying on-chain. A position that underperforms the hurdle
  // should be rotated to tradfi, not to a different crypto venue.
  //
  // GBP risk-free benchmark: Revolut Instant Access savings (currently ~4%).
  // Calibrate these against the user's actual tradfi alternative at the time.
  riskFreeRateGbp: Number(process.env.RISK_FREE_RATE_GBP ?? 0.04), // 4.00%
  riskFreeRateUsd: Number(process.env.RISK_FREE_RATE_USD ?? 0.04), // 4.00% — US T-bills / HYSA
  stablecoinRiskPremium: Number(process.env.STABLECOIN_RISK_PREMIUM ?? 0.02), // +2% over risk-free
  ethNativeStakingYield: Number(process.env.ETH_NATIVE_STAKING ?? 0.03), // solo/native staking baseline
  ethRiskPremium: Number(process.env.ETH_RISK_PREMIUM ?? 0.005), // +50bps over native for LST smart-contract risk

  // Target minimum crypto allocation — the portion worth keeping on-chain for
  // UX and rotation optionality. Anything beyond this that can't beat the
  // hurdle should be flagged for offramp. Set explicitly once user decides.
  targetCryptoAllocationUsd: Number(process.env.TARGET_CRYPTO_ALLOCATION_USD ?? 0), // 0 = not yet decided
};
