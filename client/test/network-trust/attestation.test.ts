import { describe, it, expect, vi } from 'vitest';
import { publishAttestation, readAttestation } from '../../src/network-trust/attestation.js';
import type { PlugInAttestation } from '../../src/network-trust/schema.js';

const validAttestation: PlugInAttestation = {
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

describe('publishAttestation', () => {
  it('pins JSON to IPFS, calls giveFeedback, returns ok=true with cid + txHash', async () => {
    const ipfs = { pinJson: vi.fn().mockResolvedValue('QmAbc'), fetchJson: vi.fn() };
    const reputation = {
      giveFeedback: vi.fn().mockResolvedValue('0xtxhash'),
    };
    const result = await publishAttestation({
      attestation: validAttestation,
      targetAgentId: 42n,
      ipfs: ipfs as never,
      reputation: reputation as never,
    });
    expect(ipfs.pinJson).toHaveBeenCalledWith(validAttestation);
    expect(reputation.giveFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        targetAgentId: 42n,
        feedbackURI: 'plug-in-attestation:QmAbc',
      }),
    );
    expect(result).toEqual({ ok: true, txHash: '0xtxhash', cid: 'QmAbc' });
  });

  it('returns ok=false on schema failure', async () => {
    const ipfs = { pinJson: vi.fn(), fetchJson: vi.fn() };
    const reputation = { giveFeedback: vi.fn() };
    const result = await publishAttestation({
      attestation: { ...validAttestation, kind: 'unknown' as never },
      targetAgentId: 42n,
      ipfs: ipfs as never,
      reputation: reputation as never,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('schema');
    expect(ipfs.pinJson).not.toHaveBeenCalled();
    expect(reputation.giveFeedback).not.toHaveBeenCalled();
  });

  it('returns ok=false on IPFS pin failure, does not call giveFeedback', async () => {
    const ipfs = { pinJson: vi.fn().mockRejectedValue(new Error('ipfs offline')), fetchJson: vi.fn() };
    const reputation = { giveFeedback: vi.fn() };
    const result = await publishAttestation({
      attestation: validAttestation,
      targetAgentId: 42n,
      ipfs: ipfs as never,
      reputation: reputation as never,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ipfs/i);
    expect(reputation.giveFeedback).not.toHaveBeenCalled();
  });

  it('returns ok=false with cid on giveFeedback failure (insufficient funds etc.)', async () => {
    const ipfs = { pinJson: vi.fn().mockResolvedValue('QmAbc'), fetchJson: vi.fn() };
    const reputation = {
      giveFeedback: vi.fn().mockRejectedValue(new Error('insufficient funds')),
    };
    const result = await publishAttestation({
      attestation: validAttestation,
      targetAgentId: 42n,
      ipfs: ipfs as never,
      reputation: reputation as never,
    });
    expect(result.ok).toBe(false);
    expect(result.cid).toBe('QmAbc');           // pin succeeded
    expect(result.error).toMatch(/insufficient funds/);
  });
});

describe('readAttestation', () => {
  it('fetches and validates attestation JSON from IPFS', async () => {
    const ipfs = { pinJson: vi.fn(), fetchJson: vi.fn().mockResolvedValue(validAttestation) };
    const result = await readAttestation('QmAbc', ipfs as never);
    expect(result).toEqual(validAttestation);
  });

  it('returns null on fetch failure', async () => {
    const ipfs = {
      pinJson: vi.fn(),
      fetchJson: vi.fn().mockRejectedValue(new Error('not found')),
    };
    expect(await readAttestation('QmAbc', ipfs as never)).toBeNull();
  });

  it('returns null on schema-invalid JSON', async () => {
    const ipfs = { pinJson: vi.fn(), fetchJson: vi.fn().mockResolvedValue({ wrong: 'shape' }) };
    expect(await readAttestation('QmAbc', ipfs as never)).toBeNull();
  });
});
