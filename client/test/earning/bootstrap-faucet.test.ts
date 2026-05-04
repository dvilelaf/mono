import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const requestTestnetFundingMock = vi.fn(async () => ({
  ok: true,
  txHash: '0x' + '12'.repeat(32),
}));

describe('Fleet bootstrap faucet cap', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    requestTestnetFundingMock.mockClear();
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('keeps dripping until the master EOA reaches the fresh-fleet bootstrap target (0.010 ETH)', async () => {
    const earningDir = await mkdtemp(join(tmpdir(), 'jinn-faucet-success-'));
    dirs.push(earningDir);

    const { FleetBootstrapper } = await import('../../src/earning/bootstrap.js');
    const bootstrapper = new FleetBootstrapper({
      earningDir,
      chain: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
      env: {},
      stakingMode: 'standard',
      requestFunding: requestTestnetFundingMock,
    });

    // Each successful drip credits ~0.0001 ETH. The fresh-fleet target is
    // minEoaGasEth (0.005) × STANDARD_MASTER_BOOTSTRAP_MULTIPLIER (2) = 0.010
    // ETH, so ~100 drips should clear it. The previous fixed 60-drip cap
    // (≈0.006 ETH max) could not.
    const DRIP_WEI = 100_000_000_000_000n;
    vi.spyOn((bootstrapper as any).publicClient, 'getBalance').mockImplementation(async () => {
      const drips = BigInt(requestTestnetFundingMock.mock.calls.length);
      return drips * DRIP_WEI;
    });
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb: (...args: unknown[]) => void) => {
      queueMicrotask(cb);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
    // We only care about the funding loop here — short-circuit Phase 2 so the
    // test doesn't fall through into the live on-chain reconcile/create paths.
    vi.spyOn(bootstrapper as any, 'reconcileFleetWithChain').mockImplementation(async () => {
      throw new Error('reconcile_short_circuit');
    });

    await bootstrapper.bootstrap('test-password');

    // 0.010 ETH ÷ 0.0001 ETH/drip = 100 drips; loop must break exactly when
    // the balance first meets the target, and never exceed the new cap.
    expect(requestTestnetFundingMock).toHaveBeenCalledTimes(100);
  });

  it('does not send an extra faucet request after the drip cap', async () => {
    const earningDir = await mkdtemp(join(tmpdir(), 'jinn-faucet-cap-'));
    dirs.push(earningDir);

    const { FleetBootstrapper } = await import('../../src/earning/bootstrap.js');
    const { computeFaucetDripCap } = await import('../../src/earning/faucet.js');
    const bootstrapper = new FleetBootstrapper({
      earningDir,
      chain: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
      env: {},
      stakingMode: 'standard',
      requestFunding: requestTestnetFundingMock,
    });

    vi.spyOn((bootstrapper as any).publicClient, 'getBalance').mockResolvedValue(0n);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb: (...args: unknown[]) => void) => {
      queueMicrotask(cb);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const result = await bootstrapper.bootstrap('test-password');

    // Fresh standard-mode fleet on base-sepolia → required master ETH is
    // minEoaGasEth (0.005) × STANDARD_MASTER_BOOTSTRAP_MULTIPLIER (2) = 0.010
    // ETH. With a balance of 0 and ~0.0001 ETH per drip, computeFaucetDripCap
    // sizes the safety bound to clear the target (the previous fixed 60-drip
    // cap topped out at ~0.006 ETH and stranded fresh fleets).
    const expectedCap = computeFaucetDripCap({
      targetWei: 10_000_000_000_000_000n,
      balanceWei: 0n,
    });
    expect(expectedCap).toBeGreaterThan(60);
    expect(result.ok).toBe(false);
    expect(result.funding).toBeDefined();
    expect(requestTestnetFundingMock).toHaveBeenCalledTimes(expectedCap);
  });
});
