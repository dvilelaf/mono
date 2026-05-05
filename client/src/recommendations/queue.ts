import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Recommendation {
  ts: string;
  kind: 'plug-in' | 'harness';
  pkg: string;
  version: string;
  reason: string;
  sourceCorpusEntries: string[];
  sessionId: string;
  phase: 'orient' | 'strategize' | 'plan' | 'execute' | 'debrief' | 'improve' | 'memory';
}

export interface WriteOptions {
  dedupeWindowDays?: number;
}

export interface WriteResult {
  written: boolean;
  reason?: string;
}

function queuePath(home: string): string {
  return join(home, '.jinn-client', 'recommendations.jsonl');
}

export function readRecommendations(home: string): Recommendation[] {
  const p = queuePath(home);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Recommendation);
}

function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export function writeRecommendation(
  home: string,
  rec: Recommendation,
  opts: WriteOptions = {},
): WriteResult {
  const dedupeWindowMs = (opts.dedupeWindowDays ?? 7) * 24 * 60 * 60 * 1000;
  const recs = readRecommendations(home);
  const recTime = new Date(rec.ts).getTime();
  const recentDuplicate = recs.find(
    (r) =>
      r.kind === rec.kind &&
      r.pkg === rec.pkg &&
      r.version === rec.version &&
      recTime - new Date(r.ts).getTime() < dedupeWindowMs &&
      setEqual(r.sourceCorpusEntries, rec.sourceCorpusEntries),
  );
  if (recentDuplicate) {
    return { written: false, reason: 'duplicate within dedupe window' };
  }
  const p = queuePath(home);
  mkdirSync(join(home, '.jinn-client'), { recursive: true });
  appendFileSync(p, JSON.stringify(rec) + '\n', 'utf8');
  return { written: true };
}
