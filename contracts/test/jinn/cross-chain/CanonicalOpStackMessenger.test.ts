/**
 * Tests for CanonicalOpStackMessenger (Phase A4 + bd `jinn-mono-7x5`).
 *
 * Covers the full Fault Proof verification path now that the 8
 * `TODO(7x5)` markers are closed:
 *   - Constructor wiring + immutable getters
 *   - DisputeGameFactory lookup + finality (status / airgap / type)
 *   - OP-Stack output-root reconstruction from
 *     (version, stateRoot, msgPasserRoot, blockHash)
 *   - Block-header RLP receiptsRoot binding
 *   - Receipt MPT inclusion (single-leaf trie at txIndex=0)
 *   - Typed-receipt envelope (EIP-2718) handling
 *   - Log emitter + topic[0] checks
 *   - Out-of-bounds logIndex
 *   - Statelessness (idempotent verify)
 *
 * Real Base Sepolia proofs harvested via `viem`'s op-stack actions
 * land alongside the daemon claim-loop work (separate scope), but
 * the on-chain validation logic is exercised here against
 * MockDisputeGameFactory / MockFaultDisputeGame / MockOptimismPortal2.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
import {
  CLAIM_TICKET_TOPIC,
  buildClaimTicketLog,
  encodeReceiptRLP,
  wrapTypedReceipt,
  buildSingleReceiptTrie,
  buildOutputRootArtifacts,
  encodeProof,
} from './_op-stack-fixture';

const GAME_TYPE_AUTH = 0; // permissioned Cannon
const GAME_TYPE_OTHER = 7;
const STATUS_IN_PROGRESS = 0;
const STATUS_CHALLENGER_WINS = 1;
const STATUS_DEFENDER_WINS = 2;

describe('CanonicalOpStackMessenger (full Fault Proof path)', function () {
  this.timeout(60000);

  let messenger: any;
  let factory: any;
  let portal: any;
  let game: any;
  let emitter: any;
  let multisig: any;
  let claimer: any;

  const SERVICE_ID = 1234n;
  const VERIFIED_CREATIONS = 17n;
  const NOVELTY = 31n;
  const EVAL_DELIVERY = 9n;
  const AIRGAP = 60n; // seconds
  const DISPUTE_GAME_INDEX = 42n;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    emitter = signers[3];
    multisig = signers[4];
    claimer = signers[5];

    // Deploy mocks.
    const MockFactory = await ethers.getContractFactory('MockDisputeGameFactory');
    factory = await MockFactory.deploy();
    await factory.waitForDeployment();

    const MockPortal = await ethers.getContractFactory('MockOptimismPortal2');
    portal = await MockPortal.deploy();
    await portal.waitForDeployment();
    await portal.setDelay(AIRGAP);

    const MockGame = await ethers.getContractFactory('MockFaultDisputeGame');
    game = await MockGame.deploy();
    await game.waitForDeployment();

    const Messenger = await ethers.getContractFactory('CanonicalOpStackMessenger');
    messenger = await Messenger.deploy(
      await portal.getAddress(),
      await factory.getAddress(),
      emitter.address,
      CLAIM_TICKET_TOPIC,
      GAME_TYPE_AUTH,
    );
    await messenger.waitForDeployment();
  });

  /**
   * Build a fully-resolved happy-path proof + configure mocks.
   *
   * Returns the encoded proof bytes ready for messenger.verifyClaim.
   */
  async function setupHappyPath(opts: {
    typed?: boolean;
    txType?: number;
    serviceId?: bigint;
    multisigAddr?: string;
    claimerAddr?: string;
    verifiedCreations?: bigint;
    novelty?: bigint;
    evalDelivery?: bigint;
    extraLogs?: number; // emit N extra unrelated logs before the target log
    targetLogIndex?: bigint; // override which logs[i] is the ClaimTicket
    overrideEmitter?: string;
    overrideTopic0?: string;
  } = {}): Promise<{ proofBytes: string }> {
    const log = buildClaimTicketLog(
      opts.overrideEmitter ?? emitter.address,
      {
        serviceId: opts.serviceId ?? SERVICE_ID,
        multisig: opts.multisigAddr ?? multisig.address,
        claimer: opts.claimerAddr ?? claimer.address,
        verifiedCreations: opts.verifiedCreations ?? VERIFIED_CREATIONS,
        novelty: opts.novelty ?? NOVELTY,
        evalDelivery: opts.evalDelivery ?? EVAL_DELIVERY,
      },
      opts.overrideTopic0 ?? CLAIM_TICKET_TOPIC,
    );

    const filler = {
      emitter: emitter.address,
      topics: [ethers.id('Filler()')],
      data: '0x',
    };
    const logs: typeof log[] = [];
    const extras = opts.extraLogs ?? 0;
    const tIdx = Number(opts.targetLogIndex ?? 0n);
    for (let i = 0; i < extras + 1; i++) {
      if (i === tIdx) logs.push(log);
      else logs.push(filler);
    }
    if (logs.length <= tIdx) logs[tIdx] = log;

    let receiptRLP = encodeReceiptRLP(logs);
    if (opts.typed) {
      receiptRLP = wrapTypedReceipt(receiptRLP, opts.txType ?? 2);
    }
    const trie = buildSingleReceiptTrie(receiptRLP);
    const orp = buildOutputRootArtifacts(trie.receiptRoot);

    // Configure dispute game and factory.
    const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
    const resolvedAt = now - AIRGAP - 1n; // safely past the airgap
    await game.configure(
      STATUS_DEFENDER_WINS,
      GAME_TYPE_AUTH,
      resolvedAt,
      orp.outputRoot,
    );
    await factory.setGame(
      DISPUTE_GAME_INDEX,
      GAME_TYPE_AUTH,
      resolvedAt,
      await game.getAddress(),
    );

    const proofBytes = encodeProof({
      disputeGameId: ethers.zeroPadValue(ethers.toBeHex(DISPUTE_GAME_INDEX), 32),
      outputRootProofBytes: orp.outputRootProofBytes,
      receiptRoot: trie.receiptRoot,
      receiptProof: trie.receiptProof,
      receiptRLP: trie.receiptRLP,
      logIndex: BigInt(tIdx),
      txIndex: trie.txIndex,
    });
    return { proofBytes };
  }

  describe('constructor + getters', function () {
    it('exposes immutable deploy-time configuration', async function () {
      expect(await messenger.optimismPortal()).to.equal(await portal.getAddress());
      expect(await messenger.disputeGameFactory()).to.equal(await factory.getAddress());
      expect(await messenger.expectedEmitter()).to.equal(emitter.address);
      expect(await messenger.claimTicketTopic()).to.equal(CLAIM_TICKET_TOPIC);
      expect(await messenger.authorisedGameType()).to.equal(GAME_TYPE_AUTH);
    });

    it('rejects zero-address / zero-bytes constructor args', async function () {
      const Factory = await ethers.getContractFactory('CanonicalOpStackMessenger');
      const portalAddr = await portal.getAddress();
      const factoryAddr = await factory.getAddress();
      await expect(
        Factory.deploy(ethers.ZeroAddress, factoryAddr, emitter.address, CLAIM_TICKET_TOPIC, 0),
      ).to.be.revertedWith('CanonicalMessenger: portal=0');
      await expect(
        Factory.deploy(portalAddr, ethers.ZeroAddress, emitter.address, CLAIM_TICKET_TOPIC, 0),
      ).to.be.revertedWith('CanonicalMessenger: factory=0');
      await expect(
        Factory.deploy(portalAddr, factoryAddr, ethers.ZeroAddress, CLAIM_TICKET_TOPIC, 0),
      ).to.be.revertedWith('CanonicalMessenger: emitter=0');
      await expect(
        Factory.deploy(portalAddr, factoryAddr, emitter.address, ethers.ZeroHash, 0),
      ).to.be.revertedWith('CanonicalMessenger: topic=0');
    });

    it('reverts on empty proof bytes', async function () {
      await expect(messenger.verifyClaim('0x')).to.be.revertedWith(
        'CanonicalMessenger: empty proof',
      );
    });
  });

  describe('happy path', function () {
    it('decodes a full canonical proof and returns the ClaimTicket tuple', async function () {
      const { proofBytes } = await setupHappyPath();
      const result = await messenger.verifyClaim(proofBytes);
      expect(result.serviceId).to.equal(SERVICE_ID);
      expect(result.verifiedCreations).to.equal(VERIFIED_CREATIONS);
      expect(result.noveltyWeightedRestorationDeliveries).to.equal(NOVELTY);
      expect(result.evaluationDeliveryCount).to.equal(EVAL_DELIVERY);
      expect(result.multisig).to.equal(multisig.address);
    });

    it('handles a typed (EIP-2718) receipt envelope', async function () {
      const { proofBytes } = await setupHappyPath({ typed: true, txType: 2 });
      const result = await messenger.verifyClaim(proofBytes);
      expect(result.serviceId).to.equal(SERVICE_ID);
      expect(result.multisig).to.equal(multisig.address);
    });

    it('extracts the correct log when not at logs[0]', async function () {
      const { proofBytes } = await setupHappyPath({
        extraLogs: 2,
        targetLogIndex: 2n,
      });
      const result = await messenger.verifyClaim(proofBytes);
      expect(result.serviceId).to.equal(SERVICE_ID);
    });

    it('is idempotent — repeated verifyClaim returns the same tuple', async function () {
      const { proofBytes } = await setupHappyPath();
      const a = await messenger.verifyClaim(proofBytes);
      const b = await messenger.verifyClaim(proofBytes);
      expect(a.serviceId).to.equal(b.serviceId);
      expect(a.verifiedCreations).to.equal(b.verifiedCreations);
      expect(a.noveltyWeightedRestorationDeliveries).to.equal(
        b.noveltyWeightedRestorationDeliveries,
      );
      expect(a.evaluationDeliveryCount).to.equal(b.evaluationDeliveryCount);
      expect(a.multisig).to.equal(b.multisig);
    });

    it('verifyClaim is view — no state writes', async function () {
      const { proofBytes } = await setupHappyPath();
      // Build a population call via ethCall (eth_call). Already
      // implicit by using the view return shape above; this test
      // additionally probes that issuing it does not change provider
      // state by sampling block numbers.
      const blockBefore = await ethers.provider.getBlockNumber();
      await messenger.verifyClaim(proofBytes);
      const blockAfter = await ethers.provider.getBlockNumber();
      expect(blockAfter).to.equal(blockBefore);
    });
  });

  describe('dispute-game finality failures', function () {
    it('reverts when the disputeGameId is zero', async function () {
      const { proofBytes } = await setupHappyPath();
      // Re-encode proof with zero disputeGameId.
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        [
          '(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)',
        ],
        proofBytes,
      )[0];
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          '(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)',
        ],
        [
          [
            ethers.ZeroHash,
            decoded[1],
            decoded[2],
            decoded[3],
            decoded[4],
            decoded[5],
            decoded[6],
            decoded[7],
          ],
        ],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.revertedWithCustomError(
        messenger,
        'InvalidDisputeGame',
      );
    });

    it('reverts when the factory has no game at the index', async function () {
      const { proofBytes } = await setupHappyPath();
      // Clear the game; lookup now returns proxy=address(0).
      await factory.clearGame(DISPUTE_GAME_INDEX);
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'InvalidDisputeGame',
      );
    });

    it('reverts when game.status() is IN_PROGRESS', async function () {
      const { proofBytes } = await setupHappyPath();
      const block = await ethers.provider.getBlock('latest');
      const resolvedAt = BigInt(block!.timestamp) - AIRGAP - 1n;
      await game.configure(
        STATUS_IN_PROGRESS,
        GAME_TYPE_AUTH,
        resolvedAt,
        await game.rootClaim(),
      );
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'GameNotResolved',
      );
    });

    it('reverts when game.status() is CHALLENGER_WINS', async function () {
      const { proofBytes } = await setupHappyPath();
      const block = await ethers.provider.getBlock('latest');
      const resolvedAt = BigInt(block!.timestamp) - AIRGAP - 1n;
      await game.configure(
        STATUS_CHALLENGER_WINS,
        GAME_TYPE_AUTH,
        resolvedAt,
        await game.rootClaim(),
      );
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'GameNotResolved',
      );
    });

    it('reverts when the airgap window has not elapsed', async function () {
      const { proofBytes } = await setupHappyPath();
      const block = await ethers.provider.getBlock('latest');
      const resolvedAt = BigInt(block!.timestamp); // not yet `+ airgap`
      await game.configure(
        STATUS_DEFENDER_WINS,
        GAME_TYPE_AUTH,
        resolvedAt,
        await game.rootClaim(),
      );
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'AirgapNotElapsed',
      );
    });

    it('reverts when factory entry has the wrong game type', async function () {
      const { proofBytes } = await setupHappyPath();
      // Re-register at the same index with a wrong type.
      const block = await ethers.provider.getBlock('latest');
      const resolvedAt = BigInt(block!.timestamp) - AIRGAP - 1n;
      await factory.setGame(
        DISPUTE_GAME_INDEX,
        GAME_TYPE_OTHER,
        resolvedAt,
        await game.getAddress(),
      );
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'WrongGameType',
      );
    });

    it('reverts when the game proxy reports a wrong gameType — substitution defence', async function () {
      const { proofBytes } = await setupHappyPath();
      const block = await ethers.provider.getBlock('latest');
      const resolvedAt = BigInt(block!.timestamp) - AIRGAP - 1n;
      // Factory entry passes; but the proxy reports a different game type.
      await game.configure(
        STATUS_DEFENDER_WINS,
        GAME_TYPE_OTHER,
        resolvedAt,
        await game.rootClaim(),
      );
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'WrongGameType',
      );
    });
  });

  describe('output-root failures', function () {
    it('reverts when outputRootProof preimage does not match game.rootClaim()', async function () {
      const { proofBytes } = await setupHappyPath();
      // Override the game's rootClaim to a different value.
      const block = await ethers.provider.getBlock('latest');
      const resolvedAt = BigInt(block!.timestamp) - AIRGAP - 1n;
      await game.configure(
        STATUS_DEFENDER_WINS,
        GAME_TYPE_AUTH,
        resolvedAt,
        ethers.id('a-different-output-root'),
      );
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'OutputRootMismatch',
      );
    });

    it("reverts when the block header does not hash to the embedded blockHash", async function () {
      const { proofBytes } = await setupHappyPath();
      // Decode, mutate the block header, re-pack.
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        proofBytes,
      )[0];
      const orpDecoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes32,bytes32,bytes32,bytes)'],
        decoded[1],
      )[0] as any;
      // Replace blockHeaderRLP with a bogus header so its hash != stated.
      const bogusHeaderRLP = ethers.encodeRlp([
        '0x' + 'aa'.repeat(32),
        '0x' + '00'.repeat(32),
        '0x' + '00'.repeat(20),
        '0x' + '00'.repeat(32),
        '0x' + '00'.repeat(32),
        decoded[2], // receiptsRoot still matches
        '0x' + '00'.repeat(256),
        '0x',
        '0x01',
        '0x',
        '0x',
        '0x',
        '0x',
        '0x' + '00'.repeat(32),
        '0x' + '00'.repeat(8),
      ]);
      const tamperedOrp = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes32,bytes32,bytes32,bytes)'],
        [
          [
            orpDecoded[0],
            orpDecoded[1],
            orpDecoded[2],
            orpDecoded[3], // keep stated blockHash
            bogusHeaderRLP, // but feed wrong header
          ],
        ],
      );
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        [
          [
            decoded[0],
            tamperedOrp,
            decoded[2],
            decoded[3],
            decoded[4],
            decoded[5],
            decoded[6],
            decoded[7],
          ],
        ],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.revertedWithCustomError(
        messenger,
        'BlockHashMismatch',
      );
    });

    it("reverts when the block header's receiptsRoot does not match the proof's receiptRoot", async function () {
      const { proofBytes } = await setupHappyPath();
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        proofBytes,
      )[0];
      // Tamper top-level receiptRoot to a different value — header still
      // commits to the original, so the equality check at the call-site
      // should fail with ReceiptRootMismatch.
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        [
          [
            decoded[0],
            decoded[1],
            ethers.id('mismatched-receipt-root'),
            decoded[3],
            decoded[4],
            decoded[5],
            decoded[6],
            decoded[7],
          ],
        ],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.revertedWithCustomError(
        messenger,
        'ReceiptRootMismatch',
      );
    });
  });

  describe('receipt MPT failures', function () {
    it('reverts when the MPT proof is empty', async function () {
      const { proofBytes } = await setupHappyPath();
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        proofBytes,
      )[0];
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        [
          [
            decoded[0],
            decoded[1],
            decoded[2],
            [], // empty receiptProof
            decoded[4],
            decoded[5],
            decoded[6],
            decoded[7],
          ],
        ],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.revertedWithCustomError(
        messenger,
        'ReceiptMPTInvalid',
      );
    });

    it('reverts when the receipt RLP does not match the leaf the MPT proof commits to', async function () {
      const { proofBytes } = await setupHappyPath();
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        proofBytes,
      )[0];
      // Tamper the receiptRLP — TrieProof.verify returns false.
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        [
          [
            decoded[0],
            decoded[1],
            decoded[2],
            decoded[3],
            '0xc0', // empty list — definitely not the proven leaf
            decoded[5],
            decoded[6],
            decoded[7],
          ],
        ],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.reverted;
    });

    it('reverts when logIndex is out of bounds', async function () {
      const { proofBytes } = await setupHappyPath();
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        proofBytes,
      )[0];
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes32,bytes[],bytes,uint256,uint256,bytes32)'],
        [
          [
            decoded[0],
            decoded[1],
            decoded[2],
            decoded[3],
            decoded[4],
            999n, // logIndex way past the end
            decoded[6],
            decoded[7],
          ],
        ],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.revertedWithCustomError(
        messenger,
        'LogIndexOutOfBounds',
      );
    });
  });

  describe('log-shape failures', function () {
    it('rejects logs whose emitter is not the expected one (impostor)', async function () {
      const { proofBytes } = await setupHappyPath({
        overrideEmitter: (await ethers.getSigners())[6].address,
      });
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'WrongLogEmitter',
      );
    });

    it('rejects logs whose topic[0] is not the ClaimTicket selector', async function () {
      const { proofBytes } = await setupHappyPath({
        overrideTopic0: ethers.id('SomeOtherEvent()'),
      });
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'WrongLogTopic',
      );
    });
  });
});
