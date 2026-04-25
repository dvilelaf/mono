import { describe, expect, it } from 'vitest';
import type { CommandContext } from '../../../src/cli/command.js';
import { createFundRequirementsCommand, type FundRequirementsDeps } from '../../../src/cli/commands/fund-requirements.js';

type BootstrapResult = {
  ok: boolean;
  funding?: { master_address: string; eth_required: string; eth_balance: string };
  message: string;
  fleet_state: { master_address: string; services: Array<{ index: number; step: string; service_id?: number }> };
};

function makeFakeDeps(bootstrapResult: BootstrapResult, passwordOk = true): FundRequirementsDeps {
  return {
    loadConfig: () => ({ earningDir: '/tmp', network: 'testnet', rpcUrl: 'http://127.0.0.1:8545' } as any),
    getConfigPathFromArgs: () => undefined,
    bootstrapperFactory: () => ({
      bootstrap: async () => ({ ...bootstrapResult }),
    } as any),
    resolveCliPassword: () =>
      passwordOk
        ? { ok: true as const, password: 'test' }
        : { ok: false as const, message: 'Set JINN_PASSWORD or pass --password-fd N with a readable file descriptor.' },
    getChainConfig: () => ({ minSafeEth: 1000000000000000n } as any),
    publicClientFactory: () => ({ getBalance: async () => 0n } as any),
  };
}

function makeCtx(
  env: Record<string, string> = { JINN_PASSWORD: 'test' },
  argv: string[] = [],
): {
  ctx: CommandContext;
  writes: string[];
  exits: number[];
} {
  const writes: string[] = [];
  const exits: number[] = [];
  const ctx: CommandContext = {
    argv,
    stdoutIsTty: false,
    writer: { write: (s: string) => { writes.push(s); return true; } },
    exit: (code: number) => { exits.push(code); },
    env,
  };
  return { ctx, writes, exits };
}

describe('fund-requirements command', () => {
  it('emits a requirements array with role, address, asset, needWei', async () => {
    const deps = makeFakeDeps({
      ok: false,
      funding: {
        master_address: '0xMASTER',
        eth_required: '1000000000000000000',
        eth_balance: '0',
      },
      message: 'need eth',
      fleet_state: { master_address: '0xMASTER', services: [] },
    });
    const fr = createFundRequirementsCommand(deps);
    const { ctx, writes } = makeCtx();
    await fr.run(ctx);
    const parsed = JSON.parse(writes[writes.length - 1]);
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.requirements)).toBe(true);
    expect(parsed.requirements[0]).toMatchObject({
      role: 'master',
      address: '0xMASTER',
      asset: 'native',
      needWei: '1000000000000000000',
      haveWei: '0',
    });
    expect(parsed.satisfied).toBe(false);
  });

  it('reports satisfied=true with empty requirements when no funding needed', async () => {
    const deps = makeFakeDeps({
      ok: true,
      message: 'ok',
      fleet_state: { master_address: '0xM', services: [] },
    });
    const fr = createFundRequirementsCommand(deps);
    const { ctx, writes } = makeCtx();
    await fr.run(ctx);
    const parsed = JSON.parse(writes[writes.length - 1]);
    expect(parsed.satisfied).toBe(true);
    expect(parsed.requirements).toEqual([]);
  });

  it('--human formats amounts as ETH (not raw wei)', async () => {
    const deps = makeFakeDeps({
      ok: false,
      funding: {
        master_address: '0xMASTER',
        eth_required: '5000000000000000', // 0.005 ETH
        eth_balance: '0',
      },
      message: 'need eth',
      fleet_state: { master_address: '0xMASTER', services: [] },
    });
    const fr = createFundRequirementsCommand(deps);
    const { ctx, writes } = makeCtx({ JINN_PASSWORD: 'test' }, ['--human']);
    await fr.run(ctx);
    const out = writes.join('');
    expect(out).toMatch(/Funding required/);
    expect(out).toMatch(/0\.005 ETH/);
    expect(out).not.toMatch(/wei/);
  });

  it('accepts --password-fd when password env is missing', async () => {
    const deps = makeFakeDeps({
      ok: false,
      funding: {
        master_address: '0xMASTER',
        eth_required: '1000000000000000000',
        eth_balance: '0',
      },
      message: 'need eth',
      fleet_state: { master_address: '0xMASTER', services: [] },
    });
    const fr = createFundRequirementsCommand(deps);
    const { ctx, writes } = makeCtx({}, ['--password-fd', '0']);
    await fr.run(ctx);
    const parsed = JSON.parse(writes[writes.length - 1]);
    expect(parsed.satisfied).toBe(false);
  });
});
