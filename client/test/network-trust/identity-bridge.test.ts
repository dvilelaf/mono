/**
 * Tests for createIdentityBackedAttestationClient (identity-bridge).
 *
 * Verifies that the bridge adapts AttestationReputationClient.giveFeedback
 * onto IdentityPublisher.publishRaw with the correct kind, cid, and payload.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Hex } from 'viem';
import type { IdentityPublisher } from '../../src/erc8004/identity.js';
import { createIdentityBackedAttestationClient } from '../../src/network-trust/identity-bridge.js';

const FAKE_MANIFEST_HASH = ('0x' + 'a'.repeat(64)) as Hex;
const FAKE_TX = '0xtxhash';

function makePublisher(publishRaw = vi.fn().mockResolvedValue(FAKE_TX)) {
  return {
    publishRaw,
  } as unknown as IdentityPublisher;
}

describe('createIdentityBackedAttestationClient', () => {
  it('bridges giveFeedback onto IdentityPublisher.publishRaw with plug-in-attestation kind', async () => {
    const publishRaw = vi.fn().mockResolvedValue(FAKE_TX);
    const publisher = makePublisher(publishRaw);
    const client = createIdentityBackedAttestationClient({ publisher });

    const result = await client.giveFeedback({
      targetAgentId: 0n,
      feedbackURI: 'plug-in-attestation:QmAbc',
      feedbackHash: FAKE_MANIFEST_HASH,
    });

    expect(result).toBe(FAKE_TX);
    expect(publishRaw).toHaveBeenCalledOnce();
    expect(publishRaw).toHaveBeenCalledWith({
      kind: 'plug-in-attestation',
      cid: 'QmAbc',
      payload: expect.stringMatching(/^0x[0-9a-f]+$/),
    });
  });

  it('ignores targetAgentId (publisher owns the agentId)', async () => {
    const publishRaw = vi.fn().mockResolvedValue(FAKE_TX);
    const publisher = makePublisher(publishRaw);
    const client = createIdentityBackedAttestationClient({ publisher });

    // Call with different targetAgentIds — publishRaw should be called the same way
    await client.giveFeedback({
      targetAgentId: 99n,
      feedbackURI: 'plug-in-attestation:QmDifferent',
      feedbackHash: FAKE_MANIFEST_HASH,
    });
    await client.giveFeedback({
      targetAgentId: 0n,
      feedbackURI: 'plug-in-attestation:QmDifferent',
      feedbackHash: FAKE_MANIFEST_HASH,
    });

    // Both calls use the same publishRaw args (only cid differs from feedbackURI)
    expect(publishRaw).toHaveBeenCalledTimes(2);
    const [call1, call2] = publishRaw.mock.calls as [
      [{ kind: string; cid: string; payload: string }],
      [{ kind: string; cid: string; payload: string }],
    ];
    expect(call1[0].kind).toBe('plug-in-attestation');
    expect(call2[0].kind).toBe('plug-in-attestation');
    // Both calls have the same payload (same feedbackHash)
    expect(call1[0].payload).toBe(call2[0].payload);
  });

  it('rejects feedbackURI with wrong scheme', async () => {
    const publisher = makePublisher();
    const client = createIdentityBackedAttestationClient({ publisher });

    await expect(
      client.giveFeedback({
        targetAgentId: 0n,
        feedbackURI: 'wrong-scheme:abc',
        feedbackHash: FAKE_MANIFEST_HASH,
      }),
    ).rejects.toThrow(/plug-in-attestation/);
  });

  it('rejects bare cid without scheme', async () => {
    const publisher = makePublisher();
    const client = createIdentityBackedAttestationClient({ publisher });

    await expect(
      client.giveFeedback({
        targetAgentId: 0n,
        feedbackURI: 'QmBareHash',
        feedbackHash: FAKE_MANIFEST_HASH,
      }),
    ).rejects.toThrow(/plug-in-attestation/);
  });

  it('propagates publishRaw errors to the caller', async () => {
    const publishRaw = vi.fn().mockRejectedValue(new Error('rpc timeout'));
    const publisher = makePublisher(publishRaw);
    const client = createIdentityBackedAttestationClient({ publisher });

    await expect(
      client.giveFeedback({
        targetAgentId: 0n,
        feedbackURI: 'plug-in-attestation:QmXyz',
        feedbackHash: FAKE_MANIFEST_HASH,
      }),
    ).rejects.toThrow('rpc timeout');
  });
});
