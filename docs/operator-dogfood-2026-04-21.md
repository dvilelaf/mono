# Operator dogfood — 2026-04-21 night run

External-operator walkthrough of the `@jinn-network/client` canary on Base
Sepolia. Author: dogfood tester wearing the shoes of a first-time external
operator, with protocol-team keys alongside for the L1 tokenomics track.

Canary pin (run): `@jinn-network/client@0.1.1-canary.466a467a`
(sha `466a467ade6f7433d92236a921408f61d1b3e045`) — the daemon has been
running against this sha since `21:13Z`.

Canary pin (post-fix): `@jinn-network/client@0.1.1-canary.ab614048` —
published automatically after PR #19 (docs-only fix) merged to main at
`21:18Z`. Operators starting tomorrow should pin to this sha instead.

## Summary (fill in last)

- Canary versions used:
- Full loop landed?: TBD
- JINN rewards claimed?: TBD
- Source of claimed JINN: TBD
- Time from `jinn quickstart` to daemon running: TBD
- Cycles observed (full create → restore → eval → claim): TBD
- % PASS vs INDETERMINATE vs FAIL: TBD
- Time to first reward arrival in operator Safe: TBD

## Timeline

- `2026-04-21T21:05Z` — Session start. Dogfood env exported:
  - `JINN_EARNING_DIR=/Users/adrianobradley/.jinn-client/earning-dogfood-2026-04-21`
  - `JINN_DB_PATH=/Users/adrianobradley/.jinn-client/jinn-dogfood-2026-04-21.db`
  - `JINN_NETWORK=testnet`, `JINN_PASSWORD=<dogfood>`
- `21:05Z` — `npx @jinn-network/client@0.1.1-canary.466a467a doctor` failed with
  `could not determine executable to run`. Package exposes two bins (`jinn`,
  `jinn-mcp`); npx cannot auto-select. Workaround: `npx -p
  @jinn-network/client@0.1.1-canary.466a467a jinn doctor --human`. Doc says
  plain `npx @jinn-network/client@...` — filed as a UX finding.
- `21:06Z` — `jinn doctor --human` passed. keystore absent (expected for fresh
  operator), deployment resolved on base-sepolia, distributor holds
  880 JINN (44 services of runway), claude_auth bare. Canary sha captured
  `466a467ade6f7433d92236a921408f61d1b3e045`.
- `21:06Z` — `jinn intents list --human` shows prediction.v0 enabled by default
  with impl `prediction-v0-baseline`; portfolio.v0 registered but disabled.
