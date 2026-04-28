/**
 * deploy-jinn-mvi-l1.ts — Phase A5 of the Jinn v0 MVI.
 *
 * Deploys the L1 governance + distribution stack:
 *   1. JINN          — ERC20Votes governance token
 *   2. TimelockController — OZ standard, holds {JINN.owner} + {Distributor.owner}
 *   3. JinnGovernor       — OZ Governor module composition
 *   4. Messenger          — MockMessenger (mock mode) or CanonicalOpStackMessenger
 *                           (canonical mode); see {JinnMviMessengerMode}
 *   5. JinnDistributor    — Sole-minter cross-chain claim surface
 *
 * Wiring sequence (the order matters because Ownable2Step requires the
 * deployer to still hold ownership when calling {setMinter}):
 *
 *   - Deploy JINN, Timelock, Governor (steps 1–3).
 *   - Deploy messenger + distributor (steps 4–5) with the deployer as
 *     {distributor.owner} (transferred to Timelock at the end).
 *   - Set {JINN.minter} to the distributor while the deployer is still
 *     {JINN.owner}.
 *   - Grant the Governor PROPOSER + EXECUTOR + CANCELLER on the Timelock.
 *   - Transfer {JINN.owner} to the Timelock (Ownable2Step pending).
 *   - Transfer {Distributor.owner} to the Timelock (Ownable2Step pending).
 *   - Renounce the deployer's optional Timelock admin role.
 *
 *   Both {JINN.acceptOwnership} and {Distributor.acceptOwnership} must be
 *   called by the Timelock itself; the deploy script CANNOT do this on a
 *   live network. It must happen via the first Governor proposal once
 *   voting power has been bootstrapped. The console output flags this
 *   explicitly.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-jinn-mvi-l1.ts --network hardhat
 *   JINN_MVI_TIMING_PROFILE=fast-test npx hardhat run scripts/deploy-jinn-mvi-l1.ts --network sepolia
 *
 * Env vars:
 *   JINN_MVI_TIMING_PROFILE         "canonical" (default) | "fast-test"
 *   JINN_MVI_MESSENGER_MODE         "canonical" | "mock"; default follows timing profile
 *   JINN_MVI_OPTIMISM_PORTAL        canonical mode: L1 OptimismPortal2 address
 *   JINN_MVI_DISPUTE_GAME_FACTORY   canonical mode: DisputeGameFactory address
 *   JINN_MVI_CLAIM_EMITTER          canonical mode: deployed JinnClaimEmitter (L2)
 *   JINN_MVI_CLAIM_TICKET_TOPIC     canonical mode: optional, defaults to keccak256
 *                                   of the ClaimTicket signature
 *   DEPLOYER_PRIVATE_KEY            deployer wallet private key (live networks)
 *   RPC_URL                         optional; otherwise hardhat.config.ts is used
 *
 * Output:
 *   deployment-jinn-mvi-l1-{network}{-fast?}.json
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import {
  CANONICAL_GOVERNANCE_CONFIG,
  FAST_TEST_GOVERNANCE_CONFIG,
  JinnMviGovernanceConfig,
  JinnMviMessengerMode,
  JinnDistributorInitialConfig,
  LOCKED_DISTRIBUTOR_INITIAL_CONFIG,
  CanonicalMessengerWiring,
  getJinnMviGovernanceConfig,
  getJinnMviL1DeploymentArtifactName,
  resolveJinnMviTimingProfile,
  resolveJinnMviMessengerMode,
  resolveCanonicalMessengerWiring,
} from "./lib/jinn-mvi-helpers";

/**
 * Parameters that fully specify how a JinnDistributor messenger is
 * deployed. Either `mode === "mock"` (no extra wiring) or
 * `mode === "canonical"` with a {CanonicalMessengerWiring}.
 */
export type MessengerDeployParams =
  | { mode: "mock" }
  | { mode: "canonical"; wiring: CanonicalMessengerWiring };

export interface JinnMviL1Deployment {
  jinn: string;
  timelock: string;
  governor: string;
  distributor: string;
  messenger: string;
  messengerMode: JinnMviMessengerMode;
  config: JinnMviGovernanceConfig;
  distributorConfig: JinnDistributorInitialConfig;
}

/**
 * Deploy the messenger contract for the chosen mode. Returns the deployed
 * address — the caller wires it into the JinnDistributor.
 */
