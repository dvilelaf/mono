import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MechAdapterConfig } from '../../../src/adapters/mech/types.js';
import type { SignedTaskV1 } from '../../../src/types/task-document.js';

const HOISTED = vi.hoisted(() => {
  const REQUEST_ID = ('0x' + 'aa'.repeat(32)) as `0x${string}`;
  const TASK_CID_DIGEST = ('0x' + 'cc'.repeat(32)) as `0x${string}`;
  const TASK_CID = `f01551220${'cc'.repeat(32)}`;
  const TX_HASH = ('0x' + '12'.repeat(32)) as `0x${string}`;
  const signedTask = (overrides: Partial<SignedTaskV1> = {}): SignedTaskV1 => ({
    schemaVersion: 'task.v1',
    id: 'prediction-task-1',
    solverType: 'prediction.v1',
    role: 'restoration',
    description: 'Will the test market resolve YES?',
    window: { startTs: 1_775_000_000_000, endTs: 1_775_000_600_000 },
    spec: {
      venue: 'polymarket',
      marketId: 'market-1',
      conditionId: '0x' + '11'.repeat(32),
      outcomeTokenId: '123',
      outcome: 'YES',
    },
    eligibility: {},
    claimPolicy: {
      mode: 'parallel',
      maxClaims: 25,
      maxClaimsPerOperator: 1,
      claimLeaseTtlSeconds: 600,
    },
    creator: {
      safeAddress: '0x1111111111111111111111111111111111111111',
      agentEoa: '0x2222222222222222222222222222222222222222',
    },
    createdAt: 1_775_000_000_000,
    signature: {
      algo: 'secp256k1',
      signer: '0x2222222222222222222222222222222222222222',
      hash: '0x' + 'ab'.repeat(32),
      sig: '0x' + 'cd'.repeat(65),
    },
    ...overrides,
  });
  return { REQUEST_ID, TASK_CID_DIGEST, TASK_CID, TX_HASH, signedTask };
});

const { REQUEST_ID, TASK_CID_DIGEST, TASK_CID, TX_HASH, signedTask } = HOISTED;

// MOCK_JUSTIFICATION: src/adapters/mech/contracts.js is the I/O leaf for chain RPC calls; mocking it is mocking the boundary.
vi.mock('../../../src/adapters/mech/contracts.js', () => ({
  submitTask: vi.fn().mockResolvedValue({
    taskId: '1',
    txHash: TX_HASH,
    receiptLogCount: 1,
    blockNumber: 123,
  }),
  claimTask: vi.fn().mockResolvedValue({
    taskId: '1',
    attemptIndex: 0,
    requestId: REQUEST_ID,
    txHash: TX_HASH,
    blockNumber: 124,
  }),
  claimDelivery: vi.fn().mockResolvedValue('0x1234'),
  getMechDeliveryRate: vi.fn().mockResolvedValue(1000000n),
  getTimeoutBounds: vi.fn().mockResolvedValue({ min: 60n, max: 300n }),
  decodeTaskCreatedLogs: vi.fn().mockReturnValue([]),
  decodeDeliverLogs: vi.fn().mockReturnValue([]),
  callDeliverToMarketplace: vi.fn().mockResolvedValue('0x5678'),
}));

// MOCK_JUSTIFICATION: src/adapters/mech/ipfs.js is the I/O leaf for IPFS gateway HTTP calls; mocking it is mocking the boundary.
vi.mock('../../../src/adapters/mech/ipfs.js', () => ({
  buildResultPayload: vi.fn((requestId: string, result: unknown) => ({ requestId, ...(result as Record<string, unknown>) })),
  uploadToIpfs: vi.fn().mockResolvedValue('QmFakeCid'),
  cidToDigestHex: vi.fn().mockReturnValue(TASK_CID_DIGEST),
  fetchFromIpfs: vi.fn().mockResolvedValue({ data: 'result' }),
  fetchSignedTaskFromIpfs: vi.fn().mockResolvedValue(signedTask()),
  fetchSignedEnvelopeFromIpfs: vi.fn().mockResolvedValue(null),
  digestHexToGatewayUrl: vi.fn(),
}));

