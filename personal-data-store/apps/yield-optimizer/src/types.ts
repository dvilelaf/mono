export interface PositionWithApy {
  name: string;
  protocol: string;
  chain: string;
  token: string;
  valueUsd: number;
  currentApy: number | null;
  bestAlternativeApy: number | null;
  bestAlternativeName: string | null;
  bestAlternativePool: string | null;
  annualisedYield: number;
}

export interface YieldRecommendation {
  action: "move" | "add" | "hold" | "exit";
  fromPosition: string;
  toPosition: string;
  toProtocol: string;
  toChain: string;
  amount: number;
  currentApy: number;
  targetApy: number;
  targetApyBase: number;
  targetApyReward: number;
  apyDelta: number;
  annualisedImpact: number;
  defiLlamaPoolId: string;
  tvlUsd: number;
  apyTrend: string;
  apyMean30d: number | null;
  dataPoints: number;
  rationale: string;
}

export interface YieldAnalysis {
  currentAnnualisedYield: number;
  optimisedAnnualisedYield: number;
  targetYield: number;
  gapToTarget: number;
  totalValue: number;
  cryptoValue: number; // value in on-chain positions (excludes tradfi)
  tradfiValue: number; // value in tradfi positions (Revolut etc.)
  underHurdleValue: number; // on-chain value earning less than the hurdle
  positions: PositionWithApy[];
  recommendations: YieldRecommendation[];
  protocolExposure: Record<string, { valueUsd: number; pct: number }>;
  riskParameters: {
    minTvl: string;
    maxApy: string;
    maxProtocolExposure: string;
    minBaseApyShare: string;
    minDataPoints: number;
    trustedProtocolsOnly: boolean;
    stablecoinHurdle: string;
    ethHurdle: string;
    philosophy: string;
  };
  generatedAt: string;
}

export interface DefiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  apyMean30d: number | null;
  stablecoin: boolean;
  exposure: string;
  count: number;
  predictions: {
    predictedClass: string;
    predictedProbability: number;
    binnedConfidence: number;
  } | null;
  underlyingTokens: string[] | null;
  poolMeta: string | null;
}
