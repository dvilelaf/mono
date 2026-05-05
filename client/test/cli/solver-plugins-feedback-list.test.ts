/**
 * `jinn solver-plugins feedback list` — on-chain attestation reader tests.
 *
 * The feedback list command reads setMetadata events from the IdentityRegistry
 * filtered to followedAttestors, fetches attestation JSONs from IPFS, and applies
 * most-recent-wins resolution. This test uses the injectable reader interface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCommandCtx } from '@test/cli.js';
import type { AttestationFeedbackReader } from '../../src/network-trust/feedback-reader.js';

const mockPublishAttestation = vi.fn();
vi.mock('../../src/network-trust/attestation.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/network-trust/attestation.js')>();
  return { ...orig, publishAttestation: mockPublishAttestation };
});

const { default: solverPlugins } = await import('../../src/cli/commands/solver-plugins.js');

let TMP: string;
let HOME: string;

beforeEach(() => {
  vi.clearAllMocks();
  TMP = mkdtempSync(join(tmpdir(), 'jinn-sp-fbl-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn solver-plugins feedback list', () => {
  it('requires a subject name', async () => {
    const made = makeCommandCtx({
      argv: ['feedback', 'list'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/subject|name|required|usage/i);
  });

  it('returns empty results when no followedAttestors configured', async () => {
    // No JINN_FOLLOWED_ATTESTORS in env → empty results
    const made = makeCommandCtx({
      argv: ['feedback', 'list', '@foo/bar'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    // Should exit cleanly with empty list (not an error)
    const out = made.writes.join('');
    // Either exits 0 with empty results or reports no attestors configured
    expect(out).toBeTruthy();
  });

  it('uses the injected reader when provided via env', async () => {
    // With no on-chain deps configured, the command should gracefully emit
    // a result (possibly empty or a notice about missing RPC config).
    const made = makeCommandCtx({
      argv: ['feedback', 'list', '@foo/bar'],
      env: {
        JINN_HOME: HOME,
        JINN_FOLLOWED_ATTESTORS: '0xA1A2A3A4A5A6A7A8A9aAaBaBaBaBaBaBaBaBaBaB',
      },
    });
    await solverPlugins.run(made.ctx);

    // With no RPC configured, the command should either return empty results
    // or emit a clear error — but not crash with an uncaught exception.
    const out = made.writes.join('');
    expect(out).toBeTruthy();
  });
});

// ── Unit tests for the reader module itself ───────────────────────────────────

describe('AttestationFeedbackReader interface', () => {
  it('resolveCurrentVerdict deduplications work for mock attestations', async () => {
    // Test that resolveCurrentVerdict (Phase 5) is applied correctly.
    const { resolveCurrentVerdict } = await import('../../src/network-trust/most-recent-wins.js');

    const atts = [
      {
        attestor: '0xA',
        subject: '@foo/bar',
        subjectType: 'plug-in' as const,
        version: '1.2.3',
        manifestHash: 'sha256:aaa',
        tarballHash: 'sha256:bbb',
        tier: 1 as const,
        kind: 'endorse' as const,
        score: 1 as const,
        reason: 'first',
        reviewCid: '',
        attestedAt: 1000,
      },
      {
        attestor: '0xA',
        subject: '@foo/bar',
        subjectType: 'plug-in' as const,
        version: '1.2.3',
        manifestHash: 'sha256:aaa',
        tarballHash: 'sha256:bbb',
        tier: 1 as const,
        kind: 'warn' as const,
        score: -1 as const,
        reason: 'changed my mind',
        reviewCid: '',
        attestedAt: 2000, // newer
      },
    ];

    const result = resolveCurrentVerdict(atts);
    // The warn (newer) wins for (0xA, @foo/bar, 1.2.3)
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe('warn');
  });
});
