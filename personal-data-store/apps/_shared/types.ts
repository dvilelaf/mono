export interface YieldPosition {
  id: string;
  name: string;
  protocol: string;
  chain: string;
  token: string;
  tokenBalance: string;
  tokenPrice: string;
  valueUsd: string;
  apy: string | null;
  snapshotAt: string;
}

export interface IncomeSummary {
  bySource: {
    source: string;
    stream_type: string;
    currency: string;
    entries: number;
    total: string;
  }[];
  byMonth: {
    month: string;
    source: string;
    currency: string;
    total: string;
  }[];
}

export interface Analysis {
  id: string;
  domain: string;
  analysisType: string;
  title: string;
  summary: string | null;
  content: string | null;
  confidence: string | null;
  entities: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  createdAt: string;
}

export interface NewAnalysis {
  domain: string;
  analysisType: string;
  title: string;
  summary?: string;
  content?: string;
  confidence?: string;
  entities?: Record<string, unknown>;
  result?: Record<string, unknown>;
}