- `21:07Z` — `jinn intents --help` does **not** advertise any `--impl` flag;
  task brief's suggested `jinn intents enable prediction.v0 --impl
  claude-mcp-prediction --yes` is not supported. Switching impl currently
  requires editing `config.restorers.byKind['prediction.v0']`. UX gap,
  filed as jinn-mono-38b.
- `21:09Z` — Track A: first `checkpoint-and-verify.ts` on Sepolia advanced
  epoch 7. Tx `0xec4be82e39fcb357f6679d7676a698adad9cd56720eae79636b7686dba824968`.
  Health OK. Red flag in the report: **"Minter is Treasury: ✗ WRONG"** and
  total supply unchanged across checkpoint (5800.019 JINN). Expected inflation
  of ~90 JINN/epoch missed — Treasury is not the JINN token minter, so epoch
  advance is not minting into Treasury. Filed as jinn-mono-hky.
- `21:09Z` — Track A: `phase1a-claim-staking-incentives.ts` ran through epoch
  8. Claimable JINN: 0. **Return amount: 113,971 JINN** (i.e. the entire
  inflation allocation for this nominee was returned to Treasury rather than
  bridged to L2). Tx `0xeeb8b3d3d1dfb28e550a1dc87e8183d7c224d9c9f442e24b166571a9c4e9a75d`.
  Nominee hash matches. Plausible cause: vote is newer than the snapshot used
  for epoch 8's inflation split, so we have to run more epochs before fresh
  JINN flows through to L2. Will re-verify on the next 15-min cadence.
- `21:10Z` — Track B: `jinn quickstart` running in background (pid 60535).
  Master EOA: `0x1a8435E635DBE7608611858eA5a0A0D9a28f8E6a`. CDP faucet
  auto-dripping to 0.005 ETH target (at drip 25/60, ~0.0025 ETH). No rate
  limit hit.
- `21:12Z` — Track B: bootstrap complete. Service id=30, safe
  `0x426306Edd920fd73D13b51DF8c3B9D4FB332bF26`, agent
  `0x9f8bBa00853A5CE6Aa9338c6710080BdE3c9D255`, mech
  `0x3Cd2512a1a88d850B283412a3C942b1b7A90326A`. distributor.stake tx
  `0x33bee07d8f6e053388199086eb29130b9f42cea2e08af7b646dc919bb38ee9d9`. Time
  from `jinn quickstart` start (~21:09) to daemon running (~21:13) ≈ 4 min,
  dominated by CDP drip loop (two passes needed because `run` re-checks and
  re-drips to 0.005 ETH after bootstrap spent the first top-up).
- `21:13Z` — Track B: daemon `kind=daemon_started`. auto-intent generator
  enabled, `ClaimRegistry: not configured (claim step will use
  NotImplementedError fallback)`. First observed intents at `0x49fa1272...`
  (kind=null) and `0x78126762...` (kind=prediction.v0). Both fail with
  `[NotImplemented] claim — fill in via subsequent task` because
  `JINN_CLAIM_REGISTRY_ADDRESS` is unset and the phase-1b-mech deployment
  JSON contains no claim-registry address. **Operator path blocker —**
  filed as jinn-mono-tt2 (missing deployment) + jinn-mono-fb7 (louder UX).
- `21:17Z` — Track B: `cast call jinnRouter creationCount(safe)` returns 2
  (two creation calls made it on-chain — daemon is posting successfully),
  but `restorationDeliveryCount` / `evaluationCreationCount` /
  `evaluationDeliveryCount` all return 0 — confirmed the claim blocker
  prevents any further progress along the loop. Router in use is
  `0x6059Dd37eB0FD3a55BCe7A3C1fA86AB84F2d9675` from the phase-1b-mech
  deployment — **not** the `0x7c502a...` the task brief cited (that address
  has 0 counters — it appears stale; filing to clarify).
- `21:20Z` — Track B: third auto-intent posted at 10-min boundary,
  `0x314ae602253ffb6de07412f20378c140d3e65bed00904d3bc896e1f2ef73bbcc`
  (kind=prediction.v0). creationCount=3, still no restoration.
- `21:23Z` — Track B: `jinn rewards --human` reports Service #0 =
  0 stOLAS pending / 0 claimed; next checkpoint 21:28Z. `jinn balance
  --human` prints JSON (verb seems to ignore `--human` — minor UX
  inconsistency, not filed). Master ETH has decayed to 3.09e15 wei
  (0.003 ETH) after the top-up consumed some; `jinn status --human`
  flags `exit.blocking: true, hint: "Master ETH is below the configured
  minimum runway threshold"`. Daemon still runs.
- `21:24Z` — Track A: second checkpoint attempt says `NOT READY — epoch
  8 still in progress`. No-op.
- `21:29Z` — Track A: checkpoint retry now READY, advances 8 → 9. Tx
  `0x1692c0dd6c11dca1edd115623e6501fdfca026aeb7f7cd5223d8b8ef5e7bc378`.
  Supply still flat (5800.019 JINN) — Treasury-not-minter bug persists.
- `21:29Z` — Track A: second claim-staking-incentives call, through
  epoch 9. Claimable=0, returnAmount=114,092 JINN back to Treasury. Tx
  `0x198d7f620c41acbce49a5640f3a242075e483ee577376af11451eb365a6a80bf`.
  Same shape as cycle 1: confirmation that jinn-mono-hky is the
  dominant blocker — no fresh JINN routes to L2 regardless of vote
  because Treasury has nothing to distribute.
- `21:40Z` — Track B: fifth auto-intent posted at boundary,
  `0xc61c8b72913116cb3745d217f7caed2d3abd08d5e3e87e0411b56d8ecf1d2e93`.
  creationCount=5, still no restoration.
- `21:40Z` — Track B: transient sepolia.base.org RPC timeouts +
  `HttpRequestError: fetch failed` on `eth_blockNumber` in the mech
  polling loop. Non-fatal; daemon keeps retrying. Worth noting
  because a less-tolerant operator would see these scrolling and
  assume the daemon was broken.
