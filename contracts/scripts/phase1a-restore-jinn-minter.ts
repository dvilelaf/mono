/**
 * phase1a-restore-jinn-minter.ts — Restore Treasury as JINN minter.
 *
 * Idempotent one-shot fix for deployments where JINN.minter drifted away from
 * Treasury — typically because phase1a-mint-jinn-for-vote.ts was interrupted
 * between its temporary changeMinter(signer) and the finally-block restore.
 *
 * Effect: Treasury.depositTokenForOLAS() / withdrawToAccount() call JINN.mint()
 * internally; when Treasury isn't the minter those calls silently no-op under
 * OLAS Tokenomics accounting, so epoch inflation mints zero tokens and staking
 * incentives are returned-to-Treasury on claim. Restoring minter fixes that.
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... SEPOLIA_RPC_URL=... \
 *     PHASE1A_TIMING_PROFILE=fast-test \
 *     npx hardhat run scripts/phase1a-restore-jinn-minter.ts --network sepolia
 *
 * Safe to re-run: if minter already == Treasury, exits without sending a tx.
 */

import { ethers } from "hardhat";
import { loadJson, resolvePhase1aArtifactPaths } from "./lib/phase1a-rollout-helpers";

interface DeploymentArtifact {
  contracts: Record<string, string | undefined>;
}

const JINN_ABI = [
  "function owner() view returns (address)",
  "function minter() view returns (address)",
  "function changeMinter(address newMinter)",
];

function requireAddress(value: string | undefined, label: string): string {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Invalid address for ${label}: ${value}`);
  }
  return value;
}

async function main() {
  const paths = resolvePhase1aArtifactPaths();
  const deployment = loadJson<DeploymentArtifact>(paths.l1);
  const jinnAddr = requireAddress(
    process.env.JINN_TOKEN_L1 ?? deployment.contracts.JINN,
    "JINN",
  );
  const treasuryAddr = requireAddress(deployment.contracts.Treasury, "Treasury");

  const [signer] = await ethers.getSigners();
  const jinn = new ethers.Contract(jinnAddr, JINN_ABI, signer);

  const [owner, minter] = (await Promise.all([
    jinn.owner() as Promise<string>,
    jinn.minter() as Promise<string>,
  ])) as [string, string];

  console.log(`Signer:   ${signer.address}`);
  console.log(`JINN:     ${jinnAddr}`);
  console.log(`Treasury: ${treasuryAddr}`);
  console.log(`Owner:    ${owner}`);
  console.log(`Minter:   ${minter}`);

  if (minter.toLowerCase() === treasuryAddr.toLowerCase()) {
    console.log("Minter already matches Treasury — nothing to do.");
    return;
  }

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer ${signer.address} is not the JINN owner ${owner}; cannot call changeMinter.`,
    );
  }

  console.log(`Restoring minter: ${minter} → ${treasuryAddr}`);
  const tx = await jinn.changeMinter(treasuryAddr);
  console.log(`Tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Mined in block ${receipt?.blockNumber} (gas ${receipt?.gasUsed})`);

  const newMinter = (await jinn.minter()) as string;
  console.log(`New minter: ${newMinter}`);
  if (newMinter.toLowerCase() !== treasuryAddr.toLowerCase()) {
    throw new Error(`Post-tx minter mismatch: expected ${treasuryAddr}, got ${newMinter}`);
  }
  console.log("✓ Minter restored to Treasury.");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
