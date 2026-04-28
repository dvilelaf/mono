/**
 * Tests for CanonicalOpStackMessenger.
 *
 * The messenger proves a stored JinnClaimEmitter snapshot hash against the
 * finalized OP output state root. These fixtures intentionally cover both
 * legacy CANNON-style gameType=0 and Base Sepolia/Azul gameType=621 without
 * relying on either game's implementation-specific selectors.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
import {
  CLAIM_TICKET_TOPIC,
  buildOutputRootArtifacts,
  encodeProof,
  type ClaimSnapshotFields,
} from './_op-stack-fixture';

const GAME_TYPE_CANNON = 0;
const GAME_TYPE_AZUL = 621;
const GAME_TYPE_OTHER = 7;
const STATUS_IN_PROGRESS = 0;
const STATUS_CHALLENGER_WINS = 1;
const STATUS_DEFENDER_WINS = 2;

describe('CanonicalOpStackMessenger (storage proof path)', function () {
  this.timeout(60000);

  let messenger: any;
  let factory: any;
  let portal: any;
  let game: any;
  let emitter: any;
  let otherEmitter: any;
  let multisig: any;

  const CLAIM_ID = 1n;
  const SERVICE_ID = 1234n;
  const VERIFIED_CREATIONS = 17n;
  const NOVELTY = 31n;
  const EVAL_DELIVERY = 9n;
  const AIRGAP = 60n;
  const DISPUTE_GAME_INDEX = 42n;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    emitter = signers[3];
    otherEmitter = signers[4];
    multisig = signers[5];

    const MockFactory = await ethers.getContractFactory('MockDisputeGameFactory');
    factory = await MockFactory.deploy();
    await factory.waitForDeployment();

    const MockPortal = await ethers.getContractFactory('MockOptimismPortal2');
    portal = await MockPortal.deploy();
    await portal.waitForDeployment();
    await portal.setDelay(AIRGAP);
    await portal.setGameFinalityDelay(0);
    await portal.setRespectedGameType(GAME_TYPE_AZUL);

    const MockGame = await ethers.getContractFactory('MockFaultDisputeGame');
    game = await MockGame.deploy();
    await game.waitForDeployment();

    const Messenger = await ethers.getContractFactory('CanonicalOpStackMessenger');
    messenger = await Messenger.deploy(
      await portal.getAddress(),
      await factory.getAddress(),
      emitter.address,
      CLAIM_TICKET_TOPIC,
    );
    await messenger.waitForDeployment();
  });

  async function setupHappyPath(opts: {
    gameType?: number;
    wasRespected?: boolean;
    fields?: Partial<ClaimSnapshotFields>;
  } = {}): Promise<{ proofBytes: string; fields: ClaimSnapshotFields }> {
    const fields: ClaimSnapshotFields = {
      claimId: opts.fields?.claimId ?? CLAIM_ID,
      serviceId: opts.fields?.serviceId ?? SERVICE_ID,
      verifiedCreations: opts.fields?.verifiedCreations ?? VERIFIED_CREATIONS,
      novelty: opts.fields?.novelty ?? NOVELTY,
      evalDelivery: opts.fields?.evalDelivery ?? EVAL_DELIVERY,
      multisig: opts.fields?.multisig ?? multisig.address,
    };
    const artifacts = buildOutputRootArtifacts(emitter.address, fields);
    const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
    const resolvedAt = now - AIRGAP - 1n;
    const gameType = opts.gameType ?? GAME_TYPE_AZUL;

    await game.configure(STATUS_DEFENDER_WINS, gameType, resolvedAt, artifacts.outputRoot);
    await game.setWasRespectedGameTypeWhenCreated(opts.wasRespected ?? true);
    await factory.setGame(DISPUTE_GAME_INDEX, gameType, resolvedAt, await game.getAddress());

    const proofBytes = encodeProof({
      disputeGameId: ethers.zeroPadValue(ethers.toBeHex(DISPUTE_GAME_INDEX), 32),
      outputRootProofBytes: artifacts.outputRootProofBytes,
      accountProof: artifacts.accountProof,
      storageProof: artifacts.storageProof,
      fields,
    });
    return { proofBytes, fields };
  }

  describe('constructor + getters', function () {
    it('exposes immutable deploy-time configuration', async function () {
      expect(await messenger.optimismPortal()).to.equal(await portal.getAddress());
      expect(await messenger.disputeGameFactory()).to.equal(await factory.getAddress());
      expect(await messenger.expectedEmitter()).to.equal(emitter.address);
      expect(await messenger.claimTicketTopic()).to.equal(CLAIM_TICKET_TOPIC);
      expect(await messenger.CLAIM_SNAPSHOT_HASHES_SLOT()).to.equal(1n);
    });

    it('rejects zero-address / zero-bytes constructor args', async function () {
      const Factory = await ethers.getContractFactory('CanonicalOpStackMessenger');
      const portalAddr = await portal.getAddress();
      const factoryAddr = await factory.getAddress();
      await expect(
        Factory.deploy(ethers.ZeroAddress, factoryAddr, emitter.address, CLAIM_TICKET_TOPIC),
      ).to.be.revertedWith('CanonicalMessenger: portal=0');
      await expect(
        Factory.deploy(portalAddr, ethers.ZeroAddress, emitter.address, CLAIM_TICKET_TOPIC),
      ).to.be.revertedWith('CanonicalMessenger: factory=0');
      await expect(
        Factory.deploy(portalAddr, factoryAddr, ethers.ZeroAddress, CLAIM_TICKET_TOPIC),
      ).to.be.revertedWith('CanonicalMessenger: emitter=0');
      await expect(
        Factory.deploy(portalAddr, factoryAddr, emitter.address, ethers.ZeroHash),
      ).to.be.revertedWith('CanonicalMessenger: topic=0');
    });

    it('reverts on empty proof bytes', async function () {
      await expect(messenger.verifyClaim('0x')).to.be.revertedWith(
        'CanonicalMessenger: empty proof',
      );
    });
  });

  describe('happy path', function () {
    it('accepts Base Sepolia/Azul gameType=621 and returns the ClaimTicket tuple', async function () {
      const { proofBytes } = await setupHappyPath({ gameType: GAME_TYPE_AZUL });
      const result = await messenger.verifyClaim(proofBytes);
      expect(result.serviceId).to.equal(SERVICE_ID);
      expect(result.verifiedCreations).to.equal(VERIFIED_CREATIONS);
      expect(result.noveltyWeightedRestorationDeliveries).to.equal(NOVELTY);
      expect(result.evaluationDeliveryCount).to.equal(EVAL_DELIVERY);
      expect(result.multisig).to.equal(multisig.address);
    });

    it('accepts current Base mainnet legacy gameType=0', async function () {
      const { proofBytes } = await setupHappyPath({ gameType: GAME_TYPE_CANNON });
      const result = await messenger.verifyClaim(proofBytes);
      expect(result.serviceId).to.equal(SERVICE_ID);
    });

    it('is idempotent — repeated verifyClaim returns the same tuple', async function () {
      const { proofBytes } = await setupHappyPath();
      const a = await messenger.verifyClaim(proofBytes);
      const b = await messenger.verifyClaim(proofBytes);
      expect(a.serviceId).to.equal(b.serviceId);
      expect(a.multisig).to.equal(b.multisig);
    });
  });

  describe('dispute-game failures', function () {
    it('reverts when the disputeGameId is zero', async function () {
      const { proofBytes } = await setupHappyPath();
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        proofBytes,
      )[0];
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        [[ethers.ZeroHash, decoded[1], decoded[2], decoded[3], decoded[4], decoded[5], decoded[6], decoded[7], decoded[8], decoded[9]]],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.revertedWithCustomError(
        messenger,
        'InvalidDisputeGame',
      );
    });

    it('reverts when the factory has no game at the index', async function () {
      const { proofBytes } = await setupHappyPath();
      await factory.clearGame(DISPUTE_GAME_INDEX);
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'InvalidDisputeGame',
      );
    });

    it('reverts when game.status() is IN_PROGRESS or CHALLENGER_WINS', async function () {
      const { proofBytes } = await setupHappyPath();
      const resolvedAt = BigInt((await ethers.provider.getBlock('latest'))!.timestamp) - AIRGAP - 1n;
      await game.configure(STATUS_IN_PROGRESS, GAME_TYPE_AZUL, resolvedAt, await game.rootClaim());
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'GameNotResolved',
      );

      await game.configure(STATUS_CHALLENGER_WINS, GAME_TYPE_AZUL, resolvedAt, await game.rootClaim());
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'GameNotResolved',
      );
    });

    it('reverts when the maturity or game-finality delay has not elapsed', async function () {
      const { proofBytes } = await setupHappyPath();
      const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
      await game.configure(STATUS_DEFENDER_WINS, GAME_TYPE_AZUL, now, await game.rootClaim());
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'AirgapNotElapsed',
      );

      await portal.setDelay(0);
      await portal.setGameFinalityDelay(AIRGAP);
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'AirgapNotElapsed',
      );
    });

    it('reverts on factory/proxy game type mismatch', async function () {
      const { proofBytes } = await setupHappyPath();
      const resolvedAt = BigInt((await ethers.provider.getBlock('latest'))!.timestamp) - AIRGAP - 1n;
      await factory.setGame(DISPUTE_GAME_INDEX, GAME_TYPE_OTHER, resolvedAt, await game.getAddress());
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'WrongGameType',
      );
    });

    it('reverts when the game was not respected and is not the portal current type', async function () {
      const { proofBytes } = await setupHappyPath({
        gameType: GAME_TYPE_OTHER,
        wasRespected: false,
      });
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'WrongGameType',
      );
    });
  });

  describe('storage proof failures', function () {
    it('reverts when outputRootProof preimage does not match game.rootClaim()', async function () {
      const { proofBytes } = await setupHappyPath();
      const resolvedAt = BigInt((await ethers.provider.getBlock('latest'))!.timestamp) - AIRGAP - 1n;
      await game.configure(
        STATUS_DEFENDER_WINS,
        GAME_TYPE_AZUL,
        resolvedAt,
        ethers.id('a-different-output-root'),
      );
      await expect(messenger.verifyClaim(proofBytes)).to.be.revertedWithCustomError(
        messenger,
        'OutputRootMismatch',
      );
    });

    it('reverts on empty account proof', async function () {
      const { proofBytes } = await setupHappyPath();
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        proofBytes,
      )[0];
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        [[decoded[0], decoded[1], [], decoded[3], decoded[4], decoded[5], decoded[6], decoded[7], decoded[8], decoded[9]]],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.revertedWithCustomError(
        messenger,
        'AccountMPTInvalid',
      );
    });

    it('reverts when the account proof is for the wrong emitter', async function () {
      const fields: ClaimSnapshotFields = {
        claimId: CLAIM_ID,
        serviceId: SERVICE_ID,
        verifiedCreations: VERIFIED_CREATIONS,
        novelty: NOVELTY,
        evalDelivery: EVAL_DELIVERY,
        multisig: multisig.address,
      };
      const artifacts = buildOutputRootArtifacts(otherEmitter.address, fields);
      const resolvedAt = BigInt((await ethers.provider.getBlock('latest'))!.timestamp) - AIRGAP - 1n;
      await game.configure(STATUS_DEFENDER_WINS, GAME_TYPE_AZUL, resolvedAt, artifacts.outputRoot);
      await factory.setGame(DISPUTE_GAME_INDEX, GAME_TYPE_AZUL, resolvedAt, await game.getAddress());

      const proofBytes = encodeProof({
        disputeGameId: ethers.zeroPadValue(ethers.toBeHex(DISPUTE_GAME_INDEX), 32),
        outputRootProofBytes: artifacts.outputRootProofBytes,
        accountProof: artifacts.accountProof,
        storageProof: artifacts.storageProof,
        fields,
      });
      await expect(messenger.verifyClaim(proofBytes)).to.be.reverted;
    });

    it('reverts on empty storage proof', async function () {
      const { proofBytes } = await setupHappyPath();
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        proofBytes,
      )[0];
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        [[decoded[0], decoded[1], decoded[2], [], decoded[4], decoded[5], decoded[6], decoded[7], decoded[8], decoded[9]]],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.revertedWithCustomError(
        messenger,
        'StorageMPTInvalid',
      );
    });

    it('reverts when the proof points at the wrong storage slot', async function () {
      const { proofBytes } = await setupHappyPath();
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        proofBytes,
      )[0];
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        [[decoded[0], decoded[1], decoded[2], decoded[3], CLAIM_ID + 1n, decoded[5], decoded[6], decoded[7], decoded[8], decoded[9]]],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.reverted;
    });

    it('reverts when the tuple no longer matches the stored snapshot hash', async function () {
      const { proofBytes } = await setupHappyPath();
      const decoded: any = ethers.AbiCoder.defaultAbiCoder().decode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        proofBytes,
      )[0];
      const tampered = ethers.AbiCoder.defaultAbiCoder().encode(
        ['(bytes32,bytes,bytes[],bytes[],uint256,uint256,uint256,uint256,uint256,address)'],
        [[decoded[0], decoded[1], decoded[2], decoded[3], decoded[4], decoded[5], decoded[6] + 1n, decoded[7], decoded[8], decoded[9]]],
      );
      await expect(messenger.verifyClaim(tampered)).to.be.revertedWithCustomError(
        messenger,
        'SnapshotHashMismatch',
      );
    });
  });
});
