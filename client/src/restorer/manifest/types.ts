/**
 * Daemon-side manifest types. Same shape as the SDK manifest type;
 * mirrored locally so the client doesn't have to depend on
 * @jinn-network/restorer-sdk at runtime (the SDK is a publish-time
 * boundary).
 */

export interface CapabilityAllowEntry {
  chainId: number;
  to: `0x${string}`;
  selector: `0x${string}`;
  description?: string;
}

export interface ManifestRpcAllow {
  chainId: number;
  methods: ReadonlyArray<
    | 'eth_call'
    | 'eth_getBlockByNumber'
    | 'eth_getLogs'
    | 'eth_getTransactionReceipt'
    | 'eth_chainId'
    | 'eth_blockNumber'
    | 'eth_getBalance'
    | 'eth_getCode'
  >;
  rateLimit?: { perSec: number };
}

export interface JinnManifest {
  schemaVersion: '1.0.0';
  name: string;
  version: string;
  description?: string;
  supportedKinds: readonly string[];
  entry: string;
  package: { cid: string; hash: `sha256:${string}` };
  capabilities: {
    signer?: { selectors: ReadonlyArray<CapabilityAllowEntry> };
    rpc?: ReadonlyArray<ManifestRpcAllow>;
    secrets?: ReadonlyArray<{
      name: string;
      description: string;
      required: boolean;
    }>;
  };
  signature: {
    alg: 'ed25519';
    publicKey: string;
    sig: string;
  };
  author?: { name: string; url?: string };
  license?: string;
}

export interface SignerTrustEntry {
  alg: 'ed25519';
  publicKey: string;
  label?: string;
}