- `21:46Z` — Track A: third checkpoint cycle advances 9 → 10. Tx
  `0x006a6709476a56d0f8003eb7e07c9efa3f4ae7ce04873fe8c5b28566fbd44bff`.
  Supply still flat at 5800.019 JINN.
- `21:47Z` — Track A: third claim-staking-incentives, through epoch
  10. Returned 114,200 JINN to Treasury. Tx
  `0x1e8d02f1765a4e467471cf52731aff5a752908bdfd2cf06c3462a022384c4c66`.
  Three identical cycles now — confirmed shape. Cumulative phantom
  inflation routed back to Treasury across 3 cycles ≈ 342,263 JINN.
- `21:50Z` / `22:00Z` — Track B: sixth and seventh auto-intents
  posted at the next two boundaries. creationCount=7,
  restorationDeliveryCount still 0.
- `22:07Z` — Track A: fourth checkpoint cycle advances 10 → 11. Tx
  `0xb07eb7c4568636ada0dda562da94acd70a9596f999099a30bfe99704581c7e54`.
  Fourth claim-staking-incentives through epoch 11 returned 114,320
  JINN to Treasury. Tx
  `0x3cf525661154d82683096e517ebe9f0441b3c3f2740122c23ae147d353cdcacc`.
  Cumulative across 4 cycles ≈ 456,583 JINN of phantom inflation.
  The pattern is stable enough to stop itemising each cycle — the
  trend is "~114K JINN/15-min returned to Treasury, forever, until
  jinn-mono-hky is resolved." Will continue running checkpoints on
  cadence and only call out deviations.

## Track A (protocol-team cadence)

- L1 checkpoints run: 4 (epoch 7→8, 8→9, 9→10, 10→11); cadence steady
  at ~15 min/cycle
- L1 → L2 bridge calls successful: 4 (through epochs 8, 9, 10, 11 —
  all 100% returnAmount)
- Confirmed fresh JINN arrived on L2 via distributor (not just the 549 seed)?:
  **No.** Four consecutive cycles all returned 100% of the nominee's
  inflation allocation (113,971 → 114,092 → 114,200 → 114,320 JINN,
  sum ≈ 456,583) to Treasury. Root cause is jinn-mono-hky: Treasury
  is not the JINN token minter, so `totalSupply` is flat across
  checkpoints and the dispenser has nothing to route. Re-voting won't
  help until `transferMinter` runs.

Going-in snapshot: L1 Tokenomics ≈ epoch 7+ (deployment
`0x302cd1f188fCFcA64EA038aFa738D90951360739`), 1000 JINN locked in veJINN with
100% vote weight on L2 staking nominee
`0x2c286651590b4DdC6d58d1270069B43183a851D1`, vote active since
`2026-04-21T16:15:00Z`. 549 JINN pre-seeded in L2 staking contract as
fallback.

Known red flag: JINN token's minter is still the deployer EOA
`0x15e78734481bD31F6e183dad05225505a45ACd07`, not the Treasury. Until that
`transferMinter` call lands, `totalSupply` stays flat across checkpoints and
dispenser has no fresh JINN to route — any claim will always return the full
allocation to the Treasury regardless of the vote. Filed as jinn-mono-hky.

## Track B (operator path)

Daemon lifecycle:

| Time (UTC) | Event |
|---|---|
| 21:09Z | `jinn quickstart` invoked |
| 21:13Z | `daemon_started` event (pid 60535) |
| 21:13Z | Two intents observed; both fail at claim step |

Router counter snapshot at `21:17Z` (router
`0x6059Dd37eB0FD3a55BCe7A3C1fA86AB84F2d9675`, safe
`0x426306Edd920fd73D13b51DF8c3B9D4FB332bF26`):

| Counter | Value |
|---|---|
| `creationCount` | 2 |
| `restorationDeliveryCount` | 0 |
| `evaluationCreationCount` | 0 |
| `evaluationDeliveryCount` | 0 |

No cycles complete. Post-only mode in effect.

## Fixes shipped

- PR #19 — `docs(client): use npx -p flag so two-bin package resolves`
  (merged, sha `ab614048`). Touches `client/**` so a fresh canary will
  auto-publish; new sha to pin future steps against lives in the PR.

## Issues filed (not fixed)