// MOCK_JUSTIFICATION: canonical-json is a pure transform; mocking it fixes the output for deterministic evidence hash assertions.
vi.mock('../../../src/harnesses/engine/canonical-json.js', () => ({
  canonicalJson: vi.fn().mockReturnValue('{"mocked":"jcs"}'),
}));

// MOCK_JUSTIFICATION: envelope schema validation is covered in envelope tests; here we isolate adapter routing logic.
vi.mock('../../../src/types/envelope.js', () => ({
  SignedEnvelopeSchema: {
    parse: vi.fn(),
  },
}));

// MOCK_JUSTIFICATION: src/adapters/mech/safe.js is the Safe/RPC I/O leaf; mocking it is mocking the boundary.
vi.mock('../../../src/adapters/mech/safe.js', () => ({
  createClients: vi.fn().mockReturnValue({
    publicClient: {
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      getLogs: vi.fn().mockResolvedValue([]),
      readContract: vi.fn().mockResolvedValue(false),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    },
    walletClient: {},
    account: {},
  }),
}));

const TEST_CONFIG: MechAdapterConfig = {
  rpcUrl: 'http://localhost:8545',
  mechMarketplaceAddress: ('0x' + '11'.repeat(20)) as `0x${string}`,
  routerAddress: ('0x' + '22'.repeat(20)) as `0x${string}`,
  mechContractAddress: ('0x' + '33'.repeat(20)) as `0x${string}`,
  safeAddress: ('0x' + '44'.repeat(20)) as `0x${string}`,
  agentEoaPrivateKey: ('0x' + '55'.repeat(32)) as `0x${string}`,
  ipfsRegistryUrl: 'http://localhost:5001',
  ipfsGatewayUrl: 'http://localhost:8080',
  pollIntervalMs: 1000,
  chainId: 8453,
  routerClaimDeliveryVariant: 'v1',
};

