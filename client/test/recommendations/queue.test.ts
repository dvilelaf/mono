import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRecommendation, readRecommendations, type Recommendation } from '@/recommendations/queue.js';

const baseRec: Omit<Recommendation, 'ts'> = {
  kind: 'plug-in',
  pkg: '@foo/bar',
  version: '1.2.3',
  reason: 'observed in 12 successful prediction.v0 attempts',
  sourceCorpusEntries: ['envelope:bafy1', 'envelope:bafy2'],
  sessionId: 'session-abc',
  phase: 'improve',
};

describe('recommendations queue', () => {
  it('appends a recommendation to recommendations.jsonl', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    writeRecommendation(home, { ...baseRec, ts: '2026-05-05T12:00:00.000Z' });
    const recs = readRecommendations(home);
    expect(recs).toHaveLength(1);
    expect(recs[0].pkg).toBe('@foo/bar');
  });

  it('returns empty when file missing', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    expect(readRecommendations(home)).toEqual([]);
  });

  it('dedupes within rolling window when source-corpus-entries unchanged', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    writeRecommendation(home, { ...baseRec, ts: '2026-05-01T12:00:00.000Z' });
    const result = writeRecommendation(
      home,
      { ...baseRec, ts: '2026-05-04T12:00:00.000Z' },
      { dedupeWindowDays: 7 },
    );
    expect(result.written).toBe(false);
    expect(result.reason).toMatch(/duplicate/i);
    expect(readRecommendations(home)).toHaveLength(1);
  });

  it('writes when source-corpus-entries change materially', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    writeRecommendation(home, {
      ...baseRec,
      ts: '2026-05-01T00:00:00Z',
      sourceCorpusEntries: ['envelope:1'],
    });
    const result = writeRecommendation(
      home,
      {
        ...baseRec,
        ts: '2026-05-02T00:00:00Z',
        sourceCorpusEntries: ['envelope:1', 'envelope:2', 'envelope:3'],
      },
      { dedupeWindowDays: 7 },
    );
    expect(result.written).toBe(true);
    expect(readRecommendations(home)).toHaveLength(2);
  });

  it('writes after the dedupe window expires', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    writeRecommendation(home, { ...baseRec, ts: '2026-04-01T00:00:00Z' });
    const result = writeRecommendation(
      home,
      { ...baseRec, ts: '2026-05-01T00:00:00Z' },
      { dedupeWindowDays: 7 },
    );
    expect(result.written).toBe(true);
  });

  it('handles harness recommendations the same way', () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    writeRecommendation(home, {
      ...baseRec,
      kind: 'harness',
      pkg: '@foo/harness',
      ts: '2026-05-05T12:00:00Z',
    });
    expect(readRecommendations(home).find((r) => r.kind === 'harness')).toBeDefined();
  });
});
