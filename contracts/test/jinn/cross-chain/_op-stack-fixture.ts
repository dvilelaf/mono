/**
 * Helpers for constructing Fault-Proof-shaped fixtures for
 * `CanonicalOpStackMessenger`. Lets tests build:
 *   - a legacy or typed receipt RLP carrying a `ClaimTicket` log
 *   - a single-leaf MPT root + proof so the on-chain TrieProof.verify
 *     accepts it
 *   - the OP-Stack output-root preimage and matching block header
 *     RLP whose receiptsRoot field points at the MPT root above.
 *
 * The MPT shape we build is the trivially small case: one transaction
 * at txIndex=0 means the trie has a single leaf node whose key path
 * (after nibble-encoding) is `[8, 0]` (= rlp(0) = 0x80). That collapses
 * the proof to `[leaf]` which is what `TrieProof.verify` expects.
 */

const { ethers } = require('hardhat');

export const CLAIM_TICKET_TOPIC = ethers.id(
  'ClaimTicket(uint256,uint256,uint256,uint256,address,address)',
);

export interface ClaimTicketFields {
  serviceId: bigint;
  multisig: string;
  claimer: string;
  verifiedCreations: bigint;
  novelty: bigint;
  evalDelivery: bigint;
}

export interface BuiltLog {
  emitter: string;
  topics: string[];
  data: string; // hex
}

export interface ReceiptArtifacts {
  receiptRoot: string;
  receiptProof: string[]; // bytes[] (each = a hex-encoded RLP node)
  receiptRLP: string; // hex
  txIndex: bigint;
  logIndex: bigint;
}

export interface OutputRootArtifacts {
  outputRoot: string;
  outputRootProofBytes: string; // ABI-encoded OutputRootProof
  blockHeaderRLP: string;
  receiptRoot: string;
  latestBlockHash: string;
}

/**
 * Build the canonical `ClaimTicket` log from a 6-tuple.
 */
export function buildClaimTicketLog(
  emitter: string,
  fields: ClaimTicketFields,
  topic0: string = CLAIM_TICKET_TOPIC,
): BuiltLog {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return {
    emitter,
    topics: [
      topic0,
      ethers.zeroPadValue(ethers.toBeHex(fields.serviceId), 32),
      ethers.zeroPadValue(fields.multisig, 32),
      ethers.zeroPadValue(fields.claimer, 32),
    ],
    data: coder.encode(
      ['uint256', 'uint256', 'uint256'],
      [fields.verifiedCreations, fields.novelty, fields.evalDelivery],
    ),
  };
}

/**
 * RLP-encode a log: `[address, [topic0, topic1, ...], data]`.
 */
function encodeLogRLP(log: BuiltLog): string {
  return ethers.encodeRlp([log.emitter, log.topics, log.data]);
}

/**
 * RLP-encode the receipt body `[status, cumGas, bloom, [logs...]]`.
 *
 * For typed (EIP-2718) receipts, prepend the type byte before
 * concatenating with this RLP — see {wrapTypedReceipt}.
 */
export function encodeReceiptRLP(
  logs: BuiltLog[],
  opts: { status?: number; cumGas?: number; bloom?: string } = {},
): string {
  const status = opts.status ?? 1;
  const cumGas = opts.cumGas ?? 21000;
  const bloom = opts.bloom ?? ('0x' + '00'.repeat(256));
  const statusEnc = status === 0 ? '0x' : ethers.toBeHex(status);
  const cumEnc = cumGas === 0 ? '0x' : ethers.toBeHex(cumGas);
  return ethers.encodeRlp([
    statusEnc,
    cumEnc,
    bloom,
    logs.map((l) => [l.emitter, l.topics, l.data]),
  ]);
}

/**
 * Wrap a legacy receipt RLP as an EIP-2718 typed receipt by prepending
 * the type byte. Type must be in [0x01, 0x7f].
 */
export function wrapTypedReceipt(receiptRLP: string, txType: number): string {
  if (txType < 1 || txType > 0x7f) {
    throw new Error(`bad tx type: ${txType}`);
  }
  return ethers.concat([ethers.toBeHex(txType, 1), receiptRLP]);
}

/**
 * Build a single-leaf MPT for txIndex=0 carrying `receiptRLP`. The
 * trie radix means `RLP(0) = 0x80` is the key bytes; nibblised that's
 * `[0x8, 0x0]` (even-length). Compact-encoded leaf path = `0x20 || 0x80`.
 *
 * Leaf node = `RLP([0x2080, value])`. Root = keccak256(leaf).
 * Proof   = [leafRLP].
 */
