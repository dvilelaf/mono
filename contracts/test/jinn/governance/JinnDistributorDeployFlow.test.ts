/**
 * JinnDistributorDeployFlow.test.ts — Phase A5 of the Jinn v0 MVI.
 *
 * End-to-end test that exercises the deploy-jinn-mvi-l1 script's wiring on
 * the Hardhat network and proves the full handover ceremony works:
 *
 *   1. Run {deployJinnMviL1} with a mock messenger.
 *   2. Verify post-deploy invariants:
 *        - JINN.minter == JinnDistributor
 *        - JINN.owner is still the deployer (Timelock pending)
 *        - JinnDistributor.owner is still the deployer (Timelock pending)
 *        - JINN.pendingOwner == Timelock
 *        - JinnDistributor.pendingOwner == Timelock
 *        - JinnDistributor.daoTreasury == Timelock
 *   3. Simulate the first-Governor-proposal handover by impersonating the
 *      Timelock and calling {acceptOwnership} on both JINN and the
 *      distributor. Verify ownership transferred.
 *   4. Submit a JinnDistributor.claim() via the MockMessenger fixture.
 *      Verify the operator-share JINN landed on the operator multisig and
 *      the DAO-share JINN landed on the Timelock.
 *   5. Sanity-check the canonical-mode wiring path by deploying the
 *      CanonicalOpStackMessenger with placeholder addresses and confirming
 *      it shows up in the deployment artifact.
 *
 * Reference: docs/planning/2026-04-jinn-mvi-on-olas.md and
 * 2026-04-jinn-cross-chain.md for the locked initial values used here.
 */

import { expect } from "chai";
import { ethers } from "hardhat";

import {
  FAST_TEST_GOVERNANCE_CONFIG,
  LOCKED_DISTRIBUTOR_INITIAL_CONFIG,
  CLAIM_TICKET_TOPIC,
} from "../../../scripts/lib/jinn-mvi-helpers";
import {
  deployJinnMviL1,
  type MessengerDeployParams,
} from "../../../scripts/deploy-jinn-mvi-l1";

const ONE = 10n ** 18n;

const JINN_FQN = "src/jinn/token/JINN.sol:JINN";
const DISTRIBUTOR_FQN = "src/jinn/distribution/JinnDistributor.sol:JinnDistributor";
const MOCK_MESSENGER_FQN = "src/jinn/cross-chain/MockMessenger.sol:MockMessenger";
const CANONICAL_MESSENGER_FQN =
  "src/jinn/cross-chain/CanonicalOpStackMessenger.sol:CanonicalOpStackMessenger";

function encodeServiceProof(serviceId: bigint): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [serviceId]);
}

/**
 * Move the deployer-held ownership of `jinn` and `distributor` to `timelock`
 * by impersonating the Timelock and calling `acceptOwnership` on both. This
 * mirrors what the first Governor proposal does on a live network.
 */
async function timelockAcceptsOwnership(
  jinn: any,
  distributor: any,
  timelockAddress: string,
): Promise<void> {
  await ethers.provider.send("hardhat_impersonateAccount", [timelockAddress]);
  await ethers.provider.send("hardhat_setBalance", [
    timelockAddress,
    "0x" + (10n ** 18n).toString(16),
  ]);
  const timelockSigner = await ethers.getSigner(timelockAddress);
  await jinn.connect(timelockSigner).acceptOwnership();
  await distributor.connect(timelockSigner).acceptOwnership();
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [
    timelockAddress,
  ]);
}

