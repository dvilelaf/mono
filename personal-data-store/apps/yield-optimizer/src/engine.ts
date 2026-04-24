import type { YieldPosition } from "../../_shared/types.js";
import type { PositionWithApy, YieldRecommendation, YieldAnalysis, DefiLlamaPool } from "./types.js";
import { fetchCurrentApys, fetchTopAlternatives, getAssetClass, MAX_PROTOCOL_EXPOSURE, MIN_BASE_APY_SHARE, MIN_DATA_POINTS } from "./market-data.js";
import { config } from "./config.js";

const MIN_APY_DELTA = 0.005; // 0.5% minimum improvement to recommend a move

// Derive the risk-free rate from the live APY of whatever tradfi benchmark
// position is present in the snapshot (e.g. Revolut GBP Savings). This avoids
// hardcoding rates that vary by tier, bank, or market conditions.
function derivedRiskFreeRate(
  positions: YieldPosition[],
  apys: Map<string, number>,
): { rate: number; venue: string } | null {
  for (const pos of positions) {
    if (getAssetClass(pos.token) === "tradfi") {
      const apy = apys.get(pos.name);
      if (apy !== undefined) return { rate: apy, venue: pos.name };
    }
  }
  return null; // no tradfi benchmark in snapshot — hurdle checks disabled
}

function ethHurdle(): number {
  return config.ethNativeStakingYield + config.ethRiskPremium;
}

function findBestAlternative(
  position: YieldPosition,
  currentApy: number | null,
  alternatives: DefiLlamaPool[],
  protocolExposure: Map<string, number>,
  totalValue: number,
): { pool: DefiLlamaPool; apy: number } | null {
  const assetClass = getAssetClass(position.token);
  if (assetClass === "other" || assetClass === "tradfi") return null;

  const candidates = alternatives.filter((p) => {
    if (assetClass === "stablecoin" && !p.stablecoin) return false;
    if (assetClass === "eth") {
      const sym = p.symbol.split("-")[0].toUpperCase();
      if (!["ETH", "STETH", "WSTETH", "RETH", "CBETH", "WETH"].includes(sym)) return false;
    }
    if (p.project === position.protocol) return false;

    const currentExposure = protocolExposure.get(p.project) || 0;
    const positionValue = Number(position.valueUsd);
    const wouldBeExposure = (currentExposure + positionValue) / totalValue;
    if (wouldBeExposure > MAX_PROTOCOL_EXPOSURE) return false;

    return true;
  });

  if (candidates.length === 0) return null;

  const best = candidates[0];
  const bestApy = best.apy / 100;

  if (currentApy !== null && bestApy - currentApy < MIN_APY_DELTA) return null;

  return { pool: best, apy: bestApy };
}

/**
 * Check if rebalancing between two existing positions makes sense.
 * E.g., moving from Jupiter USDT (2.4%) to Steakhouse USDC (4.5%).
 */
function findRebalanceOpportunities(
  positions: YieldPosition[],
  apys: Map<string, number>,
  protocolExposure: Map<string, number>,
  totalValue: number,
): YieldRecommendation[] {
  const recommendations: YieldRecommendation[] = [];

  // Group positions by asset class (tradfi is a benchmark, not a rebalance target)
  const byClass = new Map<string, { pos: YieldPosition; apy: number }[]>();
  for (const pos of positions) {
    const cls = getAssetClass(pos.token);
    if (cls === "other" || cls === "tradfi") continue;
    const apy = apys.get(pos.name);
    if (apy === undefined) continue;
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls)!.push({ pos, apy });
  }

  for (const [, group] of byClass) {
    if (group.length < 2) continue;

    // Sort by APY descending
    group.sort((a, b) => b.apy - a.apy);

    const best = group[0];
    for (let i = 1; i < group.length; i++) {
      const worse = group[i];
      const delta = best.apy - worse.apy;
      if (delta < MIN_APY_DELTA) continue;

      // Check concentration: would moving to best's protocol exceed limit?
      const currentExposure = protocolExposure.get(best.pos.protocol) || 0;
      const worseValue = Number(worse.pos.valueUsd);
      const wouldBe = (currentExposure + worseValue) / totalValue;
      if (wouldBe > MAX_PROTOCOL_EXPOSURE) continue;

      const impact = worseValue * delta;

      recommendations.push({
        action: "move",
        fromPosition: worse.pos.name,
        toPosition: best.pos.name,
        toProtocol: best.pos.protocol,
        toChain: best.pos.chain,
        amount: worseValue,
        currentApy: worse.apy,
        targetApy: best.apy,
        targetApyBase: best.apy,
        targetApyReward: 0,
        apyDelta: delta,
        annualisedImpact: impact,
        defiLlamaPoolId: "",
        tvlUsd: 0,
        apyTrend: "known",
        apyMean30d: null,
        dataPoints: 0,
        rationale: `Rebalance $${worseValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} from ${worse.pos.name} (${(worse.apy * 100).toFixed(2)}%) to ${best.pos.name} (${(best.apy * 100).toFixed(2)}%) for +$${impact.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr`,
      });
    }
  }

  return recommendations;
}

