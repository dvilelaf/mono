/**
 * `jinn harnesses feedback list` — on-chain attestation reader tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCommandCtx } from '@test/cli.js';

const mockPublishAttestation = vi.fn();
vi.mock('../../src/network-trust/attestation.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/network-trust/attestation.js')>();
  return { ...orig, publishAttestation: mockPublishAttestation };
});

const { default: harnesses } = await import('../../src/cli/commands/harnesses.js');

let TMP: string;
let HOME: string;

beforeEach(() => {
  vi.clearAllMocks();
  TMP = mkdtempSync(join(tmpdir(), 'jinn-harness-fbl-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn harnesses feedback list', () => {
  it('requires a subject name', async () => {
    const made = makeCommandCtx({
      argv: ['feedback', 'list'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/subject|name|required|usage/i);
  });

  it('returns empty results when no followedAttestors configured', async () => {
    const made = makeCommandCtx({
      argv: ['feedback', 'list', '@example/forecaster'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    // Should not error
    const out = made.writes.join('');
    expect(out).toBeTruthy();
    // JSON envelope should show attestationCount = 0
    const envelope = JSON.parse(out.split('\n').find((l) => l.trim().startsWith('{'))!);
    expect(envelope.attestationCount).toBe(0);
    expect(envelope.note).toMatch(/no followed/i);
  });

  it('applies most-recent-wins via resolveCurrentVerdict', async () => {
    const { resolveCurrentVerdict } = await import('../../src/network-trust/most-recent-wins.js');

    const atts = [
      {
        attestor: '0xB',
        subject: '@example/forecaster',
        subjectType: 'harness' as const,
        version: '0.1.0',
        manifestHash: 'sha256:aaa',
        tarballHash: 'sha256:bbb',
        tier: 1 as const,
        kind: 'endorse' as const,
        score: 1 as const,
        reason: 'solid',
        reviewCid: '',
        attestedAt: 1000,
      },
      {
        attestor: '0xB',
        subject: '@example/forecaster',
        subjectType: 'harness' as const,
        version: '0.1.0',
        manifestHash: 'sha256:aaa',
        tarballHash: 'sha256:bbb',
        tier: 1 as const,
        kind: 'warn' as const,
        score: -1 as const,
        reason: 'found issue',
        reviewCid: '',
        attestedAt: 2000,
      },
    ];

    const result = resolveCurrentVerdict(atts);
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe('warn'); // newer wins
  });
});
