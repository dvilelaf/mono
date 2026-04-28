// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";

/// @title CanonicalOpStackMessengerInvariantTest — placeholder stub
/// @notice Foundry invariant harness for the canonical OP-Stack
///         messenger. Real invariants once the 8 `TODO(7x5)` markers in
///         CanonicalOpStackMessenger.sol have closed:
///
///           1. statelessness:
///                `verifyClaim` writes no storage. Property: between
///                two calls of `verifyClaim`, every storage slot of the
///                contract is unchanged (approximate via vm.load + a
///                hashed sample of slots; full coverage via `vm.snapshot`
///                + `vm.revertTo`).
///
///           2. proof envelope binding:
///                Proofs that decode but mismatch the expected emitter
///                address or claimTicketTopic always revert. Fuzz with
///                random emitters / topics.
///
///           3. tuple recovery surjective:
///                Given a well-formed log, the returned tuple equals
///                the values that the test harness encoded into
///                `topics` + `data`.
///
///           4. dispute-game finality (post-7x5):
///                `verifyClaim` reverts whenever
///                game.status() != DEFENDER_WINS or the airgap timer
///                has not elapsed. Tests must stub
///                IDisputeGameFactory + IFaultDisputeGame to drive
///                these states.
///
///           5. receipt MPT inclusion (post-7x5):
///                Mutating any byte of `receiptRLP` or the proof
///                without rebuilding the root produces a revert.
///
///         These will be authored under a follow-up to bd
///         `jinn-mono-sz0` once the deeper Fault Proof verification
///         logic ships.
///
/// @dev    Stub harness; verifies forge-std wiring only.
contract CanonicalOpStackMessengerInvariantTest is Test {
    function setUp() public {}

    /// @notice Sentinel — replace with real invariants under follow-up.
    function test_harnessWired() public pure {
        assertTrue(true);
    }
}
