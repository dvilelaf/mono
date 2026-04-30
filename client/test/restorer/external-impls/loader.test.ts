import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { canonicaliseManifest } from '../../../src/restorer/manifest/index.js';
import { loadExternalImpl } from '../../../src/restorer/external-impls/loader.js';

ed.hashes.sha512 = (m: Uint8Array) => sha512(m);

let TMP: string;
let PKG_ROOT: string;
let PUBKEY_B64: string;
let SECRET_KEY: Uint8Array;

const VALID_HASH = ('sha256:' + '0'.repeat(64)) as `sha256:${string}`;

beforeAll(async () => {
  TMP = mkdtempSync(join(tmpdir(), 'jinn-loader-'));
  PKG_ROOT = join(TMP, 'fake-impl');
  mkdirSync(join(PKG_ROOT, 'dist'), { recursive: true });
  writeFileSync(
    join(PKG_ROOT, 'dist', 'index.js'),
    `export default function createRestorer(env) {
      return {
        name: env.implName,
        version: env.implVersion,
        supports: ({ kind }) => kind === 'prediction.v0',
        run: async () => ({ venueRef: { name: 'fake' }, gating: {} })
      };
    }`,
  );

  SECRET_KEY = ed.utils.randomSecretKey();
  const pk = await ed.getPublicKeyAsync(SECRET_KEY);
  PUBKEY_B64 = Buffer.from(pk).toString('base64');

  const manifest = {
    schemaVersion: '1.0.0' as const,
    name: '@fake/restorer',
    version: '0.1.0',
    supportedKinds: ['prediction.v0>=1.0.0'],
    entry: './dist/index.js',
    package: { cid: 'bafyfake', hash: VALID_HASH },
    capabilities: {},
    signature: { alg: 'ed25519' as const, publicKey: PUBKEY_B64, sig: '' },
  };
  const body = canonicaliseManifest(manifest);
  const sig = await ed.signAsync(new TextEncoder().encode(body), SECRET_KEY);
  manifest.signature.sig = Buffer.from(sig).toString('base64');
  writeFileSync(
    join(PKG_ROOT, 'jinn.manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
});

afterAll(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

function envFor(implName: string) {
  return {
    implName,
    implVersion: '0.1.0',
    network: 'base-sepolia',
    implStateDir: TMP,
    secrets: Object.freeze({}),
    log: () => {},
    stub: false,
  };
}

describe('loadExternalImpl', () => {
  it('loads + constructs an external impl from a signed package', async () => {
    const result = await loadExternalImpl({
      entry: { name: '@fake/restorer', entry: PKG_ROOT },
      trustedSigners: [{ alg: 'ed25519', publicKey: PUBKEY_B64 }],
      env: envFor('@fake/restorer'),
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.impl.name).toBe('@fake/restorer');
      expect(result.impl.supports({ kind: 'prediction.v0' })).toBe(true);
      expect(result.manifest.version).toBe('0.1.0');
    }
  });

  it('rejects an impl whose signature is not in trustedSigners', async () => {
    const result = await loadExternalImpl({
      entry: { name: '@fake/restorer', entry: PKG_ROOT },
      trustedSigners: [
        {
          alg: 'ed25519',
          publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        },
      ],
      env: envFor('@fake/restorer'),
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.reason).toBe('impl-trust');
    }
  });

  it('rejects an impl whose declared name mismatches the manifest', async () => {
    const result = await loadExternalImpl({
      entry: { name: '@fake/wrong-name', entry: PKG_ROOT },
      trustedSigners: [{ alg: 'ed25519', publicKey: PUBKEY_B64 }],
      env: envFor('@fake/wrong-name'),
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.reason).toBe('impl-identity-mismatch');
    }
  });

  it('returns impl-load-failed for a missing package directory', async () => {
    const result = await loadExternalImpl({
      entry: { name: '@nope/x', entry: join(TMP, 'does-not-exist') },
      trustedSigners: [{ alg: 'ed25519', publicKey: PUBKEY_B64 }],
      env: envFor('@nope/x'),
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.reason).toBe('impl-load-failed');
    }
  });
});
