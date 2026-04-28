/**
 * Tests for CanonicalOpStackMessenger (Phase A4 / bd jinn-mono-6lq).
 *
 * NOTE: This is the skeleton implementation. Full Fault Proof
 * verification (DisputeGameFactory lookup, output-root Merkle proof,
 * receipt-MPT proof) is deferred to bd `jinn-mono-7x5` once Base
 * Sepolia finality has been measured. These tests cover only:
 *   - the documented `bytes proof` ABI decode,
 *   - the cheap surface checks the skeleton already enforces,
 *   - the round-trip from a hand-crafted proof blob to the
 *     IClaimMessenger 5-tuple.
 * Real Fault Proof tests will land alongside the 7x5 implementation.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');

const CLAIM_TICKET_SIG =
  'ClaimTicket(uint256,uint256,uint256,uint256,address,address)';

// Tuple layout for `OpStackProof` in CanonicalOpStackMessenger.sol.
const OP_STACK_PROOF_TUPLE =
  '(bytes32 disputeGameId, bytes outputRootProof, bytes32 receiptRoot, bytes receiptProof, bytes receiptRLP, uint256 logIndex, bytes32 expectedTxHash)';

// Tuple layout for `ClaimTicketLog`.
const CLAIM_TICKET_LOG_TUPLE =
  '(address emitter, bytes32 topic0, bytes32 topicServiceId, bytes32 topicMultisig, bytes32 topicClaimer, bytes data)';

describe('CanonicalOpStackMessenger', function () {
  this.timeout(30000);

  let messenger: any;
  let portal: any;
  let factory: any;
  let emitter: any;
  let claimer: any;
  let multisig: any;
  let topic0: string;

  const SERVICE_ID = 1234n;
  const VERIFIED_CREATIONS = 17n;
  const NOVELTY = 31n;
  const EVAL_DELIVERY = 9n;

  beforeEach(async function () {
    [portal, factory, emitter, claimer, multisig] = await ethers.getSigners();
    topic0 = ethers.id(CLAIM_TICKET_SIG);
    const Factory = await ethers.getContractFactory('CanonicalOpStackMessenger');
    messenger = await Factory.deploy(
      portal.address,
      factory.address,
      emitter.address,
      topic0,
    );
    await messenger.waitForDeployment();
  });

  function buildProof(overrides: Partial<{
    emitter: string;
    topic0: string;
    serviceId: bigint;
    multisig: string;
    claimer: string;
    verifiedCreations: bigint;
    novelty: bigint;
    evalDelivery: bigint;
    disputeGameId: string;
    outputRootProof: string;
    receiptRoot: string;
    receiptProof: string;
    receiptRLP: string;
    logIndex: bigint;
    expectedTxHash: string;
  }> = {}): string {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const opProof = {
      disputeGameId:
        overrides.disputeGameId ?? ethers.id('canonical-fault-game-1'),
      outputRootProof: overrides.outputRootProof ?? '0xdeadbeef',
      receiptRoot:
        overrides.receiptRoot ?? ethers.id('l2-receipt-root-block-N'),
      receiptProof: overrides.receiptProof ?? '0xfeedface',
      receiptRLP: overrides.receiptRLP ?? '0xc0',
      logIndex: overrides.logIndex ?? 0n,
      expectedTxHash:
        overrides.expectedTxHash ?? ethers.id('l2-tx-hash-stub'),
    };
    const log = {
      emitter: overrides.emitter ?? emitter.address,
      topic0: overrides.topic0 ?? topic0,
      topicServiceId: ethers.zeroPadValue(
        ethers.toBeHex(overrides.serviceId ?? SERVICE_ID),
        32,
      ),
      topicMultisig: ethers.zeroPadValue(
        overrides.multisig ?? multisig.address,
        32,
      ),
      topicClaimer: ethers.zeroPadValue(
        overrides.claimer ?? claimer.address,
        32,
      ),
      data: coder.encode(
        ['uint256', 'uint256', 'uint256'],
        [
          overrides.verifiedCreations ?? VERIFIED_CREATIONS,
          overrides.novelty ?? NOVELTY,
          overrides.evalDelivery ?? EVAL_DELIVERY,
        ],
      ),
    };
    return coder.encode(
      [OP_STACK_PROOF_TUPLE, CLAIM_TICKET_LOG_TUPLE],
      [opProof, log],
    );
  }

  it('exposes immutable deploy-time configuration', async function () {
    expect(await messenger.optimismPortal()).to.equal(portal.address);
    expect(await messenger.disputeGameFactory()).to.equal(factory.address);
    expect(await messenger.expectedEmitter()).to.equal(emitter.address);
    expect(await messenger.claimTicketTopic()).to.equal(topic0);
  });

  it('rejects zero-address / zero-bytes constructor args', async function () {
    const Factory = await ethers.getContractFactory('CanonicalOpStackMessenger');
    await expect(
      Factory.deploy(ethers.ZeroAddress, factory.address, emitter.address, topic0),
    ).to.be.revertedWith('CanonicalMessenger: portal=0');
    await expect(
      Factory.deploy(portal.address, ethers.ZeroAddress, emitter.address, topic0),
    ).to.be.revertedWith('CanonicalMessenger: factory=0');
    await expect(
      Factory.deploy(portal.address, factory.address, ethers.ZeroAddress, topic0),
    ).to.be.revertedWith('CanonicalMessenger: emitter=0');
    await expect(
      Factory.deploy(portal.address, factory.address, emitter.address, ethers.ZeroHash),
    ).to.be.revertedWith('CanonicalMessenger: topic=0');
  });

  it('reverts on empty proof bytes', async function () {
    await expect(messenger.verifyClaim('0x')).to.be.revertedWith(
      'CanonicalMessenger: empty proof',
    );
  });

  it('rejects logs from an emitter other than the configured one', async function () {
    const proof = buildProof({ emitter: claimer.address });
    await expect(messenger.verifyClaim(proof)).to.be.revertedWith(
      'CanonicalMessenger: bad emitter',
    );
  });

  it('rejects logs whose topic0 is not the ClaimTicket selector', async function () {
    const proof = buildProof({ topic0: ethers.id('SomeOtherEvent()') });
    await expect(messenger.verifyClaim(proof)).to.be.revertedWith(
      'CanonicalMessenger: bad selector',
    );
  });

  it('rejects proofs whose stub fields are obviously malformed', async function () {
    // Empty outputRootProof — caught by the 7x5 stub guard.
    await expect(
      messenger.verifyClaim(buildProof({ outputRootProof: '0x' })),
    ).to.be.revertedWith('CanonicalMessenger: bad outputRootProof');
    // Zero disputeGameId.
    await expect(
      messenger.verifyClaim(buildProof({ disputeGameId: ethers.ZeroHash })),
    ).to.be.revertedWith('CanonicalMessenger: bad gameId');
    // Empty receiptProof.
    await expect(
      messenger.verifyClaim(buildProof({ receiptProof: '0x' })),
    ).to.be.revertedWith('CanonicalMessenger: bad receiptProof');
    // Empty receiptRLP.
    await expect(
      messenger.verifyClaim(buildProof({ receiptRLP: '0x' })),
    ).to.be.revertedWith('CanonicalMessenger: bad receiptRLP');
  });

  it('decodes a well-formed proof and returns the embedded ClaimTicket tuple', async function () {
    const proof = buildProof();
    // Use callStatic-equivalent (view function) to read the tuple.
    const [
      serviceId,
      verifiedCreations,
      novelty,
      evalDelivery,
      multisigOut,
    ] = await messenger.verifyClaim(proof);
    expect(serviceId).to.equal(SERVICE_ID);
    expect(verifiedCreations).to.equal(VERIFIED_CREATIONS);
    expect(novelty).to.equal(NOVELTY);
    expect(evalDelivery).to.equal(EVAL_DELIVERY);
    expect(multisigOut).to.equal(multisig.address);
  });

  it('is idempotent: same proof decodes to the same tuple repeatedly', async function () {
    const proof = buildProof({ verifiedCreations: 100n, novelty: 200n });
    const a = await messenger.verifyClaim(proof);
    const b = await messenger.verifyClaim(proof);
    expect(a.serviceId).to.equal(b.serviceId);
    expect(a.verifiedCreations).to.equal(b.verifiedCreations);
    expect(a.noveltyWeightedRestorationDeliveries).to.equal(
      b.noveltyWeightedRestorationDeliveries,
    );
    expect(a.evaluationDeliveryCount).to.equal(b.evaluationDeliveryCount);
    expect(a.multisig).to.equal(b.multisig);
  });
});