describe('MechAdapter TaskCoordinator flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('postTask uploads a signed task.v1 document and calls createTask', async () => {
    const { MechAdapter } = await import('../../../src/adapters/mech/adapter.js');
    const { submitTask } = await import('../../../src/adapters/mech/contracts.js');
    const { uploadToIpfs } = await import('../../../src/adapters/mech/ipfs.js');

    const adapter = new MechAdapter(TEST_CONFIG);
    await adapter.initialize();

    const posted = await adapter.postTask({
      id: 'prediction-task-1',
      description: 'Will the test market resolve YES?',
      solverType: 'prediction.v1',
      claimPolicy: {
        mode: 'parallel',
        maxClaims: 25,
        maxClaimsPerOperator: 1,
        claimLeaseTtlSeconds: 600,
      },
    });

    expect(posted).toMatchObject({
      taskId: '1',
      taskCid: TASK_CID,
      txHash: TX_HASH,
      blockNumber: 123,
    });
    expect(uploadToIpfs).toHaveBeenCalledWith(
      TEST_CONFIG.ipfsRegistryUrl,
      expect.objectContaining({
        schemaVersion: 'task.v1',
        solverType: 'prediction.v1',
        claimPolicy: expect.objectContaining({ maxClaims: 25 }),
      }),
    );
    expect(submitTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TEST_CONFIG.safeAddress,
      TEST_CONFIG.routerAddress,
      TASK_CID_DIGEST,
      expect.any(String),
      expect.objectContaining({
        maxClaims: 25,
        maxClaimsPerOperator: 1,
        evaluationPolicy: expect.objectContaining({
          requiredVerdicts: 1,
          passThreshold: 1,
          maxVerdictsPerEvaluator: 1,
          disallowSolverSelfEvaluation: true,
        }),
      }),
      1000000n,
      1000000n,
      300n,
      undefined,
    );

    await adapter.stop();
  });

  it('watchForTasks yields signed TaskCreated announcements', async () => {
    const { MechAdapter } = await import('../../../src/adapters/mech/adapter.js');
    const { decodeTaskCreatedLogs } = await import('../../../src/adapters/mech/contracts.js');
    const { fetchSignedTaskFromIpfs } = await import('../../../src/adapters/mech/ipfs.js');

    vi.mocked(decodeTaskCreatedLogs).mockReturnValueOnce([{
      taskId: '7',
      taskCidDigest: TASK_CID_DIGEST,
      creator: TEST_CONFIG.safeAddress,
      transactionHash: TX_HASH,
      blockNumber: 321,
    }]);
    vi.mocked(fetchSignedTaskFromIpfs).mockResolvedValueOnce(signedTask({ id: 'watched-task' }));

    const adapter = new MechAdapter(TEST_CONFIG);
    await adapter.initialize();
    (adapter as any).publicClient.getBlockNumber = vi.fn().mockResolvedValue(101n);
    (adapter as any).publicClient.getLogs = vi.fn().mockResolvedValue([{ data: '0x', topics: [] }]);
    (adapter as any).requestBlockCursor = 100n;

    const gen = adapter.watchForTasks()[Symbol.asyncIterator]();
    const { value } = await gen.next();

    expect(value).toMatchObject({
      taskId: '7',
      taskCid: TASK_CID,
      onchainCreationTx: TX_HASH,
      onchainCreationBlock: 321,
    });
    expect(value!.task.id).toBe('watched-task');
    expect(value!.task.solverType).toBe('prediction.v1');
    expect(fetchSignedTaskFromIpfs).toHaveBeenCalledWith(TEST_CONFIG.ipfsGatewayUrl, TASK_CID);

    await adapter.stop();
  });

  it('claimTask creates an internal requestId for an observed Task', async () => {
    const { MechAdapter } = await import('../../../src/adapters/mech/adapter.js');
    const { claimTask } = await import('../../../src/adapters/mech/contracts.js');

    const adapter = new MechAdapter(TEST_CONFIG);
    await adapter.initialize();
    (adapter as any).observedTasks.set('1', {
      taskId: '1',
      task: { id: 'prediction-task-1', description: 'test', solverType: 'prediction.v1' },
      taskCid: TASK_CID,
      onchainCreationTx: TX_HASH,
      onchainCreationBlock: 123,
    });

    const request = await adapter.claimTask('1');

    expect(request).toMatchObject({
      taskId: '1',
      attemptIndex: 0,
      requestId: REQUEST_ID,
      taskCid: TASK_CID,
    });
    expect(claimTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TEST_CONFIG.safeAddress,
      TEST_CONFIG.routerAddress,
      '1',
      TEST_CONFIG.mechContractAddress,
      undefined,
    );
    expect((adapter as any).pendingEvaluations.get(REQUEST_ID).solverType).toBe('prediction.v1');

    await adapter.stop();
  });

  it('submitResult remains requestId-based after Task claim', async () => {
    const { MechAdapter } = await import('../../../src/adapters/mech/adapter.js');
    const { callDeliverToMarketplace } = await import('../../../src/adapters/mech/contracts.js');
    const { buildResultPayload, uploadToIpfs } = await import('../../../src/adapters/mech/ipfs.js');

    const adapter = new MechAdapter(TEST_CONFIG);
    await adapter.initialize();

    await adapter.submitResult(REQUEST_ID, { data: 'solution', artifacts: ['bafyartifact'] });

    expect(buildResultPayload).toHaveBeenCalledWith(REQUEST_ID, {
      data: 'solution',
      artifacts: ['bafyartifact'],
    });
    expect(uploadToIpfs).toHaveBeenCalledWith(TEST_CONFIG.ipfsRegistryUrl, expect.objectContaining({
      requestId: REQUEST_ID,
      data: 'solution',
    }));
    expect(callDeliverToMarketplace).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TEST_CONFIG.safeAddress,
      TEST_CONFIG.mechContractAddress,
      [REQUEST_ID],
      [TASK_CID_DIGEST],
      undefined,
    );

    await adapter.stop();
  });

  it('watchForDeliveries claims router delivery and yields the submitted Solution', async () => {
    const { MechAdapter } = await import('../../../src/adapters/mech/adapter.js');
    const { claimDelivery, decodeDeliverLogs } = await import('../../../src/adapters/mech/contracts.js');
    const { fetchFromIpfs } = await import('../../../src/adapters/mech/ipfs.js');

    vi.mocked(decodeDeliverLogs).mockReturnValueOnce([{
      requestId: REQUEST_ID,
      deliveryDataHex: TASK_CID_DIGEST,
      mechAddress: TEST_CONFIG.safeAddress,
    }]);
    vi.mocked(fetchFromIpfs).mockResolvedValueOnce({ data: 'solution', artifacts: ['bafyartifact'] });

    const adapter = new MechAdapter(TEST_CONFIG);
    await adapter.initialize();
    (adapter as any).publicClient.getBlockNumber = vi.fn().mockResolvedValue(101n);
    (adapter as any).publicClient.getLogs = vi.fn().mockResolvedValue([{ data: '0x', topics: [] }]);
    (adapter as any).deliveryBlockCursor = 100n;
    (adapter as any).pendingEvaluations.set(REQUEST_ID, { id: 'prediction-task-1', description: 'test' });
    (adapter as any).originalStates.set(REQUEST_ID, { id: 'prediction-task-1', description: 'test' });

    const gen = adapter.watchForDeliveries()[Symbol.asyncIterator]();
    const { value } = await gen.next();

    expect(claimDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TEST_CONFIG.safeAddress,
      TEST_CONFIG.routerAddress,
      REQUEST_ID,
      { variant: 'v1', kind: 'solution', evidenceHash: undefined },
      undefined,
    );
    expect(value).toMatchObject({
      requestId: REQUEST_ID,
      result: { data: 'solution', artifacts: ['bafyartifact'] },
      deliveryMechAddress: TEST_CONFIG.safeAddress,
    });

    await adapter.stop();
  });

  it('V2 claimDelivery derives evidenceHash from the signed execution envelope', async () => {
    const { keccak256 } = await import('viem');
    const { MechAdapter } = await import('../../../src/adapters/mech/adapter.js');
    const { claimDelivery, decodeDeliverLogs } = await import('../../../src/adapters/mech/contracts.js');
    const { fetchSignedEnvelopeFromIpfs, fetchFromIpfs } = await import('../../../src/adapters/mech/ipfs.js');
    const { SignedEnvelopeSchema } = await import('../../../src/types/envelope.js');

    const expectedHash = keccak256(new TextEncoder().encode('{"mocked":"jcs"}'));
    const fakeEnvelope = {
      schemaVersion: 'jinn.execution.v1',
      kind: 'prediction.v1',
      role: 'restoration',
      signature: {
        algo: 'secp256k1',
        signer: '0xabc',
        hash: expectedHash,
        sig: '0xsig',
      },
    };
    vi.mocked(fetchSignedEnvelopeFromIpfs).mockResolvedValueOnce(fakeEnvelope);
    vi.mocked((SignedEnvelopeSchema as any).parse).mockReturnValue(fakeEnvelope);
    vi.mocked(fetchFromIpfs).mockResolvedValueOnce({ data: 'solution' });
    vi.mocked(decodeDeliverLogs).mockReturnValueOnce([{
      requestId: REQUEST_ID,
      deliveryDataHex: TASK_CID_DIGEST,
      mechAddress: '0x9999999999999999999999999999999999999999',
    }]);

    const adapter = new MechAdapter({ ...TEST_CONFIG, routerClaimDeliveryVariant: 'v2' });
    await adapter.initialize();
    (adapter as any).publicClient.getBlockNumber = vi.fn().mockResolvedValue(101n);
    (adapter as any).publicClient.getLogs = vi.fn().mockResolvedValue([{ data: '0x', topics: [] }]);
    (adapter as any).deliveryBlockCursor = 100n;
    (adapter as any).pendingEvaluations.set(REQUEST_ID, { id: 'prediction-task-1', description: 'test' });
    (adapter as any).originalStates.set(REQUEST_ID, { id: 'prediction-task-1', description: 'test' });

    const gen = adapter.watchForDeliveries()[Symbol.asyncIterator]();
    await gen.next();

    expect(claimDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TEST_CONFIG.safeAddress,
      TEST_CONFIG.routerAddress,
      REQUEST_ID,
      { variant: 'v2', kind: 'solution', evidenceHash: expectedHash },
      undefined,
    );
    expect(fetchSignedEnvelopeFromIpfs).toHaveBeenCalledWith(TEST_CONFIG.ipfsGatewayUrl, TASK_CID);

    await adapter.stop();
  });
});
