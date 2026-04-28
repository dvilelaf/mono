/**
 * jinn-mvi-helpers.ts — Config + helper utilities for the v0 Jinn MVI L1 deploy
 * (JINN.sol + TimelockController + JinnGovernor).
 *
 * The protocol ships in two timing profiles:
 *
 *   - `canonical`  (mainnet defaults): 2-day voting delay, 14-day voting
 *                  period, 2-day timelock min delay. Matches the Doppler /
 *                  standard-OZ-Governor cadence.
 *   - `fast-test`  (compressed): 60s voting delay, 600s voting period, 60s
 *                  timelock min delay. Used on Sepolia and Hardhat for fast
 *                  iteration; compresses the 18-day mainnet path into ~22 min.
 *
 * Profile is selected via the `JINN_MVI_TIMING_PROFILE` environment variable.
 */

type EnvMap = Record<string, string | undefined>;

/** Identifier for the deploy timing profile. */
export type JinnMviTimingProfile = "canonical" | "fast-test";

/** Locked Governor + Timelock parameters. */
export interface JinnMviGovernanceConfig {
  /** Profile this config is built for. */
  timingProfile: JinnMviTimingProfile;
  /** {Governor.votingDelay} in seconds (uint48 in the contract). */
  votingDelaySeconds: number;
  /** {Governor.votingPeriod} in seconds (uint32 in the contract). */
  votingPeriodSeconds: number;
  /** Minimum JINN balance (wei) required to submit a proposal. */
  proposalThreshold: bigint;
  /** Quorum numerator; denominator is 100 (so 4 = 4%). */
  quorumNumerator: number;
  /** {TimelockController} minimum delay between schedule and execute. */
  timelockMinDelaySeconds: number;
}

/** Mainnet/canonical profile — protocol-locked v0 numbers. */
export const CANONICAL_GOVERNANCE_CONFIG: JinnMviGovernanceConfig = {
  timingProfile: "canonical",
  votingDelaySeconds: 172_800, // 2 days
  votingPeriodSeconds: 1_209_600, // 14 days
  proposalThreshold: 0n,
  quorumNumerator: 4, // 4%
  timelockMinDelaySeconds: 172_800, // 2 days
};

/** Compressed profile for testnet + local iteration. */
export const FAST_TEST_GOVERNANCE_CONFIG: JinnMviGovernanceConfig = {
  timingProfile: "fast-test",
  votingDelaySeconds: 60, // 1 minute
  votingPeriodSeconds: 600, // 10 minutes
  proposalThreshold: 0n,
  quorumNumerator: 4, // 4%
  timelockMinDelaySeconds: 60, // 1 minute
};

/** Pick a config by profile name. */
export function getJinnMviGovernanceConfig(
  profile: JinnMviTimingProfile,
): JinnMviGovernanceConfig {
  return profile === "fast-test"
    ? { ...FAST_TEST_GOVERNANCE_CONFIG }
    : { ...CANONICAL_GOVERNANCE_CONFIG };
}

/** Resolve the timing profile from env (`JINN_MVI_TIMING_PROFILE`). */
export function resolveJinnMviTimingProfile(
  env: EnvMap = process.env,
): JinnMviTimingProfile {
  return env.JINN_MVI_TIMING_PROFILE === "fast-test" ? "fast-test" : "canonical";
}

/** Standard artifact name for the v0 L1 deploy, parameterised by network. */
export function getJinnMviL1DeploymentArtifactName(
  profile: JinnMviTimingProfile,
  networkName: string,
): string {
  const suffix = profile === "fast-test" ? "-fast" : "";
  return `deployment-jinn-mvi-l1-${networkName}${suffix}.json`;
}
