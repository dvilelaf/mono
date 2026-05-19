/**
 * Unit tests for the EvictionLoop daemon loop.
 *
 * jinn-mono-hjex.3 — surface service eviction + in-process auto-restake.
 */

import { describe, expect, it, vi } from 'vitest';
import { EvictionLoop } from '../../src/daemon/eviction-loop.js';

// Valid checksummed Ethereum addresses
const STAKING_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function makeService(overrides: { serviceId?: number; stakingAddress?: string; step?: string } = {}) {
  return {
    index: 1,
    step: overrides.step ?? 'complete',
    service_id: overrides.serviceId ?? 42,
    staking_address: overrides.stakingAddress ?? STAKING_ADDR,
    agent_address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    safe_address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  };
}

function mockStore(
  services: ReturnType<typeof makeService>[],
  opts: { stakingMode?: string } = {},
) {
  return {
    load: vi.fn(async () => ({
      master_address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      services,
      staking_mode: opts.stakingMode ?? 'standard',
    })),
  } as any;
}

describe('EvictionLoop', () => {
  it('detects state=2 and calls recoverEvictedService (jinn-mono-hjex.3)', async () => {
    const readContract = vi.fn().mockResolvedValue(2n); // 2 = Evicted
    const recoverEvicted = vi.fn().mockResolvedValue(undefined);
    const loop = new EvictionLoop({
      intervalMs: 60_000,
      store: mockStore([makeService()]),
      chain: 'base-sepolia',
      readContract,
      recoverEvictedService: recoverEvicted,
    });

    await loop.runOnce();

    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'getStakingState', args: [42n] }),
    );
    expect(recoverEvicted).toHaveBeenCalledWith(
      expect.objectContaining({ service_id: 42 }),
    );
  });

  it('does not call recoverEvictedService when state=1 (Staked)', async () => {
    const readContract = vi.fn().mockResolvedValue(1n); // 1 = Staked
    const recoverEvicted = vi.fn();
    const loop = new EvictionLoop({
      intervalMs: 60_000,
      store: mockStore([makeService()]),
      chain: 'base-sepolia',
      readContract,
      recoverEvictedService: recoverEvicted,
    });

    await loop.runOnce();
    expect(recoverEvicted).not.toHaveBeenCalled();
  });

  it('skips services without service_id', async () => {
    const readContract = vi.fn().mockResolvedValue(2n);
    const recoverEvicted = vi.fn();
    const loop = new EvictionLoop({
      intervalMs: 60_000,
      store: mockStore([{ ...makeService(), service_id: null as any }]),
      chain: 'base-sepolia',
      readContract,
      recoverEvictedService: recoverEvicted,
    });

    await loop.runOnce();
    expect(readContract).not.toHaveBeenCalled();
    expect(recoverEvicted).not.toHaveBeenCalled();
  });

  it('skips services without staking_address', async () => {
    const readContract = vi.fn().mockResolvedValue(2n);
    const recoverEvicted = vi.fn();
    const loop = new EvictionLoop({
      intervalMs: 60_000,
      store: mockStore([{ ...makeService(), staking_address: null as any }]),
      chain: 'base-sepolia',
      readContract,
      recoverEvictedService: recoverEvicted,
    });

    await loop.runOnce();
    expect(readContract).not.toHaveBeenCalled();
    expect(recoverEvicted).not.toHaveBeenCalled();
  });

  it('does not crash when readContract fails (non-fatal)', async () => {
    const readContract = vi.fn().mockRejectedValue(new Error('RPC error'));
    const recoverEvicted = vi.fn();
    const loop = new EvictionLoop({
      intervalMs: 60_000,
      store: mockStore([makeService()]),
      chain: 'base-sepolia',
      readContract,
      recoverEvictedService: recoverEvicted,
    });

    await expect(loop.runOnce()).resolves.toBeUndefined();
    expect(recoverEvicted).not.toHaveBeenCalled();
  });

  it('exits immediately when intervalMs is 0', async () => {
    const readContract = vi.fn().mockResolvedValue(1n);
    const recoverEvicted = vi.fn();
    const store = mockStore([makeService()]);
    const loop = new EvictionLoop({
      intervalMs: 0,
      store,
      chain: 'base-sepolia',
      readContract,
      recoverEvictedService: recoverEvicted,
    });

    await expect(loop.run()).resolves.toBeUndefined();
    expect(store.load).not.toHaveBeenCalled();
  });

  it('terminates run() when stop() is called (jinn-mono-hjex.3 review #4)', async () => {
    const readContract = vi.fn().mockResolvedValue(1n); // staked, not evicted
    const recoverEvicted = vi.fn();
    const store = mockStore([makeService()]);
    const loop = new EvictionLoop({
      intervalMs: 5, // short interval so the test stays fast
      store,
      chain: 'base-sepolia',
      readContract,
      recoverEvictedService: recoverEvicted,
    });

    const runPromise = loop.run();
    // Let at least one tick start.
    await new Promise((r) => setTimeout(r, 1));
    loop.stop();
    await expect(runPromise).resolves.toBeUndefined();
    expect(store.load).toHaveBeenCalled();
  });

  it('RPC error on one service does not abort the loop for siblings (jinn-mono-hjex.3 review #4)', async () => {
    const services = [
      makeService({ serviceId: 100 }),
      makeService({ serviceId: 200 }),
    ];
    // First call rejects, second resolves as Evicted.
    const readContract = vi
      .fn()
      .mockRejectedValueOnce(new Error('RPC failure for svc 100'))
      .mockResolvedValueOnce(2n);
    const recoverEvicted = vi.fn().mockResolvedValue(undefined);
    const loop = new EvictionLoop({
      intervalMs: 60_000,
      store: mockStore(services),
      chain: 'base-sepolia',
      readContract,
      recoverEvictedService: recoverEvicted,
    });

    await expect(loop.runOnce()).resolves.toBeUndefined();
    expect(readContract).toHaveBeenCalledTimes(2);
    // The healthy service still triggered recovery.
    expect(recoverEvicted).toHaveBeenCalledTimes(1);
    expect(recoverEvicted).toHaveBeenCalledWith(
      expect.objectContaining({ service_id: 200 }),
    );
  });

  it('skips entirely in self-bond mode (jinn-mono-hjex.3 review #6)', async () => {
    const readContract = vi.fn().mockResolvedValue(2n);
    const recoverEvicted = vi.fn();
    const loop = new EvictionLoop({
      intervalMs: 60_000,
      store: mockStore([makeService()], { stakingMode: 'self_bond' }),
      chain: 'base-sepolia',
      readContract,
      recoverEvictedService: recoverEvicted,
    });

    await loop.runOnce();
    // No staking-state reads issued — self-bond does not use the distributor restake path.
    expect(readContract).not.toHaveBeenCalled();
    expect(recoverEvicted).not.toHaveBeenCalled();
  });
});
