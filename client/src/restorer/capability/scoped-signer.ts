/**
 * Scoped signer constructor — Phase 1 implementation. Allow-list is
 * enforced before any signing happens; actual transaction signing is
 * wired in a follow-up plan (the daemon plan that owns the wallet).
 */

import type { Account, Address, Hex } from 'viem';
import type { ScopedSigner, SignTypedDataArgs, SendAllowedCallArgs } from './index.js';

export interface CapabilityAllowEntry {
  chainId: number;
  to: Address;
  /** Lower-case 4-byte selector with `0x` prefix (e.g. `0xdeadbeef`). */
  selector: Hex;
}

export interface CreateScopedSignerArgs {
  account: Account;
  allowList: readonly CapabilityAllowEntry[];
  chainId: number;
}

export function createScopedSigner({
  account,
  allowList,
  chainId,
}: CreateScopedSignerArgs): ScopedSigner {
  return {
    get address() {
      return account.address;
    },

    async signTypedData(args: SignTypedDataArgs): Promise<Hex> {
      // Phase 1: delegate to the master account. Future revisions will
      // additionally check the EIP-712 domain against a manifest
      // signTypedData allow-list.
      if (typeof account.signTypedData !== 'function') {
        throw new Error('master account does not support signTypedData');
      }
      return account.signTypedData(args as never);
    },

    async sendAllowedCall(call: SendAllowedCallArgs): Promise<Hex> {
      const selector = call.data.slice(0, 10).toLowerCase() as Hex;
      const entry = allowList.find(
        (e) =>
          e.chainId === chainId &&
          e.to.toLowerCase() === call.to.toLowerCase() &&
          e.selector.toLowerCase() === selector,
      );
      if (!entry) {
        const haveContract = allowList.some(
          (e) => e.chainId === chainId && e.to.toLowerCase() === call.to.toLowerCase(),
        );
        if (!haveContract) {
          throw new Error(`to ${call.to} not in allow-list for chain ${chainId}`);
        }
        throw new Error(
          `selector ${selector} not in allow-list for ${call.to} on chain ${chainId}`,
        );
      }
      // Phase 1: shape only — actual signing is wired in the daemon plan.
      throw new Error(
        'sendAllowedCall is allow-list-validated but signing is wired in the daemon plan',
      );
    },
  };
}
