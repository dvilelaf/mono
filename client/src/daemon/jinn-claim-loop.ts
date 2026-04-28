/**
 * Cross-chain JINN claim loop (Phase B / jinn-mono-7x5).
 *
 * Orchestrates the two-tx flow that turns on-chain protocol work on L2 into
 * JINN mints on L1:
 *
 *   1. Step A — emit on Base. Call `JinnClaimEmitter.emitClaim(serviceId)`
 *      on Base / Base Sepolia. The event records the three counters
 *      (`verifiedCreations`, `noveltyWeightedCounts`, `evaluationDeliveryCount`)
 *      atomically at one block.
 *   2. Step B — wait for finality. In `canonical` mode, wait for the
 *      FaultDisputeGame to resolve and the airgap to elapse, then build the
 *      OP-Stack proof. In `mock` mode, plant the matching fixture on the L1
 *      MockMessenger.
 *   3. Step C — submit on L1. Call `JinnDistributor.claim(proof)` on
 *      Sepolia / Ethereum. The distributor verifies, applies channel
 *      weights, and mints to the operator multisig + DAO Timelock.
 *
 * The loop is disabled when no `distributorAddress` is configured. Each
 * tick iterates over staked services in the FleetStateStore. Failures are
 * logged and surfaced via `tick_error` observability events; they don't
 * crash the daemon. Replay protection lives entirely in the distributor's
 * accumulators — repeated submissions are no-ops on the second mint.
 *
 * Configuration: `jinnClaimLoopIntervalMs` (default 1h), `jinnMessengerMode`
 * (`canonical` | `mock`). The `mock` path requires the daemon's L1 wallet to
 * be the MockMessenger's owner (set at deploy).
 */

import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { getAddress } from 'viem';
import type { FleetStateStore } from '../earning/store.js';
import type { Store } from '../store/store.js';
import { emitEvent } from '../observability/emit-event.js';
import { displayFleetServiceIndex } from '../earning/fleet-display-index.js';
import { waitForTransactionReceiptWithRetry } from '../tx-retry.js';
import { CLAIM_TICKET_TOPIC0, JINN_CLAIM_EMITTER_ABI } from '../earning/contracts.js';
import {
  fetchLatestClaimTicket,
  plantMockFixture,
  submitMockClaim,
  type MockClaimSnapshot,
} from './jinn-claim-loop-mock.js';
import {
  buildCanonicalProof,
  submitCanonicalClaim,
  CanonicalProofNotYetImplementedError,
} from './jinn-claim-loop-canonical.js';

export type JinnMessengerMode = 'canonical' | 'mock';

export interface JinnClaimLoopConfig {
  intervalMs: number;
  /** PublicClient bound to the L2 measurement chain (Base / Base Sepolia). */
  l2Client: PublicClient;
  /** WalletClient bound to L2 — pays gas for `emitClaim`. */
  l2Wallet: WalletClient;
  /** PublicClient bound to the L1 governance chain (Ethereum / Sepolia). */
  l1Client: PublicClient;
  /** WalletClient bound to L1 — pays gas for `setFixture` (mock) + `claim`. */
  l1Wallet: WalletClient;
  /** Per-service state. We tick each service with a stake. */
  store: FleetStateStore;
  chain: 'base' | 'base-sepolia';
  /** L2 JinnClaimEmitter address. Required. */
  claimEmitterAddress: Address;
  /** L1 JinnDistributor address. Required. */
  distributorAddress: Address;
  /** L1 messenger address. Required (MockMessenger or CanonicalOpStackMessenger). */
  messengerAddress: Address;
  /** 'canonical' or 'mock'. Defaults to 'canonical'. */
  messengerMode: JinnMessengerMode;
  /** Canonical-mode only — L1 OptimismPortal2 anchoring L2 output roots. */
  optimismPortalAddress?: Address;
  /** Canonical-mode only — L1 DisputeGameFactory. */
  disputeGameFactoryAddress?: Address;
  /** Daemon observability sink. */
  jinnStore?: Store;
}

export interface JinnClaimTickResult {
  ticks: number;
  emits: number;
  submits: number;
  errors: number;
}

/**
 * The orchestrator. One loop, one method per stage so they're individually
 * testable. Failures bubble to `runOnce` which records them and continues
 * to the next service — a single bad service must not stall the fleet.
 */