- jinn-mono-7bc (P3) — npx canary package can't run without `-p` flag
  (two bins, ambiguous). Partly superseded by PR #19 docs fix; code-side
  option of renaming one bin still open.
- jinn-mono-38b (P2) — `jinn intents enable` is missing the `--impl`
  flag. Task brief assumed it existed; today requires editing
  `config.restorers.byKind`.
- jinn-mono-hky (P1) — Treasury is not the JINN token minter, so epoch
  checkpoints don't actually mint inflation. Protocol-team fix
  (`transferMinter`).
- jinn-mono-6a6 (P2) — Epoch 8 staking-incentives claim returned 113K
  JINN to Treasury. Needs more epochs to confirm whether this is a
  snapshot-timing artifact or a vote-weight wiring bug (partly blocked
  by jinn-mono-hky — Treasury has nothing to distribute until it can
  mint).
- jinn-mono-tt2 (P1) — **ClaimRegistry not deployed on Base Sepolia**,
  so the Phase 1b daemon can't claim any intent. Operator-loop blocker.
- jinn-mono-fb7 (P2) — Surface the ClaimRegistry gap louder at startup
  and in per-intent errors. UX follow-up to tt2.

## Blockers I couldn't resolve

- **ClaimRegistry missing on Base Sepolia (jinn-mono-tt2).** The daemon
  posts intents but can never claim them, which blocks the restore →
  eval → reward path. This needs a protocol-side deployment and a
  deployment-JSON update before an external operator can close the
  loop.
- **Treasury-not-minter on the L1 tokenomics stack (jinn-mono-hky).**
  Even once the vote-weight snapshot propagates, the dispenser will
  keep returning `returnAmount` to Treasury because Treasury has no
  mint rights to produce the epoch's inflation. Protocol-side fix.

## For an external operator

> **Heads up — the operator loop is not yet closable end-to-end on the
> current Phase 1b testnet.** The daemon will boot, fund itself via
> CDP, register a service, and post intents (creation counter on the
> router will advance), but it **cannot claim / restore / evaluate**
> until ClaimRegistry lands on Base Sepolia (jinn-mono-tt2). You can
> still start it up and confirm the posting side works — the missing
> pieces are loud at startup and in the log.

Copy-pasteable bootstrap:

```bash
# Pick a password + an isolated state dir:
export JINN_PASSWORD="<your-keystore-password>"
export JINN_NETWORK=testnet
export JINN_EARNING_DIR="$HOME/.jinn-client/earning-testnet"    # optional but recommended

# Zero-to-running: generates wallet, drips from CDP, bootstraps, starts the daemon:
npx -p @jinn-network/client@0.1.1-canary.ab614048 jinn quickstart
```

Sanity checks while it runs:

```bash
# Health + daemon state (JSON; hint field calls out runway problems):
npx -p @jinn-network/client@0.1.1-canary.ab614048 jinn status --human

# Recent protocol activity (intents posted, etc.):
npx -p @jinn-network/client@0.1.1-canary.ab614048 jinn history

# Pending rewards (stOLAS on testnet):
npx -p @jinn-network/client@0.1.1-canary.ab614048 jinn rewards --human
```

What you'll see:

- Master EOA funded via CDP in ~30-60s.
- `creationCount(yourSafe)` on the JinnRouter
  (`0x6059Dd37eB0FD3a55BCe7A3C1fA86AB84F2d9675`) grows by one every
  10-minute boundary as the auto-intent generator posts prediction.v0
  envelopes against ETH/USD.
- Every log line of the form `[daemon] engine.process failed for
  0x... : [NotImplemented] claim — fill in via subsequent task` is the
  ClaimRegistry blocker — not your fault. `restorationDeliveryCount`,
  `evaluationCreationCount`, and `evaluationDeliveryCount` will all
  stay at zero until that's resolved.
- `jinn rewards` will show 0 stOLAS pending / 0 claimed for the same
  reason.

Gotchas:

- `npx @jinn-network/client@... jinn-verb` **without** the `-p` flag
  fails — the package ships two bins. Always use `npx -p
  @jinn-network/client@<canary> jinn <verb>`.
- `jinn intents enable prediction.v0 --impl claude-mcp-prediction`
  isn't a real CLI flag. To switch from `prediction-v0-baseline` to
  the Claude-spawning impl, edit `~/.jinn-client/config.json` and set
  `"restorers": { "byKind": { "prediction.v0": "claude-mcp-prediction"
  } }`, then restart the daemon. (jinn-mono-38b.)
