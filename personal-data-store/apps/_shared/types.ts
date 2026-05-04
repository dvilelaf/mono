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

export interface PdsDocument {
  id: string;
  domain: string;
  type: string | null;
  title: string | null;
  content: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewPdsDocument {
  domain: string;
  type?: string;
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}
