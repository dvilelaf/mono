/**
 * `jinn harnesses endorse/warn/block` — attestation feedback CLI tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
let CONFIG_PATH: string;

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
  TMP = mkdtempSync(join(tmpdir(), 'jinn-harness-feedback-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });
  CONFIG_PATH = join(TMP, 'config.json');
  writeFileSync(CONFIG_PATH, JSON.stringify({}));
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn harnesses endorse', () => {
  it('publishes endorse attestation for an installed harness', async () => {
    writeInstalledHarness(HOME, '@example/forecaster', INSTALLED_RECORD);
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xendorse', cid: 'QmEndorse' });

    const made = makeCommandCtx({
      argv: ['endorse', '@example/forecaster', '--reason', 'solid harness'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();

    const callArgs = mockPublishAttestation.mock.calls[0]![0];
    expect(callArgs.attestation.kind).toBe('endorse');
    expect(callArgs.attestation.subjectType).toBe('harness');
    expect(callArgs.attestation.score).toBe(1);
    expect(callArgs.attestation.subject).toBe('@example/forecaster');
  });

  it('rejects endorse for a not-installed harness', async () => {
    const made = makeCommandCtx({
      argv: ['endorse', '@bogus/harness'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/not installed/i);
  });
});

describe('jinn harnesses warn', () => {
  it('requires --reason', async () => {
    writeInstalledHarness(HOME, '@example/forecaster', INSTALLED_RECORD);

    const made = makeCommandCtx({
      argv: ['warn', '@example/forecaster'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/--reason.*required/i);
  });

  it('publishes warn attestation with score=-1', async () => {
    writeInstalledHarness(HOME, '@example/forecaster', INSTALLED_RECORD);
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xwarn' });

    const made = makeCommandCtx({
      argv: ['warn', '@example/forecaster', '--reason', 'crashes on edge case'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const callArgs = mockPublishAttestation.mock.calls[0]![0];
    expect(callArgs.attestation.kind).toBe('warn');
    expect(callArgs.attestation.score).toBe(-1);
  });
});

describe('jinn harnesses block', () => {
  it('requires --reason', async () => {
    writeInstalledHarness(HOME, '@example/forecaster', INSTALLED_RECORD);

    const made = makeCommandCtx({
      argv: ['block', '@example/forecaster'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toContain(1);
    const out = made.writes.join('');
    expect(out).toMatch(/--reason.*required/i);
  });

  it('publishes block attestation with score=-2 and applies local disable', async () => {
    writeInstalledHarness(HOME, '@example/forecaster', INSTALLED_RECORD);
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xblock' });

    const made = makeCommandCtx({
      argv: ['block', '@example/forecaster', '--reason', 'backdoor found'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const callArgs = mockPublishAttestation.mock.calls[0]![0];
    expect(callArgs.attestation.kind).toBe('block');
    expect(callArgs.attestation.score).toBe(-2);

    // Local disable record should appear in output
    const out = made.writes.join('');
    const parsed = JSON.parse(out.split('\n').find((l) => l.trim().startsWith('{'))!);
    expect(parsed.blocked).toBe('@example/forecaster');
  });

  it('applies local disable even when on-chain publish fails', async () => {
    writeInstalledHarness(HOME, '@example/forecaster', INSTALLED_RECORD);
    mockPublishAttestation.mockResolvedValue({ ok: false, error: 'rpc down' });

    const made = makeCommandCtx({
      argv: ['block', '@example/forecaster', '--reason', 'malware detected'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const out = made.writes.join('');
    const parsed = JSON.parse(out.split('\n').find((l) => l.trim().startsWith('{'))!);
    expect(parsed.blocked).toBe('@example/forecaster');
  });
});