async function deployMessenger(
  signer: import("ethers").Signer,
  params: MessengerDeployParams,
): Promise<{ address: string; mode: JinnMviMessengerMode }> {
  if (params.mode === "mock") {
    const Mock = await ethers.getContractFactory(
      "src/jinn/cross-chain/MockMessenger.sol:MockMessenger",
      signer,
    );
    const messenger = await Mock.deploy(await signer.getAddress());
    await messenger.waitForDeployment();
    return { address: await messenger.getAddress(), mode: "mock" };
  }

  const Canonical = await ethers.getContractFactory(
    "src/jinn/cross-chain/CanonicalOpStackMessenger.sol:CanonicalOpStackMessenger",
    signer,
  );
  const messenger = await Canonical.deploy(
    params.wiring.optimismPortal,
    params.wiring.disputeGameFactory,
    params.wiring.expectedEmitter,
    params.wiring.claimTicketTopic,
  );
  await messenger.waitForDeployment();
  return { address: await messenger.getAddress(), mode: "canonical" };
}

export async function deployJinnMviL1(
  signer: import("ethers").Signer,
  config: JinnMviGovernanceConfig,
  options: {
    messenger?: MessengerDeployParams;
    distributorConfig?: JinnDistributorInitialConfig;
  } = {},
): Promise<JinnMviL1Deployment> {
  const deployerAddress = await signer.getAddress();
  const messengerParams: MessengerDeployParams =
    options.messenger ?? { mode: "mock" };
  const distributorConfig: JinnDistributorInitialConfig =
    options.distributorConfig ?? { ...LOCKED_DISTRIBUTOR_INITIAL_CONFIG };

  // -----------------------------------------------------------------------
  // Step 1: JINN token — initialOwner = deployer (transferred to Timelock
  // in Step 6 below; uses Ownable2Step so the new owner must accept).
  // -----------------------------------------------------------------------
  const JINN = await ethers.getContractFactory(
    "src/jinn/token/JINN.sol:JINN",
    signer,
  );
  const jinn = await JINN.deploy(deployerAddress);
  await jinn.waitForDeployment();

  // -----------------------------------------------------------------------
  // Step 2: TimelockController — proposers + executors are wired in Step 6
  // after the Governor deploys. Admin = deployer for setup; renounced at
  // the end (see notes below).
  // -----------------------------------------------------------------------
  const Timelock = await ethers.getContractFactory(
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController",
    signer,
  );
  const timelock = await Timelock.deploy(
    config.timelockMinDelaySeconds,
    [], // proposers — granted later
    [], // executors — granted later
    deployerAddress, // optional admin for setup
  );
  await timelock.waitForDeployment();

  // -----------------------------------------------------------------------
  // Step 3: JinnGovernor — pulls voting power from JINN's ERC20Votes
  // checkpoints and routes execution through the Timelock.
  // -----------------------------------------------------------------------
  const Governor = await ethers.getContractFactory(
    "src/jinn/governance/JinnGovernor.sol:JinnGovernor",
    signer,
  );
  const governor = await Governor.deploy(
    await jinn.getAddress(),
    await timelock.getAddress(),
    config.votingDelaySeconds,
    config.votingPeriodSeconds,
    config.proposalThreshold,
    config.quorumNumerator,
  );
  await governor.waitForDeployment();

  // -----------------------------------------------------------------------
  // Step 4: Messenger — `mock` for fast-test / dev, `canonical` for live
  // OP-Stack message-passing finality.
  // -----------------------------------------------------------------------
  const messenger = await deployMessenger(signer, messengerParams);

  // -----------------------------------------------------------------------
  // Step 5: JinnDistributor — initialOwner = deployer (so we can call the
  // ownership-related plumbing below; transferred to the Timelock in Step
  // 7 via Ownable2Step). daoTreasury = Timelock — DAO-share mints land
  // there. The distributor cannot mint until JINN.minter is set to its
  // address (Step 6).
  // -----------------------------------------------------------------------
  const Distributor = await ethers.getContractFactory(
    "src/jinn/distribution/JinnDistributor.sol:JinnDistributor",
    signer,
  );
  const timelockAddress = await timelock.getAddress();
  const distributor = await Distributor.deploy(
    deployerAddress, // initialOwner — transferred to Timelock in Step 7
    await jinn.getAddress(),
    timelockAddress, // daoTreasury — DAO-share mint recipient
    messenger.address,
    distributorConfig.operatorRatio,
    distributorConfig.daoRatio,
    distributorConfig.wCreation,
    distributorConfig.wRestorationDelivery,
    distributorConfig.wEvaluationDelivery,
  );
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();

  // -----------------------------------------------------------------------
  // Step 6: Set JINN.minter = distributor BEFORE handing JINN ownership to
  // the Timelock. {setMinter} is `onlyOwner` and the deployer is still the
  // owner here. Once minter is set, the distributor can mint via its
  // {claim} flow.
  // -----------------------------------------------------------------------
  await (await jinn.setMinter(distributorAddress)).wait();

  // -----------------------------------------------------------------------
  // Step 7: Wire ownership.
  //
  // 7a. Grant Timelock roles to JinnGovernor:
  //     - PROPOSER_ROLE: only the Governor can schedule.
  //     - EXECUTOR_ROLE: only the Governor (safe default; alternative is
  //       address(0) for "anyone can execute", but we keep it tight in v0).
  //     - CANCELLER_ROLE: Governor can cancel its own queued proposals.
  // -----------------------------------------------------------------------
  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  const cancellerRole = await timelock.CANCELLER_ROLE();
  const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
  const governorAddress = await governor.getAddress();

  await (await timelock.grantRole(proposerRole, governorAddress)).wait();
  await (await timelock.grantRole(executorRole, governorAddress)).wait();
  await (await timelock.grantRole(cancellerRole, governorAddress)).wait();

  // 7b. Hand JINN ownership to the Timelock. Ownable2Step requires the new
  // owner to call {acceptOwnership} — on live networks this happens via a
  // first Governor proposal; on hardhat tests we do it via impersonation
  // so the resulting deployment matches the post-acceptance state.
  await (await jinn.transferOwnership(timelockAddress)).wait();

  // 7c. Hand JinnDistributor ownership to the Timelock. Same Ownable2Step
  // story — Timelock must call {acceptOwnership} via a Governor proposal
  // before {setMessenger} / {setRatios} / {setWeights} become callable.
  await (await distributor.transferOwnership(timelockAddress)).wait();

  // 7d. Renounce the optional Timelock admin role so the Timelock is the
  // sole admin of itself. Once renounced, all role changes must go through
  // a Governor proposal. The captain may want to defer this on testnet so
  // role mistakes can be fixed without a governance roundtrip — see the
  // README of this script.
  await (await timelock.renounceRole(adminRole, deployerAddress)).wait();

  return {
    jinn: await jinn.getAddress(),
    timelock: timelockAddress,
    governor: governorAddress,
    distributor: distributorAddress,
    messenger: messenger.address,
    messengerMode: messenger.mode,
    config,
    distributorConfig,
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "hardhat" : network.name;

  const profile = resolveJinnMviTimingProfile();
  const config: JinnMviGovernanceConfig = getJinnMviGovernanceConfig(profile);

  const messengerMode = resolveJinnMviMessengerMode(profile);
  let messengerParams: MessengerDeployParams;
  if (messengerMode === "mock") {
    messengerParams = { mode: "mock" };
  } else {
    const wiring = resolveCanonicalMessengerWiring();
    if (wiring === null) {
      throw new Error(
        "JINN_MVI_MESSENGER_MODE=canonical requires JINN_MVI_OPTIMISM_PORTAL, " +
          "JINN_MVI_DISPUTE_GAME_FACTORY, and JINN_MVI_CLAIM_EMITTER env vars. " +
          "Optionally set JINN_MVI_CLAIM_TICKET_TOPIC to override the default keccak256.",
      );
    }
    messengerParams = { mode: "canonical", wiring };
  }
  const distributorConfig: JinnDistributorInitialConfig = {
    ...LOCKED_DISTRIBUTOR_INITIAL_CONFIG,
  };

  console.log("=== Jinn v0 MVI L1 Deployment ===");
  console.log(`Network:        ${networkName} (chainId: ${network.chainId})`);
  console.log(`Deployer:       ${deployer.address}`);
  console.log(
    `Balance:        ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`,
  );
  console.log(`Timing profile: ${profile}`);
  console.log(`  votingDelay:        ${config.votingDelaySeconds}s`);
  console.log(`  votingPeriod:       ${config.votingPeriodSeconds}s`);
  console.log(`  proposalThreshold:  ${config.proposalThreshold.toString()}`);
  console.log(`  quorumFraction:     ${config.quorumNumerator}%`);
  console.log(`  timelockMinDelay:   ${config.timelockMinDelaySeconds}s`);
  console.log(`Messenger mode: ${messengerMode}`);
  if (messengerParams.mode === "canonical") {
    console.log(`  optimismPortal:     ${messengerParams.wiring.optimismPortal}`);
    console.log(`  disputeGameFactory: ${messengerParams.wiring.disputeGameFactory}`);
    console.log(`  expectedEmitter:    ${messengerParams.wiring.expectedEmitter}`);
    console.log(`  claimTicketTopic:   ${messengerParams.wiring.claimTicketTopic}`);
  }
  console.log(`Distributor initial:`);
  console.log(`  operatorRatio:        ${distributorConfig.operatorRatio.toString()}`);
  console.log(`  daoRatio:             ${distributorConfig.daoRatio.toString()}`);
  console.log(`  wCreation:            ${distributorConfig.wCreation.toString()}`);
  console.log(`  wRestorationDelivery: ${distributorConfig.wRestorationDelivery.toString()}`);
  console.log(`  wEvaluationDelivery:  ${distributorConfig.wEvaluationDelivery.toString()}`);
  console.log();

  console.log(
    "Deploying JINN, TimelockController, JinnGovernor, Messenger, JinnDistributor…\n",
  );
  const deployment = await deployJinnMviL1(deployer, config, {
    messenger: messengerParams,
    distributorConfig,
  });

  console.log("=== Deployment Summary ===");
  console.log(`  JINN               ${deployment.jinn}`);
  console.log(`  TimelockController ${deployment.timelock}`);
  console.log(`  JinnGovernor       ${deployment.governor}`);
  console.log(`  Messenger          ${deployment.messenger} (mode=${deployment.messengerMode})`);
  console.log(`  JinnDistributor    ${deployment.distributor}`);
  console.log();
  console.log("Notes:");
  console.log("  - JINN.minter is set to JinnDistributor.");
  console.log("  - JINN.owner is now the TimelockController (PENDING acceptance).");
  console.log("  - JinnDistributor.owner is now the TimelockController (PENDING acceptance).");
  console.log("  - Deployer's optional admin role on the Timelock has been renounced.");
  console.log("  - JinnDistributor.daoTreasury is the TimelockController.");
  console.log();
  console.log("Pending: Timelock must call acceptOwnership() on JINN and JinnDistributor");
  console.log("via the first Governor proposal post-deploy. Until then, governance-mutable");
  console.log("setters (setMinter / setMessenger / setRatios / setWeights) are unreachable.");

  const output = {
    network: networkName,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    config: {
      timingProfile: deployment.config.timingProfile,
      votingDelaySeconds: deployment.config.votingDelaySeconds,
      votingPeriodSeconds: deployment.config.votingPeriodSeconds,
      proposalThreshold: deployment.config.proposalThreshold.toString(),
      quorumNumerator: deployment.config.quorumNumerator,
      timelockMinDelaySeconds: deployment.config.timelockMinDelaySeconds,
    },
    distributor: {
      operatorRatio: deployment.distributorConfig.operatorRatio.toString(),
      daoRatio: deployment.distributorConfig.daoRatio.toString(),
      wCreation: deployment.distributorConfig.wCreation.toString(),
      wRestorationDelivery: deployment.distributorConfig.wRestorationDelivery.toString(),
      wEvaluationDelivery: deployment.distributorConfig.wEvaluationDelivery.toString(),
    },
    messenger: {
      mode: deployment.messengerMode,
      address: deployment.messenger,
    },
    contracts: {
      JINN: deployment.jinn,
      TimelockController: deployment.timelock,
      JinnGovernor: deployment.governor,
      JinnDistributor: deployment.distributor,
      Messenger: deployment.messenger,
    },
  };

  const outPath = path.resolve(
    process.cwd(),
    getJinnMviL1DeploymentArtifactName(deployment.config.timingProfile, networkName),
  );
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`\nDeployment written to: ${outPath}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
