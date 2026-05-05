/**
 * `jinn harnesses review` — IPFS-pinned notes attestation tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeInstalledHarness } from '../../src/installed-records.js';
import { makeCommandCtx } from '@test/cli.js';

const mockPublishAttestation = vi.fn();
vi.mock('../../src/network-trust/attestation.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/network-trust/attestation.js')>();
  return {
    ...orig,
    publishAttestation: mockPublishAttestation,
  };
});

const { default: harnesses } = await import('../../src/cli/commands/harnesses.js');

let TMP: string;
let HOME: string;

const INSTALLED_RECORD = {
  version: '0.1.0',
  manifestHash: 'sha256:' + 'a'.repeat(64),
  tarballHash: 'sha256:' + 'b'.repeat(64),
  entryPointHashes: {},
  tier: 1 as const,
  installedAt: new Date().toISOString(),
  publishedAttestation: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  TMP = mkdtempSync(join(tmpdir(), 'jinn-harness-review-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });
  writeInstalledHarness(HOME, '@example/forecaster', INSTALLED_RECORD);
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn harnesses review', () => {
  it('pins review notes to IPFS and publishes review attestation', async () => {
    const notesPath = join(TMP, 'review.md');
    writeFileSync(notesPath, '# Review of @example/forecaster\n\nLooks solid.\n');

    mockPublishAttestation.mockResolvedValue({
      ok: true,
      txHash: '0xreviewtx',
      cid: 'QmHarnessReview',
    });

    const made = makeCommandCtx({
      argv: ['review', '@example/forecaster', '--notes-file', notesPath],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();

    const callArgs = mockPublishAttestation.mock.calls[0]![0];
    expect(callArgs.attestation.kind).toBe('review');
    expect(callArgs.attestation.subjectType).toBe('harness');
    expect(callArgs.attestation.score).toBe(0);
  });

  it('requires --notes-file', async () => {
    const made = makeCommandCtx({
      argv: ['review', '@example/forecaster'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/notes-file/i);
  });
});
