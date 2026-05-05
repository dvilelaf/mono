/**
 * Handler for the recommend_plugin / recommend_harness MCP tools.
 *
 * Separated from server.ts so it can be tested without starting the full MCP
 * server process (same pattern as acquire-artifact.ts).
 */

import { homedir } from 'node:os';
import { writeRecommendation } from '../recommendations/queue.js';
import type { Recommendation } from '../recommendations/queue.js';

export type RecommendKind = 'plug-in' | 'harness';

export type RecommendPhase = 'orient' | 'strategize' | 'plan' | 'execute' | 'debrief' | 'improve' | 'memory';

export interface RecommendInput {
  kind: RecommendKind;
  pkg: string;
  version: string;
  reason: string;
  sourceCorpusEntries: string[];
  phase: RecommendPhase;
}

export interface RecommendResult {
  written: boolean;
  reason?: string;
}

export interface RecommendToolOptions {
  /** Home directory override (JINN_HOME env var). Defaults to os.homedir(). */
  home?: string;
  /** Session id (JINN_SESSION_ID env var). Defaults to empty string. */
  sessionId?: string;
  /** Rolling-window dedupe in days (recommendationsDedupeWindowDays from config). Defaults to 7. */
  dedupeWindowDays?: number;
}

export function handleRecommend(
  input: RecommendInput,
  opts: RecommendToolOptions = {},
): RecommendResult {
  const home = opts.home ?? homedir();
  const sessionId = opts.sessionId ?? '';
  const dedupeWindowDays = opts.dedupeWindowDays ?? 7;

  const rec: Recommendation = {
    ts: new Date().toISOString(),
    kind: input.kind,
    pkg: input.pkg,
    version: input.version,
    reason: input.reason,
    sourceCorpusEntries: input.sourceCorpusEntries,
    sessionId,
    phase: input.phase,
  };

  return writeRecommendation(home, rec, { dedupeWindowDays });
}