export async function runOptimization(positions: YieldPosition[]): Promise<YieldAnalysis> {
  const positionNames = positions.map((p) => p.name);
  const [apys, alternatives] = await Promise.all([
    fetchCurrentApys(positionNames),
    fetchTopAlternatives(),
  ]);

  // Risk-free rate comes from the live APY of whichever tradfi benchmark position
  // is present in the snapshot. No fallback — if it's absent, hurdle checks are skipped.
  const tradfi = derivedRiskFreeRate(positions, apys);
  const stablecoinHurdleRate = tradfi !== null ? tradfi.rate + config.stablecoinRiskPremium : null;
  const ethHurdleRate = ethHurdle();

  const totalValue = positions.reduce((s, p) => s + Number(p.valueUsd), 0);

  const protocolExposure = new Map<string, number>();
  for (const pos of positions) {
    const val = Number(pos.valueUsd);
    protocolExposure.set(pos.protocol, (protocolExposure.get(pos.protocol) || 0) + val);
  }

  const enriched: PositionWithApy[] = [];
  const externalRecs: YieldRecommendation[] = [];
  const exitRecs: YieldRecommendation[] = [];
  let currentTotal = 0;
  let optimisedTotal = 0;
  let cryptoValue = 0;
  let tradfiValue = 0;
  let underHurdleValue = 0;

  for (const pos of positions) {
    const value = Number(pos.valueUsd);
    const currentApy = apys.get(pos.name) ?? null;
    const annualised = currentApy !== null ? value * currentApy : 0;
    currentTotal += annualised;

    const assetClass = getAssetClass(pos.token);
    const hurdle = assetClass === "stablecoin" ? stablecoinHurdleRate
                 : assetClass === "eth"        ? ethHurdleRate
                 : null;
    if (assetClass === "tradfi") tradfiValue += value;
    else cryptoValue += value;

    const alt = findBestAlternative(pos, currentApy, alternatives, protocolExposure, totalValue);

    // Exit-to-tradfi check: if this crypto position AND its best crypto alternative
    // both fail to clear the hurdle, recommend rotating to tradfi rather than to
    // another crypto venue. Stays within user's stated crypto allocation budget.
    if (hurdle !== null && currentApy !== null && assetClass !== "tradfi") {
      const bestCryptoApy = alt?.apy ?? currentApy;
      if (bestCryptoApy < hurdle) {
        underHurdleValue += value;
        const tradfiBenchmark = assetClass === "eth"
          ? { apy: config.ethNativeStakingYield, venue: "native ETH staking" }
          : { apy: tradfi!.rate, venue: tradfi!.venue };
        const impact = value * (tradfiBenchmark.apy - currentApy);
        exitRecs.push({
          action: "exit",
          fromPosition: pos.name,
          toPosition: tradfiBenchmark.venue,
          toProtocol: "tradfi",
          toChain: "off-chain",
          amount: value,
          currentApy,
          targetApy: tradfiBenchmark.apy,
          targetApyBase: tradfiBenchmark.apy,
          targetApyReward: 0,
          apyDelta: tradfiBenchmark.apy - currentApy,
          annualisedImpact: impact,
          defiLlamaPoolId: "",
          tvlUsd: 0,
          apyTrend: "n/a",
          apyMean30d: null,
          dataPoints: 0,
          rationale: `EXIT: $${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} in ${pos.name} earns ${(currentApy * 100).toFixed(2)}%, best crypto alt ${(bestCryptoApy * 100).toFixed(2)}% — both below ${assetClass} hurdle of ${(hurdle * 100).toFixed(2)}%. Offramp to ${tradfiBenchmark.venue} (${(tradfiBenchmark.apy * 100).toFixed(2)}%) unless this is part of the ring-fenced crypto allocation.`,
        });
      }
    }

    const enrichedPos: PositionWithApy = {
      name: pos.name,
      protocol: pos.protocol,
      chain: pos.chain,
      token: pos.token,
      valueUsd: value,
      currentApy,
      bestAlternativeApy: alt?.apy ?? null,
      bestAlternativeName: alt ? `${alt.pool.project} ${alt.pool.symbol}` : null,
      bestAlternativePool: alt?.pool.pool ?? null,
      annualisedYield: annualised,
    };
    enriched.push(enrichedPos);

    if (alt && currentApy !== null) {
      const apyDelta = alt.apy - currentApy;
      const impact = value * apyDelta;
      optimisedTotal += value * alt.apy;

      const baseApy = (alt.pool.apyBase ?? alt.pool.apy) / 100;
      const rewardApy = (alt.pool.apyReward ?? 0) / 100;

      externalRecs.push({
        action: "move",
        fromPosition: pos.name,
        toPosition: `${alt.pool.project} ${alt.pool.symbol}`,
        toProtocol: alt.pool.project,
        toChain: alt.pool.chain,
        amount: value,
        currentApy,
        targetApy: alt.apy,
        targetApyBase: baseApy,
        targetApyReward: rewardApy,
        apyDelta,
        annualisedImpact: impact,
        defiLlamaPoolId: alt.pool.pool,
        tvlUsd: alt.pool.tvlUsd,
        apyTrend: alt.pool.predictions?.predictedClass ?? "unknown",
        apyMean30d: alt.pool.apyMean30d ? alt.pool.apyMean30d / 100 : null,
        dataPoints: alt.pool.count || 0,
        rationale: `Move $${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} from ${pos.name} (${(currentApy * 100).toFixed(2)}%) to ${alt.pool.project} ${alt.pool.symbol} (${(baseApy * 100).toFixed(2)}% base, $${(alt.pool.tvlUsd / 1e6).toFixed(0)}M TVL) for +$${impact.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr`,
      });

      protocolExposure.set(alt.pool.project, (protocolExposure.get(alt.pool.project) || 0) + value);
      protocolExposure.set(pos.protocol, (protocolExposure.get(pos.protocol) || 0) - value);
    } else {
      optimisedTotal += annualised;
    }
  }

  // Also check rebalancing between existing positions
  const rebalanceRecs = findRebalanceOpportunities(positions, apys, protocolExposure, totalValue);

  // Exit-to-tradfi recs first (they resolve a risk/return mismatch), then
  // rebalances within crypto, then external moves — sorted within each bucket
  // by annualised impact magnitude.
  const bySize = (a: YieldRecommendation, b: YieldRecommendation) =>
    Math.abs(b.annualisedImpact) - Math.abs(a.annualisedImpact);
  const recommendations = [
    ...exitRecs.sort(bySize),
    ...rebalanceRecs.sort(bySize),
    ...externalRecs.sort(bySize),
  ];

  // Build concentration summary
  const currentProtocolExposure: Record<string, { valueUsd: number; pct: number }> = {};
  const exposureMap = new Map<string, number>();
  for (const pos of positions) {
    const val = Number(pos.valueUsd);
    exposureMap.set(pos.protocol, (exposureMap.get(pos.protocol) || 0) + val);
  }
  for (const [protocol, val] of exposureMap) {
    currentProtocolExposure[protocol] = { valueUsd: Math.round(val), pct: Math.round((val / totalValue) * 100) };
  }

  return {
    currentAnnualisedYield: Math.round(currentTotal),
    optimisedAnnualisedYield: Math.round(optimisedTotal),
    targetYield: config.targetAnnualisedYield,
    gapToTarget: Math.round(config.targetAnnualisedYield - currentTotal),
    totalValue: Math.round(totalValue),
    cryptoValue: Math.round(cryptoValue),
    tradfiValue: Math.round(tradfiValue),
    underHurdleValue: Math.round(underHurdleValue),
    positions: enriched,
    recommendations,
    protocolExposure: currentProtocolExposure,
    riskParameters: {
      minTvl: "$100M",
      maxApy: "15%",
      maxProtocolExposure: `${MAX_PROTOCOL_EXPOSURE * 100}%`,
      minBaseApyShare: `${MIN_BASE_APY_SHARE * 100}%`,
      minDataPoints: MIN_DATA_POINTS,
      trustedProtocolsOnly: true,
      stablecoinHurdle: stablecoinHurdleRate !== null
        ? `${(stablecoinHurdleRate * 100).toFixed(2)}% (${tradfi!.venue} ${(tradfi!.rate * 100).toFixed(2)}% + ${(config.stablecoinRiskPremium * 100).toFixed(2)}% crypto premium)`
        : "n/a (no tradfi benchmark position in snapshot)",
      ethHurdle: `${(ethHurdleRate * 100).toFixed(2)}% (native staking ${(config.ethNativeStakingYield * 100).toFixed(2)}% + ${(config.ethRiskPremium * 100).toFixed(2)}% LST premium)`,
      philosophy: "Crypto positions are an alternative to tradfi. A position failing to clear its asset-class hurdle should be rotated to tradfi, not to another crypto venue — except within the user's ring-fenced crypto allocation budget for rotation/UX optionality.",
    },
    generatedAt: new Date().toISOString(),
  };
}
