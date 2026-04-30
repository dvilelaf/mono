import type { Address, Hex } from './types.js';

export interface SignTypedDataArgs {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: Address;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface SendAllowedCallArgs {
  to: Address;
  data: Hex;
  value?: bigint;
}

export interface ScopedSigner {
  readonly address: Address;
  signTypedData(args: SignTypedDataArgs): Promise<Hex>;
  sendAllowedCall(call: SendAllowedCallArgs): Promise<Hex>;
}

export interface ScopedRpc {
  readContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  getBlockNumber(): Promise<bigint>;
  getBalance(args: { address: Address }): Promise<bigint>;
  getCode(args: { address: Address }): Promise<Hex | undefined>;
  getChainId(): Promise<number>;
}

export type ScopedSecrets = Readonly<Record<string, string>>;
