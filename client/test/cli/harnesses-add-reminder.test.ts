/**
 * `jinn harnesses add` — abridged install reminder (Task 8.3).
 *
 * Verifies that after a successful add, the abridged disclaimer reminder
 * is printed. Also verifies it prints when --publish is used.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { canonicaliseManifest } from '../../src/harnesses/manifest/index.js';
import { computePackageHash } from '../../src/harnesses/external-impls/package-hash.js';
import { makeCommandCtx } from '@test/cli.js';
import { ABRIDGED_DISCLAIMER } from '../../src/network-trust/disclaimer.js';

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
  TMP = mkdtempSync(join(tmpdir(), 'jinn-harness-reminder-'));
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
    name: '@fake/harness-reminder',
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

describe('jinn harnesses add — abridged install reminder', () => {
  it('prints abridged install reminder after successful add', async () => {
    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--config', CONFIG_PATH],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const combined = made.writes.join('');
    expect(combined).toContain('Reminder: Jinn does not audit third-party code');
    expect(combined).toContain(ABRIDGED_DISCLAIMER.slice(0, 40));
  });

  it('still prints reminder when --publish is used', async () => {
    mockPublishAttestation.mockResolvedValue({ ok: true, txHash: '0xtxhash', cid: 'QmAtt' });

    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--config', CONFIG_PATH, '--publish'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);
    const combined = made.writes.join('');
    expect(combined).toContain('Reminder: Jinn does not audit third-party code');
  });

  it('does NOT print reminder when add fails (untrusted signer)', async () => {
    // Config with no trusted signers — add must fail before emitting success.
    writeFileSync(CONFIG_PATH, JSON.stringify({ trustedImplSigners: [] }));
    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--config', CONFIG_PATH],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toContain(1);
    const combined = made.writes.join('');
    expect(combined).not.toContain('Reminder: Jinn does not audit');
  });
});
