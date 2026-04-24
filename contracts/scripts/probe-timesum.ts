/**
 * probe-timesum.ts — Reproducer for jinn-mono-5hc (VoteWeightingFast stall).
 *
 * VoteWeightingFast (_period=900s, _maxNumPeriods=1000) has a 10.4-day
 * quiet-tolerance limit. If no one checkpoints for longer than that, the
 * internal _getSum() loop caps at 1000 iterations without advancing
 * timeSum — each subsequent checkpoint() burns ~4.8M gas without progress.
 *
 * Usage:
 *   PHASE1A_TIMING_PROFILE=fast-test \
 *     npx hardhat run scripts/probe-timesum.ts --network sepolia
 *
 * Interpretation:
 *   gap > 1000 AND timeSum unchanged after 3 checkpoints → stuck, needs redeploy.
 *   gap ≤ 1000 AND timeSum advances to ≥ now → healthy.
 */

import { ethers } from "hardhat";
import { loadPhase1aArtifactsFromDisk } from "./lib/phase1a-rollout-helpers";

const VW_ABI = [
  "function WEEK() view returns (uint256)",
  "function MAX_NUM_WEEKS() view returns (uint256)",
  "function timeSum() view returns (uint256)",
  "function checkpoint()",
];

async function main() {
  const a = loadPhase1aArtifactsFromDisk();
  const [signer] = await ethers.getSigners();
  const vw = new ethers.Contract(a.voteWeightingL1, VW_ABI, signer);
  const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  const week = (await vw.WEEK()) as bigint;
  const max = (await vw.MAX_NUM_WEEKS()) as bigint;

  console.log(`now:            ${now}`);
  console.log(`WEEK:           ${week}`);
  console.log(`MAX_NUM_WEEKS:  ${max}`);

  const before = (await vw.timeSum()) as bigint;
  console.log(`timeSum before: ${before} (gap=${(now - before) / week} periods)`);

  for (let i = 0; i < 3; i++) {
    const tx = await vw.checkpoint();
    const r = await tx.wait();
    const after = (await vw.timeSum()) as bigint;
    console.log(`checkpoint #${i + 1}: tx=${tx.hash} gas=${r!.gasUsed} timeSum=${after} (gap=${(BigInt((await ethers.provider.getBlock("latest"))!.timestamp) - after) / week})`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