describe("JinnDistributor deploy + handover flow (Phase A5)", function () {
  this.timeout(120_000);

  describe("mock messenger mode (fast-test default)", function () {
    it("post-deploy: JINN.minter is the distributor, ownership is pending Timelock", async function () {
      const [deployer] = await ethers.getSigners();

      const result = await deployJinnMviL1(deployer, FAST_TEST_GOVERNANCE_CONFIG, {
        messenger: { mode: "mock" },
        distributorConfig: { ...LOCKED_DISTRIBUTOR_INITIAL_CONFIG },
      });

      expect(result.messengerMode).to.equal("mock");

      const jinn = await ethers.getContractAt(JINN_FQN, result.jinn);
      const distributor = await ethers.getContractAt(
        DISTRIBUTOR_FQN,
        result.distributor,
      );

      // Distributor is the minter; minting is gated on JINN.minter == sender.
      expect(await jinn.minter()).to.equal(result.distributor);

      // Both ownerships are still on the deployer; Timelock is the pending
      // owner on both. This is the canonical post-deploy state and the gate
      // for the first Governor proposal.
      expect(await jinn.owner()).to.equal(deployer.address);
      expect(await jinn.pendingOwner()).to.equal(result.timelock);
      expect(await distributor.owner()).to.equal(deployer.address);
      expect(await distributor.pendingOwner()).to.equal(result.timelock);

      // Distributor's DAO-share recipient is the Timelock.
      expect(await distributor.daoTreasury()).to.equal(result.timelock);

      // Distributor wiring matches the locked initial config.
      expect(await distributor.operatorRatio()).to.equal(
        LOCKED_DISTRIBUTOR_INITIAL_CONFIG.operatorRatio,
      );
      expect(await distributor.daoRatio()).to.equal(
        LOCKED_DISTRIBUTOR_INITIAL_CONFIG.daoRatio,
      );
      expect(await distributor.wCreation()).to.equal(
        LOCKED_DISTRIBUTOR_INITIAL_CONFIG.wCreation,
      );
      expect(await distributor.wRestorationDelivery()).to.equal(
        LOCKED_DISTRIBUTOR_INITIAL_CONFIG.wRestorationDelivery,
      );
      expect(await distributor.wEvaluationDelivery()).to.equal(
        LOCKED_DISTRIBUTOR_INITIAL_CONFIG.wEvaluationDelivery,
      );
    });

    it("Timelock acceptOwnership ceremony transfers both JINN and Distributor", async function () {
      const [deployer] = await ethers.getSigners();
      const result = await deployJinnMviL1(deployer, FAST_TEST_GOVERNANCE_CONFIG, {
        messenger: { mode: "mock" },
      });

      const jinn = await ethers.getContractAt(JINN_FQN, result.jinn);
      const distributor = await ethers.getContractAt(
        DISTRIBUTOR_FQN,
        result.distributor,
      );

      await timelockAcceptsOwnership(jinn, distributor, result.timelock);

      expect(await jinn.owner()).to.equal(result.timelock);
      expect(await jinn.pendingOwner()).to.equal(ethers.ZeroAddress);
      expect(await distributor.owner()).to.equal(result.timelock);
      expect(await distributor.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("happy-path claim: JINN mints to operator multisig and to Timelock", async function () {
      const [deployer, operatorMultisig] = await ethers.getSigners();
      const result = await deployJinnMviL1(deployer, FAST_TEST_GOVERNANCE_CONFIG, {
        messenger: { mode: "mock" },
      });

      const jinn = await ethers.getContractAt(JINN_FQN, result.jinn);
      const distributor = await ethers.getContractAt(
        DISTRIBUTOR_FQN,
        result.distributor,
      );
      const messenger = await ethers.getContractAt(
        MOCK_MESSENGER_FQN,
        result.messenger,
      );

      // Run the Timelock acceptOwnership ceremony so the post-handover state
      // is exercised end-to-end.
      await timelockAcceptsOwnership(jinn, distributor, result.timelock);

      // Pre-claim: zero supply.
      expect(await jinn.totalSupply()).to.equal(0n);
      expect(await jinn.balanceOf(operatorMultisig.address)).to.equal(0n);
      expect(await jinn.balanceOf(result.timelock)).to.equal(0n);

      // Inject a fixture for a service whose multisig is operatorMultisig.
      // Snapshot picks small numbers so weighted is exact under the locked
      // weights {1,1,1} and the locked ratios {0.75, 0.25}.
      //
      //   weighted = 1*10 + 1*20 + 1*5 = 35
      //   entitledOperator = 35 * 0.75e18 / 1e18 = 26
      //   entitledDao      = 35 * 0.25e18 / 1e18 =  8
      const SERVICE_ID = 7n;
      await messenger.connect(deployer).setFixture(SERVICE_ID, {
        verifiedCreations: 10n,
        noveltyWeightedRestorationDeliveries: 20n,
        evaluationDeliveryCount: 5n,
        multisig: operatorMultisig.address,
      });

      const weighted = 35n;
      const entitledOperator =
        (weighted * LOCKED_DISTRIBUTOR_INITIAL_CONFIG.operatorRatio) / ONE;
      const entitledDao =
        (weighted * LOCKED_DISTRIBUTOR_INITIAL_CONFIG.daoRatio) / ONE;
      expect(entitledOperator).to.equal(26n);
      expect(entitledDao).to.equal(8n);

      // Anyone can submit the proof — the recovered multisig + daoTreasury
      // are the mint recipients regardless of who pays gas.
      await expect(distributor.claim(encodeServiceProof(SERVICE_ID)))
        .to.emit(distributor, "Claimed")
        .withArgs(
          SERVICE_ID,
          operatorMultisig.address,
          entitledOperator,
          entitledDao,
          entitledOperator,
          entitledDao,
        );

      // Operator multisig got the operator share.
      expect(await jinn.balanceOf(operatorMultisig.address)).to.equal(
        entitledOperator,
      );
      // Timelock (= daoTreasury) got the DAO share.
      expect(await jinn.balanceOf(result.timelock)).to.equal(entitledDao);
      expect(await jinn.totalSupply()).to.equal(entitledOperator + entitledDao);

      // Accumulators advanced to the entitled high-water mark.
      expect(await distributor.totalClaimedOperator(SERVICE_ID)).to.equal(
        entitledOperator,
      );
      expect(await distributor.totalClaimedDao(SERVICE_ID)).to.equal(entitledDao);
    });

    it("replay protection: re-submitting the same proof is a clean no-op", async function () {
      const [deployer, operatorMultisig] = await ethers.getSigners();
      const result = await deployJinnMviL1(deployer, FAST_TEST_GOVERNANCE_CONFIG, {
        messenger: { mode: "mock" },
      });
      const jinn = await ethers.getContractAt(JINN_FQN, result.jinn);
      const distributor = await ethers.getContractAt(
        DISTRIBUTOR_FQN,
        result.distributor,
      );
      const messenger = await ethers.getContractAt(
        MOCK_MESSENGER_FQN,
        result.messenger,
      );

      const SERVICE_ID = 99n;
      await messenger.connect(deployer).setFixture(SERVICE_ID, {
        verifiedCreations: 10n,
        noveltyWeightedRestorationDeliveries: 20n,
        evaluationDeliveryCount: 5n,
        multisig: operatorMultisig.address,
      });

      await distributor.claim(encodeServiceProof(SERVICE_ID));
      const supplyAfterFirst = await jinn.totalSupply();

      // Replay — accumulators are sticky, no further mint, no event.
      const tx = await distributor.claim(encodeServiceProof(SERVICE_ID));
      const receipt = await tx.wait();
      expect(await jinn.totalSupply()).to.equal(supplyAfterFirst);
      const claimedTopic = distributor.interface.getEvent("Claimed")!.topicHash;
      const hasClaimedLog = receipt!.logs.some(
        (l: any) => l.topics[0] === claimedTopic,
      );
      expect(hasClaimedLog).to.equal(false);
    });
  });

  describe("canonical messenger mode wiring", function () {
    it("deploys CanonicalOpStackMessenger with the locked ClaimTicket topic", async function () {
      const [deployer, fakePortal, fakeFactory, fakeEmitter] =
        await ethers.getSigners();

      // Use placeholder addresses — we only assert wiring, not proof
      // verification. Real verification arrives under jinn-mono-7x5.
      const params: MessengerDeployParams = {
        mode: "canonical",
        wiring: {
          optimismPortal: fakePortal.address,
          disputeGameFactory: fakeFactory.address,
          expectedEmitter: fakeEmitter.address,
          claimTicketTopic: CLAIM_TICKET_TOPIC,
          authorisedGameType: 0,
        },
      };

      const result = await deployJinnMviL1(
        deployer,
        FAST_TEST_GOVERNANCE_CONFIG,
        { messenger: params },
      );

      expect(result.messengerMode).to.equal("canonical");

      const messenger = await ethers.getContractAt(
        CANONICAL_MESSENGER_FQN,
        result.messenger,
      );
      expect(await messenger.optimismPortal()).to.equal(fakePortal.address);
      expect(await messenger.disputeGameFactory()).to.equal(fakeFactory.address);
      expect(await messenger.expectedEmitter()).to.equal(fakeEmitter.address);
      expect(await messenger.claimTicketTopic()).to.equal(CLAIM_TICKET_TOPIC);

      // Distributor is wired to the canonical messenger.
      const distributor = await ethers.getContractAt(
        DISTRIBUTOR_FQN,
        result.distributor,
      );
      expect(await distributor.messenger()).to.equal(result.messenger);
    });
  });
});
