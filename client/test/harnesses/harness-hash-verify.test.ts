/**
 * Harness content-hash verification at external-impl load time.
 *
 * Tests that `loadExternalImpl` refuses a harness whose install record does
 * not match the on-disk content, and succeeds when content matches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { canonicaliseManifest } from '../../src/harnesses/manifest/index.js';
import { loadExternalImpl } from '../../src/harnesses/external-impls/loader.js';
import { computePackageHash } from '../../src/harnesses/external-impls/package-hash.js';
import {
  computeManifestHash,
  computeEntryPointHashes,
} from '../../src/harnesses/manifest/content-hash.js';
import { writeInstalledHarness } from '../../src/installed-records.js';

ed.hashes.sha512 = (m: Uint8Array) => sha512(m);

let TMP: string;
let HOME: string;
let PKG_ROOT: string;
let PUBKEY_B64: string;
let SECRET_KEY: Uint8Array;
// The signed manifest object (with correct package hash).
let signedManifest: {
  schemaVersion: '1.0.0';
  name: string;
  version: string;
  supportedSolverTypes: string[];
  entry: string;
  package: { cid: string; hash: `sha256:${string}` };
  capabilities: object;
  signature: { alg: 'ed25519'; publicKey: string; sig: string };
};

const TRUSTED_SIGNERS = () => [{ alg: 'ed25519' as const, publicKey: PUBKEY_B64 }];
const ENV = () => ({
  implName: '@verify/harness',
  implVersion: '1.0.0',
  network: 'base',
  implStateDir: TMP,
  secrets: Object.freeze({}),
  log: () => {},
  stub: false,
});

beforeEach(async () => {
  TMP = mkdtempSync(join(tmpdir(), 'jinn-harness-verify-'));
  HOME = join(TMP, 'home');
  mkdirSync(HOME, { recursive: true });

  PKG_ROOT = join(TMP, 'verify-harness');
  mkdirSync(join(PKG_ROOT, 'dist'), { recursive: true });
  writeFileSync(
    join(PKG_ROOT, 'dist', 'index.js'),
    `export default function (env) {
      return {
        name: env.implName,
        version: env.implVersion,
        supports: ({ solverType }) => solverType === 'prediction.v0',
        run: async () => ({ venueRef: { name: 'verify' }, gating: {} }),
      };
    }`,
  );

  SECRET_KEY = ed.utils.randomSecretKey();
  const pk = await ed.getPublicKeyAsync(SECRET_KEY);
  PUBKEY_B64 = Buffer.from(pk).toString('base64');

  const packageHash = computePackageHash(PKG_ROOT);
  const manifest = {
    schemaVersion: '1.0.0' as const,
    name: '@verify/harness',
    version: '1.0.0',
    supportedSolverTypes: ['prediction.v0>=1.0.0'],
    entry: './dist/index.js',
    package: { cid: 'bafyfake', hash: packageHash },
    capabilities: {},
    signature: { alg: 'ed25519' as const, publicKey: PUBKEY_B64, sig: '' },
  };
  const body = canonicaliseManifest(manifest);
  const sig = await ed.signAsync(new TextEncoder().encode(body), SECRET_KEY);
  manifest.signature.sig = Buffer.from(sig).toString('base64');
  writeFileSync(join(PKG_ROOT, 'jinn.manifest.json'), JSON.stringify(manifest, null, 2));
  signedManifest = manifest;
});

afterEach(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('loadExternalImpl — content-hash verification (Task 3.6)', () => {
  it('returns impl-content-hash-missing when no install record exists', async () => {
    const result = await loadExternalImpl({
      entry: { name: '@verify/harness', entry: PKG_ROOT },
      trustedSigners: TRUSTED_SIGNERS(),
      env: ENV(),
      home: HOME,
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.reason).toBe('impl-content-hash-missing');
      expect(result.detail).toContain('no install record');
      expect(result.detail).toContain('jinn harnesses add');
    }
  });

  it('loads successfully when the install record matches on-disk content', async () => {
    writeInstalledHarness(HOME, '@verify/harness', {
      version: '1.0.0',
      manifestHash: computeManifestHash(signedManifest),
      tarballHash: 'sha256:' + '0'.repeat(64),
      entryPointHashes: computeEntryPointHashes(PKG_ROOT, ['./dist/index.js']),
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });
    const result = await loadExternalImpl({
      entry: { name: '@verify/harness', entry: PKG_ROOT },
      trustedSigners: TRUSTED_SIGNERS(),
      env: ENV(),
      home: HOME,
    });
    expect(result.kind).toBe('ok');
  });

  it('returns impl-content-hash-mismatch when manifest hash in record is wrong', async () => {
    writeInstalledHarness(HOME, '@verify/harness', {
      version: '1.0.0',
      manifestHash: 'sha256:' + 'a'.repeat(64), // wrong
      tarballHash: 'sha256:' + '0'.repeat(64),
      entryPointHashes: {},
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });
    const result = await loadExternalImpl({
      entry: { name: '@verify/harness', entry: PKG_ROOT },
      trustedSigners: TRUSTED_SIGNERS(),
      env: ENV(),
      home: HOME,
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.reason).toBe('impl-content-hash-mismatch');
      expect(result.detail).toContain('manifest changed since install');
      expect(result.detail).toContain('jinn harnesses add');
    }
  });

  it('returns impl-content-hash-mismatch naming the changed entry-point file', async () => {
    writeInstalledHarness(HOME, '@verify/harness', {
      version: '1.0.0',
      manifestHash: computeManifestHash(signedManifest),
      tarballHash: 'sha256:' + '0'.repeat(64),
      entryPointHashes: {
        './dist/index.js': 'sha256:' + 'c'.repeat(64), // wrong
      },
      tier: 1,
      installedAt: new Date().toISOString(),
      publishedAttestation: null,
    });
    const result = await loadExternalImpl({
      entry: { name: '@verify/harness', entry: PKG_ROOT },
      trustedSigners: TRUSTED_SIGNERS(),
      env: ENV(),
      home: HOME,
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.reason).toBe('impl-content-hash-mismatch');
      expect(result.detail).toContain('./dist/index.js');
    }
  });
});
