/**
 * `jinn harnesses add` — content-hash binding integration test.
 *
 * Verifies that running `add` on a signed harness package writes an
 * InstalledRecord with manifest+tarball+entry-point hashes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import harnesses from '../../src/cli/commands/harnesses.js';
import { canonicaliseManifest } from '../../src/harnesses/manifest/index.js';
import { computePackageHash } from '../../src/harnesses/external-impls/package-hash.js';
import { readInstalledHarnesses } from '../../src/installed-records.js';
import { makeCommandCtx } from '@test/cli.js';

ed.hashes.sha512 = (m: Uint8Array) => sha512(m);

let TMP: string;
let HOME: string;
let CONFIG_PATH: string;
let PKG_ROOT: string;
let PUBKEY_B64: string;
let SECRET_KEY: Uint8Array;

beforeEach(async () => {
  TMP = mkdtempSync(join(tmpdir(), 'jinn-harnesses-hash-'));
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
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('jinn harnesses add — content-hash binding', () => {
  it('writes an InstalledRecord with all three hashes', async () => {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ trustedImplSigners: [{ alg: 'ed25519', publicKey: PUBKEY_B64 }] }),
    );
    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--config', CONFIG_PATH, '--json'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toHaveLength(0);

    const records = readInstalledHarnesses(HOME);
    expect(records['@fake/harness']).toMatchObject({
      version: '0.1.0',
      manifestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      tarballHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      entryPointHashes: {
        './dist/index.js': expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      tier: 1,
      publishedAttestation: null,
    });
  });

  it('does not write a record when signature check fails', async () => {
    // No trusted signers — add should fail before writing the record.
    writeFileSync(CONFIG_PATH, JSON.stringify({ trustedImplSigners: [] }));
    const made = makeCommandCtx({
      argv: ['add', PKG_ROOT, '--config', CONFIG_PATH, '--json'],
      env: { JINN_HOME: HOME },
    });
    await harnesses.run(made.ctx);

    expect(made.exits).toContain(1);
    const records = readInstalledHarnesses(HOME);
    expect(records['@fake/harness']).toBeUndefined();
  });
});