export function buildSingleReceiptTrie(receiptRLP: string): ReceiptArtifacts {
  const leaf = ethers.encodeRlp(['0x2080', receiptRLP]);
  const receiptRoot = ethers.keccak256(leaf);
  return {
    receiptRoot,
    receiptProof: [leaf],
    receiptRLP,
    txIndex: 0n,
    logIndex: 0n,
  };
}

/**
 * Encode an L2 block header RLP whose `receiptsRoot` field (index 5)
 * is the supplied root. Other fields are filled with deterministic
 * placeholders — what matters is the keccak256 hash and the parsed
 * receiptsRoot.
 */
export function buildBlockHeaderRLP(receiptsRoot: string): {
  blockHeaderRLP: string;
  blockHash: string;
} {
  const ZERO32 = '0x' + '00'.repeat(32);
  const ZERO20 = '0x' + '00'.repeat(20);
  const ZERO256 = '0x' + '00'.repeat(256);
  const fields: any[] = [
    ZERO32, // 0  parentHash
    ZERO32, // 1  uncleHash (sha3Uncles)
    ZERO20, // 2  coinbase / miner
    ZERO32, // 3  stateRoot
    ZERO32, // 4  transactionsRoot
    receiptsRoot, // 5  receiptsRoot
    ZERO256, // 6  logsBloom
    '0x', // 7  difficulty (0)
    '0x01', // 8  number
    '0x', // 9  gasLimit
    '0x', // 10 gasUsed
    '0x', // 11 timestamp
    '0x', // 12 extraData
    ZERO32, // 13 mixHash / prevRandao
    '0x' + '00'.repeat(8), // 14 nonce
  ];
  const blockHeaderRLP = ethers.encodeRlp(fields);
  const blockHash = ethers.keccak256(blockHeaderRLP);
  return { blockHeaderRLP, blockHash };
}

/**
 * Build the full output-root proof bundle for a given receiptRoot.
 * The OP-Stack output root is keccak256(version || stateRoot ||
 * messagePasserStorageRoot || latestBlockHash).
 */
export function buildOutputRootArtifacts(
  receiptRoot: string,
): OutputRootArtifacts {
  const { blockHeaderRLP, blockHash } = buildBlockHeaderRLP(receiptRoot);
  const version = ethers.id('output-root-version-v1');
  const stateRoot = ethers.id('mock-state-root');
  const messagePasserStorageRoot = ethers.id('mock-msg-passer-root');
  const outputRoot = ethers.keccak256(
    ethers.concat([version, stateRoot, messagePasserStorageRoot, blockHash]),
  );
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const outputRootProofBytes = coder.encode(
    ['(bytes32,bytes32,bytes32,bytes32,bytes)'],
    [
      [
        version,
        stateRoot,
        messagePasserStorageRoot,
        blockHash,
        blockHeaderRLP,
      ],
    ],
  );
  return {
    outputRoot,
    outputRootProofBytes,
    blockHeaderRLP,
    receiptRoot,
    latestBlockHash: blockHash,
  };
}

/**
 * Tuple layout for `OpStackProof` in CanonicalOpStackMessenger.sol.
 */
export const OP_STACK_PROOF_TUPLE =
  '(bytes32 disputeGameId, bytes outputRootProof, bytes32 receiptRoot, bytes[] receiptProof, bytes receiptRLP, uint256 logIndex, uint256 txIndex, bytes32 expectedTxHash)';

export interface BuildProofArgs {
  disputeGameId: string;
  outputRootProofBytes: string;
  receiptRoot: string;
  receiptProof: string[];
  receiptRLP: string;
  logIndex: bigint;
  txIndex: bigint;
  expectedTxHash?: string;
}

export function encodeProof(args: BuildProofArgs): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return coder.encode(
    [OP_STACK_PROOF_TUPLE],
    [
      {
        disputeGameId: args.disputeGameId,
        outputRootProof: args.outputRootProofBytes,
        receiptRoot: args.receiptRoot,
        receiptProof: args.receiptProof,
        receiptRLP: args.receiptRLP,
        logIndex: args.logIndex,
        txIndex: args.txIndex,
        expectedTxHash: args.expectedTxHash ?? ethers.id('mock-tx-hash'),
      },
    ],
  );
}
