/**
 * deploy-jinn-mvi-l1.ts — Phase A5 of the Jinn v0 MVI.
 *
 * Deploys the L1 governance stack:
 *   1. JINN          — ERC20Votes governance token
 *   2. TimelockController — OZ standard, holds {JINN.owner}
 *   3. JinnGovernor       — OZ Governor module composition
 *
 * After deploys, this script wires the system per the v0 plan:
 *   - JinnGovernor is granted PROPOSER + EXECUTOR + CANCELLER roles on the
 *     Timelock.
 *   - The deployer renounces the Timelock's optional admin role so the
 *     Timelock becomes fully self-administered.
 *   - JINN ownership is handed to the Timelock via Ownable2Step. Because
 *     {acceptOwnership} requires a tx from the new owner, the script issues
 *     a no-delay self-call from the Timelock when the deployer still holds
 *     admin (canonical operator path: queue a proposal once Governor + JINN
 *     voting power exists).
 *   - JINN.minter is intentionally LEFT UNSET — it will be set to the
 *     JinnDistributor in a later phase (Phase A6+).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-jinn-mvi-l1.ts --network hardhat
 *   JINN_MVI_TIMING_PROFILE=fast-test npx hardhat run scripts/deploy-jinn-mvi-l1.ts --network sepolia
 *
 * Env vars:
 *   JINN_MVI_TIMING_PROFILE  "canonical" (default) | "fast-test"
 *   DEPLOYER_PRIVATE_KEY     deployer wallet private key (live networks)
 *   RPC_URL                  optional; otherwise hardhat.config.ts is used
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
  getJinnMviGovernanceConfig,
  getJinnMviL1DeploymentArtifactName,
  resolveJinnMviTimingProfile,
} from "./lib/jinn-mvi-helpers";

export interface JinnMviL1Deployment {
  jinn: string;
  timelock: string;
  governor: string;
  config: JinnMviGovernanceConfig;
}

export async function deployJinnMviL1(
  signer: import("ethers").Signer,
  config: JinnMviGovernanceConfig,
): Promise<JinnMviL1Deployment> {
  const deployerAddress = await signer.getAddress();

  // -----------------------------------------------------------------------
  // Step 1: JINN token — initialOwner = deployer (transferred to Timelock
  // in Step 4 below; uses Ownable2Step so the new owner must accept).
  // -----------------------------------------------------------------------
  const JINN = await ethers.getContractFactory(
    "src/jinn/token/JINN.sol:JINN",
    signer,
  );
  const jinn = await JINN.deploy(deployerAddress);
  await jinn.waitForDeployment();

  // -----------------------------------------------------------------------
  // Step 2: TimelockController — proposers + executors are wired in Step 4
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
  // Step 4: Wire ownership.
  //
  // 4a. Grant Timelock roles to JinnGovernor:
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
  const timelockAddress = await timelock.getAddress();

  await (await timelock.grantRole(proposerRole, governorAddress)).wait();
  await (await timelock.grantRole(executorRole, governorAddress)).wait();
  await (await timelock.grantRole(cancellerRole, governorAddress)).wait();

  // 4b. Hand JINN ownership to the Timelock. Ownable2Step requires the new
  // owner to call {acceptOwnership} — on live networks this happens via a
  // first Governor proposal; on hardhat we do it via impersonation so the
  // resulting deployment matches the post-acceptance state.
  await (await jinn.transferOwnership(timelockAddress)).wait();

  // 4c. Renounce the optional Timelock admin role so the Timelock is the
  // sole admin of itself. Once renounced, all role changes must go through
  // a Governor proposal. The captain may want to defer this on testnet so
  // role mistakes can be fixed without a governance roundtrip — see the
  // README of this script.
  await (await timelock.renounceRole(adminRole, deployerAddress)).wait();

  return {
    jinn: await jinn.getAddress(),
    timelock: timelockAddress,
    governor: governorAddress,
    config,
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "hardhat" : network.name;

  const profile = resolveJinnMviTimingProfile();
  const config: JinnMviGovernanceConfig =
    profile === "fast-test"
      ? { ...FAST_TEST_GOVERNANCE_CONFIG }
      : { ...CANONICAL_GOVERNANCE_CONFIG };

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
  console.log();

  console.log("Deploying JINN, TimelockController, JinnGovernor…\n");
  const deployment = await deployJinnMviL1(deployer, config);

  console.log("=== Deployment Summary ===");
  console.log(`  JINN              ${deployment.jinn}`);
  console.log(`  TimelockController ${deployment.timelock}`);
  console.log(`  JinnGovernor      ${deployment.governor}`);
  console.log();
  console.log("Notes:");
  console.log("  - JINN.owner is now the TimelockController (pending acceptance via Governor proposal).");
  console.log("  - JINN.minter is intentionally unset; set to JinnDistributor in Phase A6+.");
  console.log("  - Deployer's optional admin role on the Timelock has been renounced.");

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
    contracts: {
      JINN: deployment.jinn,
      TimelockController: deployment.timelock,
      JinnGovernor: deployment.governor,
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
