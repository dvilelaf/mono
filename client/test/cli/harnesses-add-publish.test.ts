/**
 * `jinn harnesses add --publish` — attestation publish integration tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { canonicaliseManifest } from '../../src/harnesses/manifest/index.js';
import { computePackageHash } from '../../src/harnesses/external-impls/package-hash.js';
import { readInstalledHarnesses } from '../../src/installed-records.js';
import { makeCommandCtx } from '@test/cli.js';

ed.hashes.sha512 = (m: Uint8Array) => sha512(m);

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
let PKG_ROOT: string;
let PUBKEY_B64: string;
let SECRET_KEY: Uint8Array;

beforeEach(async () => {
  vi.clearAllMocks();
  TMP = mkdtempSync(join(tmpdir(), 'jinn-harness-publish-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });
  CONFIG_PATH = join(TMP, 'config.json');

  PKG_ROOT = join(TMP, 'fake-impl');
  mkdirSync(join(PKG_ROOT, 'dist'), { recursive: true });
  writeFileSync(
    join(PKG_ROOT, 'dist', 'index.js'),
    'export default function (env) { return { name: env.implName, version: env.implVersion, supports: () => false, run: async () => ({}) }; }',
  );

  SECRET_KEY = ed.utils.randomSecretKey();
  const pk = await ed.getPublicKeyAsync(SECRET_KEY);
  PUBKEY_B64 = Buffer.from(pk).toString('base64');

  const packageHash = computePackageHash(PKG_ROOT);
  const manifest = {
    schemaVersion: '1.0.0' as const,
    name: '@fake/harness',
    version: '0.1.0',
    supportedSolverTypes: ['prediction.v0>=1.0.0'],
    entry: './dist/index.js',
    package: { cid: 'bafyfake', hash: packageHash },
    capabilities: {},
    signature: { alg: 'ed25519' as const, publicKey: PUBKEY_B64, sig: '' },
  };
  const sig = await ed.signAsync(
    new TextEncoder().encode(canonicaliseManifest(manifest)),
    SECRET_KEY,
  );
  manifest.signature.sig = Buffer.from(sig).toString('base64');
  writeFileSync(join(PKG_ROOT, 'jinn.manifest.json'), JSON.stringify(manifest, null, 2));

  writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ trustedImplSigners: [{ alg: 'ed25519', publicKey: PUBKEY_B64 }] }),
  );
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn harnesses add --publish', () => {
  it('publishes installed attestation when --publish is set', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xtxhash', cid: 'QmHarness' });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--config', CONFIG_PATH, '--publish'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();

    const records = readInstalledHarnesses(HOME);
    expect(records['@fake/harness']?.publishedAttestation).toBe('0xtxhash');
  });

  it('logs warning but does not fail install when publishAttestation returns ok=false', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: false, error: 'giveFeedback failed: contract revert' });

    const stderrCalls: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrCalls.push(String(chunk));
      return true;
    });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--config', CONFIG_PATH, '--publish'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);
    stderrSpy.mockRestore();

    expect(made.exits).toHaveLength(0);
    const records = readInstalledHarnesses(HOME);
    expect(records['@fake/harness']).toBeDefined();
    expect(records['@fake/harness']?.publishedAttestation).toBeNull();

    expect(stderrCalls.join('')).toMatch(/attestation publish failed/i);
  });

  it('does NOT publish when neither --publish flag nor env is set', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xtxhash' });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--config', CONFIG_PATH],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).not.toHaveBeenCalled();
    const records = readInstalledHarnesses(HOME);
    expect(records['@fake/harness']?.publishedAttestation).toBeNull();
  });

  it('respects JINN_PUBLISH_INSTALL_ATTESTATIONS env var without --publish flag', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xtxhash', cid: 'QmEnv' });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--config', CONFIG_PATH],
      env: { JINN_HOME: HOME, JINN_PUBLISH_INSTALL_ATTESTATIONS: '1' },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    expect(mockPublishAttestation).toHaveBeenCalledOnce();
    const records = readInstalledHarnesses(HOME);
    expect(records['@fake/harness']?.publishedAttestation).toBe('0xtxhash');
  });
});
