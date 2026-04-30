/**
 * Manifest signature verifier (ed25519).
 *
 * Canonicalisation: stable JSON of the manifest with the `signature`
 * field stripped. Authors sign the resulting bytes.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import type { JinnManifest, SignerTrustEntry } from './types.js';

// @noble/ed25519 v3 needs sha512 wired for synchronous use; the
// async path (verifyAsync/signAsync) prefers WebCrypto where available
// but falls back to ed.hashes.sha512 when WebCrypto is missing.
ed.hashes.sha512 = (m: Uint8Array) => sha512(m);

/**
 * Canonicalise a manifest for signing/verification: stable JSON with
 * sorted top-level keys and signature stripped.
 */
export function canonicaliseManifest(manifest: JinnManifest): string {
  const { signature: _omit, ...body } = manifest;
  return JSON.stringify(body, Object.keys(body).sort());
}

function b64ToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

export async function verifyManifestSignature(
  manifest: JinnManifest,
  trustedSigners: readonly SignerTrustEntry[],
): Promise<boolean> {
  if (manifest.signature.alg !== 'ed25519') return false;
  const trustHit = trustedSigners.find(
    (t) => t.alg === 'ed25519' && t.publicKey === manifest.signature.publicKey,
  );
  if (!trustHit) return false;

  const body = canonicaliseManifest(manifest);
  const msg = new TextEncoder().encode(body);

  let pk: Uint8Array;
  let sig: Uint8Array;
  try {
    pk = b64ToBytes(manifest.signature.publicKey);
    sig = b64ToBytes(manifest.signature.sig);
  } catch {
    return false;
  }

  if (pk.length !== 32 || sig.length !== 64) return false;

  try {
    return await ed.verifyAsync(sig, msg, pk);
  } catch {
    return false;
  }
}
