/**
 * `jinn solver-plugins add --publish` — attestation publish integration tests.
 *
 * Uses vi.mock to intercept publishAttestation so the CLI test doesn't need
 * real IPFS / on-chain infrastructure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInstalledPlugIns } from '../../src/installed-records.js';
import { makeCommandCtx } from '@test/cli.js';

// Mock publishAttestation before importing the command.
const mockPublishAttestation = vi.fn();
vi.mock('../../src/network-trust/attestation.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/network-trust/attestation.js')>();
  return {
    ...orig,
    publishAttestation: mockPublishAttestation,
  };
});

// Import after vi.mock is set up.
const { default: solverPlugins } = await import('../../src/cli/commands/solver-plugins.js');

let TMP: string;
let HOME: string;
let PKG_ROOT: string;

beforeEach(() => {
  vi.clearAllMocks();
  TMP = mkdtempSync(join(tmpdir(), 'jinn-sp-publish-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });

  PKG_ROOT = join(TMP, 'my-plugin');
  mkdirSync(join(PKG_ROOT, 'skills', 'base-rate'), { recursive: true });
  writeFileSync(join(PKG_ROOT, 'skills', 'base-rate', 'SKILL.md'), '# Base Rate');
  writeFileSync(
    join(PKG_ROOT, 'jinn.plugin.json'),
    JSON.stringify({
      name: '@foo/bar',
      version: '1.2.3',
      description: 'Test plugin',
      jinn: {
        supports: ['prediction.v1'],
        skills: ['skills/base-rate/SKILL.md'],
      },
    }),
  );
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn solver-plugins add --publish', () => {
  it('publishes installed attestation when --publish is set', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xtxhash', cid: 'QmAttestation' });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--publish'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();

    const records = readInstalledPlugIns(HOME);
    expect(records['@foo/bar']?.publishedAttestation).toBe('0xtxhash');
  });

  it('logs warning but does not fail install when publishAttestation returns ok=false', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: false, error: 'giveFeedback failed: rpc unreachable' });

    const stderrCalls: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrCalls.push(String(chunk));
      return true;
    });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--publish'],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    stderrSpy.mockRestore();

    // Install should succeed
    expect(made.exits).toHaveLength(0);

    const records = readInstalledPlugIns(HOME);
    expect(records['@foo/bar']).toBeDefined();
    // publishedAttestation is null on failure
    expect(records['@foo/bar']?.publishedAttestation).toBeNull();

    // Warning should have been emitted to stderr
    expect(stderrCalls.join('')).toMatch(/attestation publish failed/i);
  });

  it('does NOT publish when neither --publish flag nor env is set', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xtxhash', cid: 'Qm' });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT],
      env: { JINN_HOME: HOME },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).not.toHaveBeenCalled();

    const records = readInstalledPlugIns(HOME);
    expect(records['@foo/bar']?.publishedAttestation).toBeNull();
  });

  it('respects JINN_PUBLISH_INSTALL_ATTESTATIONS env var without --publish flag', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xtxhash', cid: 'QmEnv' });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT],
      env: { JINN_HOME: HOME, JINN_PUBLISH_INSTALL_ATTESTATIONS: '1' },
    });
    await solverPlugins.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();

    const records = readInstalledPlugIns(HOME);
    expect(records['@foo/bar']?.publishedAttestation).toBe('0xtxhash');
  });
});