export class JinnClaimLoop {
  private stopped = false;

  constructor(private readonly config: JinnClaimLoopConfig) {}

  stop(): void {
    this.stopped = true;
  }

  /**
   * One tick: iterate the staked services and run emit → wait → submit for
   * each. Returns counters useful for tests and operational dashboards.
   */
  async runOnce(): Promise<JinnClaimTickResult> {
    const result: JinnClaimTickResult = { ticks: 0, emits: 0, submits: 0, errors: 0 };

    const state = await this.config.store.load(this.config.chain);
    for (const svc of state.services) {
      if (this.stopped) break;
      // Only services with a multisig + service id are eligible.
      if (svc.step !== 'complete' && svc.step !== 'mech_deployed') continue;
      if (svc.service_id == null || !svc.safe_address) continue;

      const displayIndex = displayFleetServiceIndex(svc);
      result.ticks++;

      try {
        await this.tickService({
          serviceId: BigInt(svc.service_id),
          displayIndex,
          multisig: getAddress(svc.safe_address) as Address,
        }, result);
      } catch (err) {
        result.errors++;
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[jinn-claim] Service ${svc.service_id}: ${detail}`);
        if (this.config.jinnStore) {
          emitEvent(this.config.jinnStore, {
            kind: 'tick_error',
            serviceIndex: displayIndex,
            outcome: 'failed',
            detail,
          }, 'jinn-claim');
        }
      }
    }

    return result;
  }

  /**
   * One service's full Step A → Step B → Step C run. Split out so tests
   * can drive a single service end-to-end without the iteration scaffold.
   */
  async tickService(
    args: { serviceId: bigint; displayIndex: number; multisig: Address },
    result: JinnClaimTickResult,
  ): Promise<void> {
    const { serviceId, displayIndex, multisig } = args;

    // Step A — emit ClaimTicket on L2.
    const emitTxHash = await this.emitOnL2(serviceId);
    result.emits++;
    if (this.config.jinnStore) {
      emitEvent(this.config.jinnStore, {
        kind: 'jinn_claim_emitted',
        serviceIndex: displayIndex,
        txHash: emitTxHash,
        outcome: 'ok',
        detail: `Emitted ClaimTicket for service ${serviceId}`,
      }, 'jinn-claim');
    }

    // Step B + C — diverge by mode.
    let submitTxHash: Hex;
    if (this.config.messengerMode === 'mock') {
      submitTxHash = await this.submitMock({
        serviceId,
        emitTxHash,
        multisig,
      });
    } else {
      submitTxHash = await this.submitCanonical({
        serviceId,
        emitTxHash,
      });
    }

    result.submits++;
    if (this.config.jinnStore) {
      emitEvent(this.config.jinnStore, {
        kind: 'jinn_claim_submitted',
        serviceIndex: displayIndex,
        txHash: submitTxHash,
        outcome: 'ok',
        detail:
          `Submitted ${this.config.messengerMode} claim for service ${serviceId}`,
      }, 'jinn-claim');
    }
  }

  /** Step A — `JinnClaimEmitter.emitClaim(serviceId)` on L2. */
  async emitOnL2(serviceId: bigint): Promise<Hex> {
    const account = this.config.l2Wallet.account;
    if (!account) throw new Error('L2 wallet has no account configured');

    const { request } = await this.config.l2Client.simulateContract({
      address: this.config.claimEmitterAddress,
      abi: JINN_CLAIM_EMITTER_ABI,
      functionName: 'emitClaim',
      args: [serviceId],
      account,
    });
    const hash = await this.config.l2Wallet.writeContract(request);
    await waitForTransactionReceiptWithRetry(this.config.l2Client, hash);
    return hash;
  }

  /** Mock-mode Step B + C: read the L2 event, plant fixture on L1, claim. */
  async submitMock(args: {
    serviceId: bigint;
    emitTxHash: Hex;
    multisig: Address;
  }): Promise<Hex> {
    const snapshot = await this.readSnapshot(args.serviceId, args.emitTxHash);
    if (snapshot.multisig.toLowerCase() !== args.multisig.toLowerCase()) {
      throw new Error(
        `[jinn-claim] L2 ClaimTicket multisig ${snapshot.multisig} does not match ` +
          `service multisig ${args.multisig} — refusing to plant mock fixture`,
      );
    }

    // Plant the fixture (daemon wallet must be MockMessenger.owner).
    const fixtureTx = await plantMockFixture(
      this.config.l1Client,
      this.config.l1Wallet,
      this.config.messengerAddress,
      snapshot,
    );
    await waitForTransactionReceiptWithRetry(this.config.l1Client, fixtureTx);

    // Submit the claim on L1.
    const claimTx = await submitMockClaim(
      this.config.l1Client,
      this.config.l1Wallet,
      this.config.distributorAddress,
      args.serviceId,
    );
    await waitForTransactionReceiptWithRetry(this.config.l1Client, claimTx);
    return claimTx;
  }

  /** Canonical-mode Step B + C: build OP-Stack proof, submit on L1. */
  async submitCanonical(args: { serviceId: bigint; emitTxHash: Hex }): Promise<Hex> {
    if (!this.config.optimismPortalAddress || !this.config.disputeGameFactoryAddress) {
      throw new Error(
        '[jinn-claim] canonical mode requires optimismPortalAddress + disputeGameFactoryAddress',
      );
    }

    // Resolve the L2 receipt to get the block + log index for the proof.
    const receipt = await this.config.l2Client.getTransactionReceipt({ hash: args.emitTxHash });
    const expectedEmitter = this.config.claimEmitterAddress.toLowerCase();
    const expectedTopic = CLAIM_TICKET_TOPIC0.toLowerCase();
    const claimLog = receipt.logs.find((log) =>
      log.address.toLowerCase() === expectedEmitter
      && log.topics[0]?.toLowerCase() === expectedTopic,
    );
    if (!claimLog) {
      throw new Error(`[jinn-claim] no ClaimTicket log in receipt ${args.emitTxHash}`);
    }

    const proof = await buildCanonicalProof(
      {
        l1Client: this.config.l1Client,
        l2Client: this.config.l2Client,
        optimismPortal: this.config.optimismPortalAddress,
        disputeGameFactory: this.config.disputeGameFactoryAddress,
      },
      {
        l2TxHash: args.emitTxHash,
        l2LogIndex: claimLog.logIndex ?? 0,
        l2BlockNumber: receipt.blockNumber,
      },
    );

    const hash = await submitCanonicalClaim(
      this.config.l1Client,
      this.config.l1Wallet,
      this.config.distributorAddress,
      proof,
    );
    await waitForTransactionReceiptWithRetry(this.config.l1Client, hash);
    return hash;
  }

  /**
   * Read the latest ClaimTicket for `serviceId` near `emitTxHash`. Bounded
   * to the emit block to avoid scanning the full chain on every tick.
   */
  private async readSnapshot(serviceId: bigint, emitTxHash: Hex): Promise<MockClaimSnapshot> {
    const receipt = await this.config.l2Client.getTransactionReceipt({ hash: emitTxHash });
    // Search a small window around the emit block.
    const fromBlock = receipt.blockNumber > 5n ? receipt.blockNumber - 5n : 0n;
    const toBlock = receipt.blockNumber + 5n;
    const snapshot = await fetchLatestClaimTicket(
      this.config.l2Client,
      this.config.claimEmitterAddress,
      serviceId,
      { fromBlock, toBlock },
    );
    if (!snapshot) {
      throw new Error(
        `[jinn-claim] no ClaimTicket event for service ${serviceId} near tx ${emitTxHash}`,
      );
    }
    return snapshot;
  }

  /** Loop forever, sleeping `intervalMs` between ticks. */
  async run(): Promise<void> {
    if (this.config.intervalMs <= 0) return;

    while (!this.stopped) {
      try {
        await this.runOnce();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[jinn-claim] Tick failed (non-fatal): ${detail}`);
        if (this.config.jinnStore) {
          emitEvent(this.config.jinnStore, {
            kind: 'tick_error',
            outcome: 'failed',
            detail,
          }, 'jinn-claim');
        }
      }
      this.config.jinnStore?.setConfigValue(
        'last_jinn_claim_tick_at',
        new Date().toISOString(),
      );
      await new Promise((r) => setTimeout(r, this.config.intervalMs));
    }
  }
}

export { CanonicalProofNotYetImplementedError };
