import { describe, it, expect } from 'vitest';
import { validatePlugInAttestation, type PlugInAttestation } from '../../src/network-trust/schema.js';

const valid: PlugInAttestation = {
  subject: '@foo/bar',
  subjectType: 'plug-in',
  version: '1.2.3',
  manifestHash: 'sha256:' + 'a'.repeat(64),
  tarballHash: 'sha256:' + 'b'.repeat(64),
  tier: 1,
  kind: 'endorse',
  score: 1,
  reason: 'works well',
  reviewCid: '',
  attestedAt: 1714867200,
};

describe('PlugInAttestation schema', () => {
  it('accepts a well-formed endorse attestation', () => {
    expect(validatePlugInAttestation(valid)).toBe(true);
  });

  it('accepts installed / warn / block / review variants', () => {
    expect(validatePlugInAttestation({ ...valid, kind: 'installed', score: 0 })).toBe(true);
    expect(validatePlugInAttestation({ ...valid, kind: 'warn', score: -1, reason: 'r' })).toBe(true);
    expect(validatePlugInAttestation({ ...valid, kind: 'block', score: -2, reason: 'r' })).toBe(true);
    expect(validatePlugInAttestation({
      ...valid, kind: 'review', score: 0, reviewCid: 'Qm123',
    })).toBe(true);
  });

  it('accepts harness subjectType', () => {
    expect(validatePlugInAttestation({ ...valid, subjectType: 'harness' })).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(validatePlugInAttestation({})).toBe(false);
  });

  it('rejects unknown kind', () => {
    expect(validatePlugInAttestation({ ...valid, kind: 'unknown' as never })).toBe(false);
  });

  it('rejects out-of-range score', () => {
    expect(validatePlugInAttestation({ ...valid, score: 5 as never })).toBe(false);
    expect(validatePlugInAttestation({ ...valid, score: -3 as never })).toBe(false);
  });

  it('rejects malformed manifestHash', () => {
    expect(validatePlugInAttestation({ ...valid, manifestHash: 'md5:abc' })).toBe(false);
  });

  it('rejects extra properties', () => {
    expect(validatePlugInAttestation({ ...valid, extraField: 'x' } as never)).toBe(false);
  });
});
