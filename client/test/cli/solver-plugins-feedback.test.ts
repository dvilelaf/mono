/**
 * `jinn solver-plugins endorse/warn/block` — attestation feedback CLI tests.
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
  TMP = mkdtempSync(join(tmpdir(), 'jinn-sp-feedback-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn solver-plugins endorse', () => {
  it('publishes endorse attestation against an installed plug-in', async () => {
    writeInstalledPlugIn(HOME, '@foo/bar', INSTALLED_RECORD);
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xendorse', cid: 'QmEndorse' });

    const made = makeCommandCtx({
      argv: ['endorse', '@foo/bar', '--reason', 'works well'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();

    const callArgs = mockPublishAttestation.mock.calls[0]![0];
    expect(callArgs.attestation.kind).toBe('endorse');
    expect(callArgs.attestation.score).toBe(1);
    expect(callArgs.attestation.subject).toBe('@foo/bar');
    expect(callArgs.attestation.version).toBe('1.2.3');
    expect(callArgs.attestation.reason).toBe('works well');

    const out = made.writes.join('');
    expect(out).toContain('endorse');
  });

  it('rejects endorse for a not-installed plug-in', async () => {
    const made = makeCommandCtx({
      argv: ['endorse', '@bogus/pkg'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/not installed/i);
  });

  it('succeeds without --reason (reason is optional for endorse)', async () => {
    writeInstalledPlugIn(HOME, '@foo/bar', INSTALLED_RECORD);
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xendorse' });

    const made = makeCommandCtx({
      argv: ['endorse', '@foo/bar'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();
    const callArgs = mockPublishAttestation.mock.calls[0]![0];
    expect(callArgs.attestation.reason).toBe('');
  });
});

describe('jinn solver-plugins warn', () => {
  it('requires --reason', async () => {
    writeInstalledPlugIn(HOME, '@foo/bar', INSTALLED_RECORD);

    const made = makeCommandCtx({
      argv: ['warn', '@foo/bar'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/--reason.*required/i);
  });

  it('publishes warn attestation with score=-1', async () => {
    writeInstalledPlugIn(HOME, '@foo/bar', INSTALLED_RECORD);
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xwarn', cid: 'QmWarn' });

    const made = makeCommandCtx({
      argv: ['warn', '@foo/bar', '--reason', 'subtle bug in v1.2.3'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();

    const callArgs = mockPublishAttestation.mock.calls[0]![0];
    expect(callArgs.attestation.kind).toBe('warn');
    expect(callArgs.attestation.score).toBe(-1);
    expect(callArgs.attestation.reason).toBe('subtle bug in v1.2.3');
  });
});

describe('jinn solver-plugins block', () => {
  it('requires --reason', async () => {
    writeInstalledPlugIn(HOME, '@foo/bar', INSTALLED_RECORD);

    const made = makeCommandCtx({
      argv: ['block', '@foo/bar'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/--reason.*required/i);
  });

  it('publishes block attestation with score=-2', async () => {
    writeInstalledPlugIn(HOME, '@foo/bar', INSTALLED_RECORD);
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xblock', cid: 'QmBlock' });

    const made = makeCommandCtx({
      argv: ['block', '@foo/bar', '--reason', 'verified malware'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();

    const callArgs = mockPublishAttestation.mock.calls[0]![0];
    expect(callArgs.attestation.kind).toBe('block');
    expect(callArgs.attestation.score).toBe(-2);
  });

  it('applies local disable to learnerPlugIns disabled list even when bridge fails', async () => {
    writeInstalledPlugIn(HOME, '@foo/bar', INSTALLED_RECORD);
    mockPublishAttestation.mockResolvedValue({ ok: false, error: 'rpc down' });

    const made = makeCommandCtx({
      argv: ['block', '@foo/bar', '--reason', 'malicious code detected'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    // Should exit 0 (local disable succeeded)
    expect(made.exits).toHaveLength(0);

    // The output should indicate local disable applied
    const out = made.writes.join('');
    const parsed = JSON.parse(out.split('\n').find((l) => l.trim().startsWith('{'))!);
    expect(parsed.blocked).toBe('@foo/bar');
  });
});
