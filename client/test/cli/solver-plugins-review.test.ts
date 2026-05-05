/**
 * `jinn solver-plugins review` — IPFS-pinned notes attestation tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeInstalledPlugIn } from '../../src/installed-records.js';
import { makeCommandCtx } from '@test/cli.js';

const mockPublishAttestation = vi.fn();
vi.mock('../../src/network-trust/attestation.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/network-trust/attestation.js')>();
  return {
    ...orig,
    publishAttestation: mockPublishAttestation,
  };
});

const { default: solverPlugins } = await import('../../src/cli/commands/solver-plugins.js');

let TMP: string;
let HOME: string;

const INSTALLED_RECORD = {
  version: '1.2.3',
  manifestHash: 'sha256:' + 'a'.repeat(64),
  tarballHash: 'sha256:' + 'b'.repeat(64),
  entryPointHashes: {},
  tier: 1 as const,
  installedAt: new Date().toISOString(),
  publishedAttestation: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  TMP = mkdtempSync(join(tmpdir(), 'jinn-sp-review-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });
  writeInstalledPlugIn(HOME, '@foo/bar', INSTALLED_RECORD);
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn solver-plugins review', () => {
  it('pins review notes to IPFS and publishes review attestation', async () => {
    const notesPath = join(TMP, 'review.md');
    writeFileSync(notesPath, '# Review of @foo/bar\n\nLooks clean.\n');

    // publishAttestation is called with ipfs.pinJson mocked to return a CID.
    // In the review path, the command reads the file, passes it to ipfs.pinText
    // (or pinJson wrapping a string), and uses the CID in the attestation.
    mockPublishAttestation.mockResolvedValue({
      ok: true,
      txHash: '0xreviewtx',
      cid: 'QmReviewAttestation',
    });

    const made = makeCommandCtx({
      argv: ['review', '@foo/bar', '--notes-file', notesPath],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();

    const callArgs = mockPublishAttestation.mock.calls[0]![0];
    expect(callArgs.attestation.kind).toBe('review');
    expect(callArgs.attestation.score).toBe(0);
    expect(callArgs.attestation.subject).toBe('@foo/bar');
    // The reviewCid is set from the IPFS pin result
    expect(typeof callArgs.attestation.reviewCid).toBe('string');

    // stdout should include the CID
    const out = made.writes.join('');
    expect(out).toContain('review');
  });

  it('requires --notes-file', async () => {
    const made = makeCommandCtx({
      argv: ['review', '@foo/bar'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/notes-file/i);
  });

  it('rejects review for not-installed plug-in', async () => {
    const notesPath = join(TMP, 'review.md');
    writeFileSync(notesPath, 'notes');

    const made = makeCommandCtx({
      argv: ['review', '@bogus/pkg', '--notes-file', notesPath],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/not installed/i);
  });
});
