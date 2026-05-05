/**
 * `jinn solver-plugins recommendations` and `jinn harnesses recommendations` tests.
 *
 * Tests the recommendations subcommand for both commands, verifying filtering
 * by kind, output formatting, and the empty-state message.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRecommendation } from '@/recommendations/queue.js';
import solverPlugins from '@/cli/commands/solver-plugins.js';
import harnesses from '@/cli/commands/harnesses.js';
import { makeCommandCtx } from '@test/cli.js';

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'jinn-cli-rec-'));
}

const pluginRec = {
  kind: 'plug-in' as const,
  pkg: '@acme/calibration-refiner',
  version: '1.2.3',
  reason: 'observed in 12 successful prediction.v0 attempts in the followed corpus',
  sourceCorpusEntries: ['envelope:bafy1', 'envelope:bafy2', 'envelope:bafy3'],
  sessionId: 'sess-001',
  phase: 'improve' as const,
  ts: '2026-05-04T12:00:00.000Z',
};

const harnessRec = {
  kind: 'harness' as const,
  pkg: '@acme/harness-builder',
  version: '3.1.0',
  reason: 'consistently achieved lower Brier scores across 5 debrief sessions',
  sourceCorpusEntries: ['envelope:bafyA', 'envelope:bafyB'],
  sessionId: 'sess-002',
  phase: 'debrief' as const,
  ts: '2026-05-04T13:00:00.000Z',
};

describe('jinn solver-plugins recommendations', () => {
  it('prints pending plug-in recommendations', async () => {
    const home = tempHome();
    writeRecommendation(home, pluginRec);
    writeRecommendation(home, harnessRec); // should NOT appear

    const made = makeCommandCtx({
      argv: ['recommendations'],
      env: { JINN_HOME: home },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toContain('@acme/calibration-refiner');
    expect(out).toContain('1.2.3');
    expect(out).toContain('jinn solver-plugins add');
    // Harness rec must NOT appear
    expect(out).not.toContain('@acme/harness-builder');
  });

  it('prints "No recommendations to review." when empty', async () => {
    const home = tempHome();
    const made = makeCommandCtx({
      argv: ['recommendations'],
      env: { JINN_HOME: home },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(made.writes.join('')).toContain('No recommendations to review.');
  });

  it('respects --limit flag', async () => {
    const home = tempHome();
    for (let i = 0; i < 5; i++) {
      writeRecommendation(home, {
        ...pluginRec,
        pkg: `@acme/plugin-${i}`,
        ts: `2026-05-0${i + 1}T12:00:00.000Z`,
        sourceCorpusEntries: [`envelope:bafy${i}`],
      });
    }

    const made = makeCommandCtx({
      argv: ['recommendations', '--limit', '2'],
      env: { JINN_HOME: home },
    });
    await solverPlugins.run(made.ctx);

    // Should show at most 2 entries
    const out = made.writes.join('');
    const matches = (out.match(/jinn solver-plugins add/g) ?? []).length;
    expect(matches).toBeLessThanOrEqual(2);
  });

  it('respects --since flag', async () => {
    const home = tempHome();
    writeRecommendation(home, { ...pluginRec, ts: '2026-04-01T00:00:00.000Z', pkg: '@acme/old-plugin', sourceCorpusEntries: ['envelope:old'] });
    writeRecommendation(home, { ...pluginRec, ts: '2026-05-04T00:00:00.000Z', pkg: '@acme/new-plugin', sourceCorpusEntries: ['envelope:new'] });

    const made = makeCommandCtx({
      argv: ['recommendations', '--since', '2026-05-01T00:00:00.000Z'],
      env: { JINN_HOME: home },
    });
    await solverPlugins.run(made.ctx);

    const out = made.writes.join('');
    expect(out).toContain('@acme/new-plugin');
    expect(out).not.toContain('@acme/old-plugin');
  });
});

describe('jinn harnesses recommendations', () => {
  it('prints pending harness recommendations only', async () => {
    const home = tempHome();
    writeRecommendation(home, pluginRec); // should NOT appear
    writeRecommendation(home, harnessRec);

    const made = makeCommandCtx({
      argv: ['recommendations'],
      env: { JINN_HOME: home },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    expect(out).toContain('@acme/harness-builder');
    expect(out).toContain('3.1.0');
    expect(out).toContain('jinn harnesses add');
    // Plug-in rec must NOT appear
    expect(out).not.toContain('@acme/calibration-refiner');
  });

  it('prints "No recommendations to review." when empty', async () => {
    const home = tempHome();
    const made = makeCommandCtx({
      argv: ['recommendations'],
      env: { JINN_HOME: home },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(made.writes.join('')).toContain('No recommendations to review.');
  });
});
