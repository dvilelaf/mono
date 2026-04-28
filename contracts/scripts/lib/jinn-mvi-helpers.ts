/**
 * jinn-mvi-helpers.ts — Config + helper utilities for the v0 Jinn MVI L1 deploy
 * (JINN.sol + TimelockController + JinnGovernor + JinnDistributor).
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
 *
 * The L1 deploy also wires the JinnDistributor + a cross-chain messenger.
 * The messenger has two modes:
 *
 *   - `mock`       Deploys {MockMessenger}. Insecure by design — owner can
 *                  inject arbitrary fixtures. Default for `fast-test`.
 *   - `canonical`  Deploys {CanonicalOpStackMessenger} bound to L1 OptimismPortal2,
 *                  DisputeGameFactory, the L2 emitter, and the locked event topic.
 *                  Default for `canonical` timing profile. Live deploys must set
 *                  the four address/topic env vars below.
 *
 * Messenger mode is selected via the `JINN_MVI_MESSENGER_MODE` env var; if
 * unset, it follows the timing profile.
 */

import { ethers } from "ethers";

type EnvMap = Record<string, string | undefined>;

/** Identifier for the deploy timing profile. */
export type JinnMviTimingProfile = "canonical" | "fast-test";

/** Identifier for the cross-chain messenger mode. */
export type JinnMviMessengerMode = "mock" | "canonical";

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

// ---------------------------------------------------------------------------
// JinnDistributor — locked initial parameters
// ---------------------------------------------------------------------------

/**
 * Initial JinnDistributor parameters locked by
 * {@link file:cargo/docs/planning/2026-04-jinn-mvi-on-olas.md} +
 * {@link file:cargo/docs/planning/2026-04-jinn-cross-chain.md}.
 *
 * The operator/DAO ratios are 1e18 fixed point; weights are unscaled
 * integers. All five values are governance-mutable post-deploy and
 * intentionally not constrained to sum to 1e18 (see distributor docstring).
 */
export interface JinnDistributorInitialConfig {
  /** Operator-share multiplier, 1e18 fixed point. Default 0.75e18 (75%). */
  operatorRatio: bigint;
  /** DAO-share multiplier, 1e18 fixed point. Default 0.25e18 (25%). */
  daoRatio: bigint;
  /** Per-channel weight on verified creations. Default 1. */
  wCreation: bigint;
  /** Per-channel weight on novelty-weighted restoration deliveries. Default 1. */
  wRestorationDelivery: bigint;
  /** Per-channel weight on evaluation deliveries. Default 1. */
  wEvaluationDelivery: bigint;
}

/**
 * Locked v0 distributor parameters per the Phase A spec.
 * Captain note: changing these requires a Governor proposal post-deploy;
 * the constructor seeds them once.
 */
export const LOCKED_DISTRIBUTOR_INITIAL_CONFIG: JinnDistributorInitialConfig = {
  operatorRatio: (10n ** 18n * 75n) / 100n, // 0.75e18
  daoRatio: (10n ** 18n * 25n) / 100n, // 0.25e18
  wCreation: 1n,
  wRestorationDelivery: 1n,
  wEvaluationDelivery: 1n,
};

// ---------------------------------------------------------------------------
// Messenger mode resolution
// ---------------------------------------------------------------------------

/** Default messenger mode for a given timing profile. */
export function defaultMessengerMode(
  profile: JinnMviTimingProfile,
): JinnMviMessengerMode {
  return profile === "fast-test" ? "mock" : "canonical";
}

/**
 * Resolve the messenger mode from env (`JINN_MVI_MESSENGER_MODE`). If unset,
 * defaults to {@link defaultMessengerMode} for the given timing profile.
 */
export function resolveJinnMviMessengerMode(
  profile: JinnMviTimingProfile,
  env: EnvMap = process.env,
): JinnMviMessengerMode {
  const raw = env.JINN_MVI_MESSENGER_MODE;
  if (raw === "mock" || raw === "canonical") return raw;
  return defaultMessengerMode(profile);
}

/**
 * Wiring for the canonical {CanonicalOpStackMessenger}.
 *
 * Required for `canonical` mode; deploy reverts if any field is missing.
 * Resolved from env vars on live networks; the integration test injects a
 * pre-cooked fixture instead.
 */
export interface CanonicalMessengerWiring {
  /** L1 OptimismPortal2 anchoring the L2 output roots. */
  optimismPortal: string;
  /** DisputeGameFactory used to look up FaultDisputeGames. */
  disputeGameFactory: string;
  /** Address of the deployed `JinnClaimEmitter` on the measurement chain. */
  expectedEmitter: string;
  /** topic0 of the `ClaimTicket` event. */
  claimTicketTopic: string;
}

/** Canonical `JinnClaimEmitter.ClaimTicket` event topic — locked at deploy. */
export const CLAIM_TICKET_TOPIC: string = ethers.id(
  "ClaimTicket(uint256,uint256,uint256,uint256,address,address)",
);

/**
 * Resolve canonical-mode wiring from env vars. Returns `null` if any of
 * the required vars is missing (caller decides what to do — the live
 * deploy errors out, while tests pass pre-cooked values directly).
 */
export function resolveCanonicalMessengerWiring(
  env: EnvMap = process.env,
): CanonicalMessengerWiring | null {
  const optimismPortal = env.JINN_MVI_OPTIMISM_PORTAL;
  const disputeGameFactory = env.JINN_MVI_DISPUTE_GAME_FACTORY;
  const expectedEmitter = env.JINN_MVI_CLAIM_EMITTER;
  if (!optimismPortal || !disputeGameFactory || !expectedEmitter) {
    return null;
  }
  return {
    optimismPortal,
    disputeGameFactory,
    expectedEmitter,
    claimTicketTopic: env.JINN_MVI_CLAIM_TICKET_TOPIC ?? CLAIM_TICKET_TOPIC,
  };
}