- The daemon decrypts an explicit password from `JINN_PASSWORD` — it
  is not read from config files. `quickstart` will auto-generate one
  under `~/.jinn-client/keystore-password` (mode 0600) if you don't
  set the env var.

## Evidence

| Artifact | Address / tx |
|---|---|
| Master EOA | [0x1a8435E635DBE7608611858eA5a0A0D9a28f8E6a](https://sepolia.basescan.org/address/0x1a8435E635DBE7608611858eA5a0A0D9a28f8E6a) |
| Operator Safe | [0x426306Edd920fd73D13b51DF8c3B9D4FB332bF26](https://sepolia.basescan.org/address/0x426306Edd920fd73D13b51DF8c3B9D4FB332bF26) |
| Service ID | 30 |
| Agent EOA | [0x9f8bBa00853A5CE6Aa9338c6710080BdE3c9D255](https://sepolia.basescan.org/address/0x9f8bBa00853A5CE6Aa9338c6710080BdE3c9D255) |
| Mech contract | [0x3Cd2512a1a88d850B283412a3C942b1b7A90326A](https://sepolia.basescan.org/address/0x3Cd2512a1a88d850B283412a3C942b1b7A90326A) |
| JinnRouter (in use) | [0x6059Dd37eB0FD3a55BCe7A3C1fA86AB84F2d9675](https://sepolia.basescan.org/address/0x6059Dd37eB0FD3a55BCe7A3C1fA86AB84F2d9675) |
| L1 Tokenomics | [0x302cd1f188fCFcA64EA038aFa738D90951360739](https://sepolia.etherscan.io/address/0x302cd1f188fCFcA64EA038aFa738D90951360739) |
| L1 checkpoint cycle 1 (epoch 7→8) | [0xec4be82e39fcb357f6679d7676a698adad9cd56720eae79636b7686dba824968](https://sepolia.etherscan.io/tx/0xec4be82e39fcb357f6679d7676a698adad9cd56720eae79636b7686dba824968) |
| L1 claim cycle 1 (100% returnAmount) | [0xeeb8b3d3d1dfb28e550a1dc87e8183d7c224d9c9f442e24b166571a9c4e9a75d](https://sepolia.etherscan.io/tx/0xeeb8b3d3d1dfb28e550a1dc87e8183d7c224d9c9f442e24b166571a9c4e9a75d) |
| L1 checkpoint cycle 2 (epoch 8→9) | [0x1692c0dd6c11dca1edd115623e6501fdfca026aeb7f7cd5223d8b8ef5e7bc378](https://sepolia.etherscan.io/tx/0x1692c0dd6c11dca1edd115623e6501fdfca026aeb7f7cd5223d8b8ef5e7bc378) |
| L1 claim cycle 2 (100% returnAmount) | [0x198d7f620c41acbce49a5640f3a242075e483ee577376af11451eb365a6a80bf](https://sepolia.etherscan.io/tx/0x198d7f620c41acbce49a5640f3a242075e483ee577376af11451eb365a6a80bf) |
| L1 checkpoint cycle 3 (epoch 9→10) | [0x006a6709476a56d0f8003eb7e07c9efa3f4ae7ce04873fe8c5b28566fbd44bff](https://sepolia.etherscan.io/tx/0x006a6709476a56d0f8003eb7e07c9efa3f4ae7ce04873fe8c5b28566fbd44bff) |
| L1 claim cycle 3 (100% returnAmount) | [0x1e8d02f1765a4e467471cf52731aff5a752908bdfd2cf06c3462a022384c4c66](https://sepolia.etherscan.io/tx/0x1e8d02f1765a4e467471cf52731aff5a752908bdfd2cf06c3462a022384c4c66) |
| Distributor stake tx | [0x33bee07d8f6e053388199086eb29130b9f42cea2e08af7b646dc919bb38ee9d9](https://sepolia.basescan.org/tx/0x33bee07d8f6e053388199086eb29130b9f42cea2e08af7b646dc919bb38ee9d9) |
| First restoration delivery | — (blocked by jinn-mono-tt2) |
| First eval delivery | — (blocked by jinn-mono-tt2) |
| Reward claim tx | — (blocked by jinn-mono-tt2) |

