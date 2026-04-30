import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { createScopedSigner } from '../../../src/restorer/capability/scoped-signer.js';

const MASTER_PK =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const ALLOWED_TO = '0x1111111111111111111111111111111111111111' as const;
const ALLOWED_SELECTOR = '0xdeadbeef' as const;
const FORBIDDEN_SELECTOR = '0xcafef00d' as const;

describe('createScopedSigner', () => {
  const account = privateKeyToAccount(MASTER_PK);
  const allowList = [
    { chainId: 8453, to: ALLOWED_TO, selector: ALLOWED_SELECTOR },
  ] as const;

  it('exposes the master EOA address', () => {
    const signer = createScopedSigner({ account, allowList, chainId: 8453 });
    expect(signer.address).toBe(account.address);
  });

  it('rejects sendAllowedCall with a non-allow-listed selector', async () => {
    const signer = createScopedSigner({ account, allowList, chainId: 8453 });
    await expect(
      signer.sendAllowedCall({
        to: ALLOWED_TO,
        data: `${FORBIDDEN_SELECTOR}00000000` as `0x${string}`,
      }),
    ).rejects.toThrow(/selector .* not in allow-list/i);
  });

  it('rejects sendAllowedCall with a non-allow-listed contract', async () => {
    const signer = createScopedSigner({ account, allowList, chainId: 8453 });
    await expect(
      signer.sendAllowedCall({
        to: '0x9999999999999999999999999999999999999999' as `0x${string}`,
        data: `${ALLOWED_SELECTOR}00000000` as `0x${string}`,
      }),
    ).rejects.toThrow(/to .* not in allow-list/i);
  });

  it('throws Phase 1 placeholder when the call is fully allow-listed', async () => {
    const signer = createScopedSigner({ account, allowList, chainId: 8453 });
    await expect(
      signer.sendAllowedCall({
        to: ALLOWED_TO,
        data: `${ALLOWED_SELECTOR}00000000` as `0x${string}`,
      }),
    ).rejects.toThrow(/wired in the daemon plan/i);
  });

  it('signs EIP-712 typed data via the underlying account', async () => {
    const signer = createScopedSigner({ account, allowList, chainId: 8453 });
    const sig = await signer.signTypedData({
      domain: { name: 'Test', version: '1', chainId: 8453 },
      types: { Mail: [{ name: 'contents', type: 'string' }] },
      primaryType: 'Mail',
      message: { contents: 'hello' },
    });
    expect(sig).toMatch(/^0x[0-9a-fA-F]+$/);
  });
});
