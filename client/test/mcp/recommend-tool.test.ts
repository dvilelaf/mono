/**
 * recommend_plugin / recommend_harness MCP tool handler tests.
 *
 * Tests the handler logic directly (same pattern as acquire-artifact-fast-path.test.ts)
 * without starting the full MCP server subprocess.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleRecommend } from '@/mcp/recommend-tool.js';
import { readRecommendations } from '@/recommendations/queue.js';

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'jinn-mcp-rec-'));
}

const baseInput = {
  pkg: '@acme/forecaster',
  version: '2.0.0',
  reason: 'observed in 8 successful prediction.v0 attempts',
  sourceCorpusEntries: ['envelope:bafy1', 'envelope:bafy2'],
  phase: 'improve' as const,
};

describe('handleRecommend (plug-in)', () => {
  it('writes entry to recommendations.jsonl and returns written:true', () => {
    const home = tempHome();
    const result = handleRecommend(
      { kind: 'plug-in', ...baseInput },
      { home, sessionId: 'sess-001', dedupeWindowDays: 7 },
    );
    expect(result.written).toBe(true);
    const recs = readRecommendations(home);
    expect(recs).toHaveLength(1);
    expect(recs[0].pkg).toBe('@acme/forecaster');
    expect(recs[0].kind).toBe('plug-in');
    expect(recs[0].sessionId).toBe('sess-001');
    expect(recs[0].ts).toBeTruthy();
  });

  it('returns written:false for duplicate within window', () => {
    const home = tempHome();
    // Write once
    handleRecommend(
      { kind: 'plug-in', ...baseInput },
      { home, sessionId: 'sess-001', dedupeWindowDays: 7 },
    );
    // Immediately try again with same entries
    const result = handleRecommend(
      { kind: 'plug-in', ...baseInput },
      { home, sessionId: 'sess-002', dedupeWindowDays: 7 },
    );
    expect(result.written).toBe(false);
    expect(result.reason).toMatch(/duplicate/i);
    expect(readRecommendations(home)).toHaveLength(1);
  });
});

describe('handleRecommend (harness)', () => {
  it('writes harness recommendation separately from plug-in recommendations', () => {
    const home = tempHome();
    handleRecommend(
      { kind: 'plug-in', ...baseInput },
      { home, sessionId: 'sess-001' },
    );
    handleRecommend(
      { kind: 'harness', ...baseInput, pkg: '@acme/harness' },
      { home, sessionId: 'sess-001' },
    );
    const recs = readRecommendations(home);
    expect(recs).toHaveLength(2);
    expect(recs.filter((r) => r.kind === 'plug-in')).toHaveLength(1);
    expect(recs.filter((r) => r.kind === 'harness')).toHaveLength(1);
  });

  it('does not conflate plug-in and harness dedupe keys for same pkg', () => {
    const home = tempHome();
    // Same pkg name, different kind — both should write
    handleRecommend({ kind: 'plug-in', ...baseInput }, { home });
    const result = handleRecommend({ kind: 'harness', ...baseInput }, { home });
    expect(result.written).toBe(true);
    expect(readRecommendations(home)).toHaveLength(2);
  });
});
