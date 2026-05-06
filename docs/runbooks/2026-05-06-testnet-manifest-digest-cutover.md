# Testnet `manifestDigest` cutover — Base Sepolia

**Date:** 2026-05-06 (planned)
**Branch:** `opus/solvernet-creation-and-launch`
**Spec:** [`spec/2026-05-05-solvernet-creation-and-launch.md`](../../spec/2026-05-05-solvernet-creation-and-launch.md) §14, §15, §17 Decision 6
**Plan task:** [`docs/superpowers/plans/2026-05-06-solvernet-creation-and-launch-plan.md`](../superpowers/plans/2026-05-06-solvernet-creation-and-launch-plan.md) Task 26

## What changes

The TaskCoordinator + JinnRouterV3 contracts rename their `solverTypeDigest` storage/event field to `manifestDigest`. The Solidity rename itself is purely cosmetic at the wire level (storage layout, event topics, function selectors all unchanged — Solidity selectors and topics are computed from types, not param names).

What is **not** cosmetic: the daemon's task-posting code now computes the bytes32 stored in that field as `keccak256(manifestCid)` instead of `keccak256(solverType)`. Existing testnet tasks created before this cutover have a digest derived from the old semantic. New tasks created after will have a digest derived from the launched-instance manifest cid.

## Operational impact — testnet task-data clean break

Per spec §15 + Decision 6 (C-semantic), this is a **clean break** on testnet task data. Pre-release status; no external operators are running the new build yet, so there is no data migration burden.

After the cutover:

- **Fleets keep their identities.** Master EOAs, agent EOAs, agentIds, ERC-8004 IdentityRegistry records — all unchanged. No re-bootstrap.
- **TaskCoordinator + JinnRouterV3 keep their addresses.** Proxy upgrade preserves the public-facing addresses in `contracts/deployment-task-coordinator-router-v3-baseSepolia*.json`.
- **Existing in-flight tasks orphan.** Tasks created before the cutover have a digest of `keccak256("prediction.v1")`. New attempts/verdicts on those tasks will fail the policy hook's digest match. Operators will see them as stuck on-chain. Acceptable: in-flight count on Jinn-team's testnet is currently zero (verified before cutover; see "pre-cutover check" below).
- **New tasks work normally.** New `prediction.v1` tasks posted by the launcher daemon carry the manifest cid in the canonical task body and the `manifestDigest = keccak256(cid)` on chain.

## Subgraph

Subgraph V3 indexing has not yet been built (jinn-mono-qwdc.36). Until that lands, the operator catalog `/configuration#solvernets` and post-launch dashboard `/launcher/launched/:id` cannot show launched SolverNets across machines — daemon-side launch flow works, but cross-machine discovery is blocked. Plan to land V3 indexing before announcing the cutover to any external operators.

## Pre-cutover checklist

- [ ] `cd contracts && yarn test` — 449/449 passing on the renamed contracts (verified at commit `217cb804`)
- [ ] `cd client && npx tsc --noEmit && yarn vitest run` — daemon typecheck + tests green (verified at commit `11e3d47f`)
- [ ] Verify no in-flight tasks on Base Sepolia TaskCoordinator (`https://sepolia.basescan.org/address/<address>`) — should be 0 or only tasks the team is intentionally orphaning
- [ ] Confirm `DEPLOYER_PRIVATE_KEY` env var is set for the deploy environment
- [ ] Confirm `BASE_SEPOLIA_RPC_URL` is reachable
- [ ] Verify Studio/Graph deploy access token (only relevant once V3 indexing is built)

## Deploy command (TaskCoordinator + JinnRouterV3 implementation upgrade)

```bash
cd /path/to/jinn-mono/cargo/contracts
DEPLOYER_PRIVATE_KEY=<…> BASE_SEPOLIA_RPC_URL=<…> npx hardhat run scripts/upgrade-task-coordinator-router-v3.ts --network base-sepolia
```

The script preserves the public proxy addresses and replaces the implementation pointers. Output writes back to `deployment-task-coordinator-router-v3-baseSepolia*.json`.

## Post-deploy verification

1. Read `getTask(...)` against the proxy via the new ABI — struct field `manifestDigest` should decode correctly (same byte position; the rename is structurally cosmetic).
2. Post a fresh prediction.v1 Task via the daemon — verify the on-chain `TaskCreated.manifestDigest` topic equals `keccak256(<cid>)`.
3. Spot-check that pre-cutover tasks remain readable but their digest no longer matches the new policy-hook check (expected; they are orphaned).
4. Commit the updated deployment JSON (and any block-number updates) on the new branch with message:

```
chore(deploy): testnet upgrade for manifestDigest rename

TaskCoordinator + JinnRouterV3 implementation pointers swapped for the
post-rename bytecode. Proxy addresses preserved; storage layout
unchanged. Existing in-flight Tasks have orphan digests; new Tasks
carry keccak256(manifestCid) per spec §14 Decision 6.
```

## When to actually run

Defer until:
- The plan's Phase 7 daemon-side work is fully merged (currently on `opus/solvernet-creation-and-launch`)
- jinn-mono-qwdc.36 (subgraph V3 indexing) is in flight or complete, so post-deploy operators can actually see launched SolverNets
- Coordinated with anyone who has been dogfooding the testnet (currently: Jinn team only)

## Rollback

If the upgrade reveals a regression:

```bash
cd contracts
# Re-deploy the previous implementation; pass the previous bytecode hash via env
DEPLOYER_PRIVATE_KEY=<…> npx hardhat run scripts/upgrade-task-coordinator-router-v3.ts \
  --network base-sepolia
# Confirm the impl pointer reverted in the deployment JSON
```

Storage layout is identical pre/post (param-name-only Solidity rename), so a rollback is fully safe and does not require any data migration.
