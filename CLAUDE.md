# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jinn Network monorepo. Phase 0 is complete (Base mainnet). Phase 1a (JINN token + DAO + distribution on testnet) is deployed and proven on Sepolia/Base Sepolia. Phase 1b (protocol hardening on testnet) is in progress — see `spec/2026-04-06-phase-1a-design.md` and `docs/superpowers/plans/2026-04-06-phase-1a-tokenomics.md`.

Jinn is a training protocol for agentic intents. It defines a loop (Creation → Execution → Evaluation → Knowledge) where intents are published with fees, participants attempt fulfillment, evaluators verify results, and knowledge accumulates to improve future attempts.

## Repository Structure

```
client/          TypeScript daemon — the main runnable component (@jinn-network/client)
  src/
    bin/jinn.ts          CLI entry point (compiled to dist/bin/jinn.js)
    bin/jinn-mcp.ts      MCP server entry point (jinn-mcp binary)
    main.ts              Library entry that boots the daemon
    config.ts            Config loader (file > env > defaults)
    index.ts             Library exports
    cli/
      index.ts           Subcommand dispatcher
      command.ts         CommandModule interface + COMMON_FLAGS
      commands/          One file per subcommand (auth, run, quickstart, doctor,
                         bootstrap, fleet, fleet-scale, status, history, logs,
                         balance, rewards, claim-rewards, withdraw, submit-intent,
                         intents, conformance, init, keys-backup, plugin-install,
                         migrate-agent-id, mcp, update, version, stop, fund-requirements)
      intent-registry-access.ts  Selects RestorerImpls by intent kind
    adapters/
      adapter.ts         ExecutionAdapter interface
      local/adapter.ts   In-memory adapter for testing
      mech/              OLAS Mech Marketplace + JinnRouter adapter (prod)
    daemon/
      daemon.ts          Orchestrates creator, engine-watcher, delivery-watcher loops
      creator.ts         Posts desired states via adapter
      delivery-watcher.ts  Claims deliveries, creates evaluation jobs
    intents/
      kinds/index.ts     SPEC_KINDS dispatch table + collectTestnetAutoIntentGenerators
      kinds/             One module per kind (portfolio.v0, prediction.v0,
                         prediction.apy.v0, learner-loop-test)
      posting-service.ts Submits signed intents to JinnRouter
      signing.ts         SignedIntentV1 EIP-712 signing
    restorer/
      engine/            RestorationEngine (state machine: claim → run → package → deliver)
      impls/index.ts     buildRestorerImpls — registers impls per intent kind
      impls/             claude-code-learner, claude-mcp-prediction[-apy],
                         claude-mcp-hyperliquid, legacy-claude, *-evaluator,
                         *-baseline (deterministic baselines used in evaluator pairs)
    runner/
      runner.ts          Runner interface
      claude.ts          Spawns Claude CLI via MCP for restoration/evaluation
      simple.ts          Callback-based runner for testing
    earning/
      bootstrap.ts       11-step state machine (wallet → Safe → staking → mech)
      contracts.ts       Chain config, ABIs, Base addresses
      safe-adapter.ts    Safe deployment + batch tx execution
      store.ts           Earning state persistence (~/.jinn-client/earning/)
      types.ts           EarningState Zod schema
    venues/              On-chain venue adapters: aave-v3, chainlink, hyperliquid
    preflight/           Startup checks: rpc-network, api-port, claude-auth, claude-binary
    conformance/         Self-test harness — `jinn conformance` exercises the loop
    trajectory/          Hash-chained trajectory capture (collector, schema, secret-scrub)
    reputation/          ERC-8004 reputation registry + feedback hook
    discovery/           ERC-8004 on-chain artifact registration; The Graph subgraph queries
    auth/erc8128.ts      ERC-8128 HTTP message signatures
    api/                 Hono HTTP API for artifact search/publish + peer sync
    mcp/                 MCP tools exposed to Claude subprocess (and the jinn-mcp binary)
    store/               SQLite persistence (activity, artifacts, recovery)
    x402/                Payment-gated artifact access
    observability/       Structured event emission
    errors/              Error envelope system (§6 of client-surface spec)
    validation/          Cross-cutting Zod validators
    withdraw/            Withdraw flows for fleet operators
    types/               DesiredState, errors, core types
  test/                  Vitest tests — mirrors src/ structure; e2e/ scripts run via tsx
    _support/            Shared fakes (claude, anvil, ipfs, clock, store, cli)
    e2e/                 validate.ts, staking.ts, stolas.ts, portfolio-v0.ts,
                         prediction-v0.ts, prediction-apy-v0.ts,
                         claude-code-learner-{full-cycle,portfolio-v0}.ts,
                         legacy-restorer.ts
  scripts/               Dev utilities: status, withdraw, release, sync-deployments,
                         testnet-acceptance host + Docker harnesses, smoke-test-pack,
                         mock-agent, write-dist-build-meta, gen-hl-signing-fixture
  fixtures/              Example configs (config.example.json, local-config.json)
  deployments/           Bundled deployment JSONs for testnet (auto-resolved at runtime)
  plugins/               Bundled agent plugins (claude-code-learner)
  skills/                Bundled agent skills (jinn-operator)

contracts/       Solidity smart contracts (Hardhat)
  src/
    claiming/            ClaimRegistry, AcceptAllChecker, IEligibilityChecker
    staking/             JinnRouter[V2] + Proxy, RestorationActivityChecker[V2],
                         ActivityCheckerProxy
    testnet/             JinnTestnetFaucet, MockV3Aggregator
    stubs/, vendor/      Test stubs and vendored deps
  scripts/               Deployment + ops scripts (deploy-phase1a*, deploy-phase1b*,
                         phase1a-* ops, status-phase1a-live, validate-phase1a, etc.)
  test/                  Hardhat tests
  deployment-*.json      Per-network deployment artifacts (sepolia, baseSepolia)

subgraph/        The Graph subgraph (@graphprotocol/graph-cli)
  schema.graphql, src/handlers/, src/mapping.ts, networks.json

spec/            Dated specification proposals (YYYY-MM-DD-<topic>.md)
docs/            Design specs, runbooks, planning, research, reviews
  superpowers/   Detailed design specs + implementation plans
  runbooks/      add-intent-kind, conformance, testing
growth/          Marketing assets, decks, growth docs (non-code)
legacy/          Frozen historical references (see below)
.github/         CI workflows: ci.yml, ci-subgraph.yml, docker.yml, npm-publish.yml
```

## Legacy reference

**Always check `legacy/jinn-cli-agents-reference/` when working on OLAS integration, staking, tokenomics, or Phase 1 contracts.** This frozen copy of the historical Jinn agent repo (originally at github.com/oaksprout/jinn-gemini) contains a wealth of relevant context:

- `contracts/staking/` — JinnRouter.sol (the deployed router), DeliveryActivityChecker, WhitelistedRequesterActivityChecker, deployment JSONs with all on-chain addresses
- `docs/context/olas-protocol.md` — Full OLAS architecture: governance (veOLAS, Governor, Timelock), registries, tokenomics (Treasury, Dispenser, Depository, Tokenomics epochs)
- `docs/context/olas-integration.md` — Wallet/key storage, service lifecycle, operating modes
- `docs/reference/jinn-staking.md` — All deployed staking contracts (V1-V3), parameters, reward economics, veOLAS lock strategy, nominee mechanics
- `docs/reference/olas-contracts.md` — Base mainnet contract addresses, MechMarketplace ABI
- `docs/reference/blood-written-rules.md` — Hard-won operational lessons (RPC limits, IPFS, polling, etc.)
- `docs/runbooks/` — Setup, deployment, recovery, troubleshooting guides
- `CLAUDE.md` — System architecture overview for the agent orchestration layer

The path was renamed from `jinn-cli-agents/` (git subtree) to `legacy/jinn-cli-agents-reference/`. Older docs and search results may still refer to the old path.

## Running the Client

### Prerequisites

- Node.js 22 (`corepack enable` once so Yarn matches each package’s `packageManager` field)
- Foundry (`anvil` for local fork, `cast` for funding)
- Claude Code CLI (`claude` in PATH — the daemon spawns it as a subprocess)

### Quick validation (Anvil fork, no real funds)

```bash
cd client
yarn install
yarn typecheck   # should be zero errors
yarn test        # vitest suite, all pass
yarn e2e         # full loop on Anvil fork of Base (test/e2e/validate.ts)
```

The e2e script spawns Anvil, bootstraps from scratch, runs create → restore → evaluate, and verifies staking rewards. Needs internet (Base RPC + IPFS).

### Production run

The daemon is invoked through the `jinn` CLI. From source (no build step, uses `tsx`):

```bash
cd client
JINN_PASSWORD=your-keystore-password yarn jinn run
```

Or with a config file:

```bash
JINN_PASSWORD=secret yarn jinn run --config ./my-config.json
```

For end users, the published binary is `jinn` (`@jinn-network/client` on npm).
The README's TL;DR is `jinn auth` → `jinn quickstart`. See `client/README.md`.

The `run` command will:
1. Run the earning bootstrap (wallet → Safe → service → staking → mech)
2. Pause at `awaiting_funding` if the wallet needs ETH/OLAS — fund and re-run
3. Start the daemon with 3 loops (creator, restorer, delivery-watcher)

### Running against Anvil fork (local dev)

```bash
# Terminal 1: start Anvil
anvil --fork-url https://sepolia.base.org --port 8545

# Terminal 2: run pointing at the fork
JINN_RPC_URL=http://127.0.0.1:8545 JINN_PASSWORD=test yarn jinn run
# Will pause at awaiting_funding — fund the printed master address via cast, then re-run
```

Funding on Anvil (use pre-funded account):
```bash
# Fund EOA with ETH
cast send <EOA_ADDRESS> --value 0.01ether \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://127.0.0.1:8545

# Fund Safe with OLAS (impersonate a whale)
cast rpc anvil_impersonateAccount <OLAS_WHALE> --rpc-url http://127.0.0.1:8545
cast send 0x54330d28ca3357F294334BDC454a032e7f353416 \
  "transfer(address,uint256)" <SAFE_ADDRESS> 5000000000000000000000 \
  --from <OLAS_WHALE> --rpc-url http://127.0.0.1:8545 --unlocked
```

## Config

Config file first, env var override. File at `~/.jinn-client/config.json` or `--config <path>`.

| Config key       | Env override             | Default                           |
|------------------|--------------------------|-----------------------------------|
| rpcUrl           | BASE_RPC_URL/JINN_RPC_URL| https://mainnet.base.org          |
| claudeModel      | JINN_CLAUDE_MODEL        | claude-haiku-4-5-20251001         |
| claudePath       | JINN_CLAUDE_PATH         | claude                            |
| pollIntervalMs   | JINN_POLL_INTERVAL_MS    | 5000                              |
| apiPort          | JINN_API_PORT            | 7331                              |
| dbPath           | JINN_DB_PATH             | ~/.jinn-client/jinn.db            |
| earningDir       | JINN_EARNING_DIR         | ~/.jinn-client/earning            |
| peers            | JINN_PEERS               | []                                |
| subgraphUrl      | JINN_SUBGRAPH_URL        | (none)                            |
| desiredStates    | JINN_DESIRED_STATES      | [health-check]                    |
| ipfsRegistryUrl  | JINN_IPFS_REGISTRY_URL   | https://registry.autonolas.tech   |
| ipfsGatewayUrl   | JINN_IPFS_GATEWAY_URL    | https://gateway.autonolas.tech    |
| engine.workingDirRoot | JINN_ENGINE_WORKING_DIR_ROOT | ~/.jinn-client/engine/work   |
| engine.implStateDirRoot | JINN_ENGINE_IMPL_STATE_DIR_ROOT | ~/.jinn-client/engine/impl-state |

`JINN_PASSWORD` is env-only — never in config files.

## On-Chain Addresses (Base)

| Component              | Address                                      |
|------------------------|----------------------------------------------|
| JinnRouter             | `0xfFa7118A3D820cd4E820010837D65FAfF463181B` |
| Activity checker proxy | `0x477C41Cccc8bd08027e40CEF80c25918C595a24d` |
| Mech marketplace       | `0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020` |
| Staking contract       | `0x51c5f4982b9b0b3c0482678f5847ea6228cc8e54` |
| OLAS token             | `0x54330d28ca3357F294334BDC454a032e7f353416` |

## Architecture

Three layers, top to bottom:

1. **DAO Layer (Ethereum Mainnet)** — JINN ERC-20 token, treasury with epoch emissions, ve-JINN gauge for directing emissions to distribution contracts (Phase 1+)
2. **Distribution Contracts (per-chain)** — Four incentive channels (creation, restoration, outcome, evaluation rewards), distribute JINN to qualifying participants (Phase 1+)
3. **Execution Layer (Base)** — OLAS Mech Marketplace (request/delivery), JinnRouter (loop enforcement + activity tracking), ERC-8004 (knowledge discovery), x402 (payment-gated knowledge access)

### How the daemon works

The daemon runs three concurrent loops:

1. **CreatorLoop** — posts each desired state once via `JinnRouter.createRestorationJob()`. On testnet, also drives the auto-intent generators registered by each spec kind (see `collectTestnetAutoIntentGenerators` in `client/src/intents/kinds/index.ts`).
2. **Engine watcher + `RestorationEngine`** — consumes `adapter.watchForRequests()`, drives the restorer state machine (claim → run via registered `RestorerImpl` → package → `mech.deliverToMarketplace()` + `JinnRouter.claimDelivery()`). Restorer impl selection is driven by `intent.kind` via `buildRestorerImpls` in `client/src/restorer/impls/index.ts`.
3. **DeliveryWatcherLoop** — watches for deliveries, calls `JinnRouter.claimDelivery()`, then creates evaluation jobs via `JinnRouter.createEvaluationJob()`. Evaluators are paired per kind (`*-evaluator` impls); some kinds also ship a deterministic `*-baseline` impl used as a reference output during evaluation.

Each JinnRouter call increments activity counters for the Safe multisig. The OLAS staking contract reads these counters at checkpoints to determine reward eligibility.

### Intent kinds and dispatch

The protocol is intent-kind-pluggable. A `spec.kind` string in a SignedIntentV1 envelope routes parsing, restorer selection, evaluator selection, and (on testnet) auto-generation. The single dispatch table is `SPEC_KINDS` in `client/src/intents/kinds/index.ts`; current kinds are `portfolio.v0`, `prediction.v0`, `prediction.apy.v0`, and `learner-loop-test`. To add a new in-repo kind, follow [`docs/runbooks/add-intent-kind.md`](docs/runbooks/add-intent-kind.md).

### CLI surface

The published binary is `jinn` (sources in `client/src/bin/jinn.ts` + `client/src/cli/`). Each subcommand is a self-contained module under `client/src/cli/commands/` with a `CommandModule` interface (deps injected for testability). Notable subcommands:

- `auth`, `quickstart`, `init`, `bootstrap`, `doctor` — onboarding + preflight
- `run` — the daemon (this is what users invoke; `yarn jinn run` from source)
- `submit-intent`, `intents` — author and inspect intents
- `status`, `history`, `logs`, `balance`, `rewards`, `claim-rewards`, `withdraw` — operator visibility and payouts
- `fleet`, `fleet-scale`, `fund-requirements` — multi-agent HD-wallet fleet ops
- `conformance` — self-test harness (see `client/src/conformance/`)
- `mcp` — runs the bundled MCP server (also exposed as the `jinn-mcp` binary)
- `plugin-install` — wires bundled agent plugins/skills into Claude Code / Codex / Cursor / Gemini

### Bundled agent integrations

`client/plugins/claude-code-learner/` and `client/skills/jinn-operator/` ship in the npm tarball (see `package.json#files`). `jinn plugin install` copies them into the local agent's plugin/skill directory so an LLM operator can drive `jinn quickstart` without bespoke prompts.

### Earning bootstrap

The `EarningBootstrapper` walks through 11 idempotent steps:
1. wallet — create agent EOA + encrypted keystore
2. safe_predicted — predict Safe address
3. awaiting_funding — gate until EOA has ETH + Safe has OLAS
4. safe_deployed — deploy Safe via factory
5. service_created — register service on-chain
6. service_activated — approve OLAS bond + activate
7. agents_registered — register agent in service
8. service_deployed — deploy service
9. service_staked — stake service in staking contract
10. mech_deployed — deploy mech via marketplace
11. complete

State persists to `~/.jinn-client/earning/earning_state.json`. Safe to interrupt and re-run.

## Key Roles

- **Creator** — defines desired states and funds restoration
- **Restorer** — attempts to make desired states true
- **Evaluator** — independently verifies restoration success

## Phased Rollout

- **Phase 0** (complete): Prove on OLAS ecosystem, single chain (Base), OLAS Mech Marketplace + JinnRouter, optimistic evidence, no JINN token
- **Phase 1a** (complete): Fork OLAS contracts with minimal changes, deploy JINN token + Treasury + distribution on Sepolia/Base Sepolia, multisig governance, testnet iteration
- **Phase 1b** (in progress): Protocol hardening on testnet — anti-farming decay, challenge mechanism, ve-JINN gauge voting, evidence schema, full client integration, extended testnet operation
- **Phase 2**: Mainnet launch — fair-launch JINN, multi-chain (Base, Arbitrum), ZK-requiring distribution contracts
- **Phase 3**: Autonomous — full ve-JINN governance, USDC revenue exceeds JINN emissions

## Testing

See [`docs/runbooks/testing.md`](docs/runbooks/testing.md) for the test SOP: pyramid,
where tests go, the mock policy, shared helpers. Design rationale lives in
[`docs/superpowers/specs/2026-04-24-test-architecture-design.md`](docs/superpowers/specs/2026-04-24-test-architecture-design.md).

Key rules:
- Most tests belong in the **integration** tier — real target module, fakes from `client/test/_support/` (`@test/claude.js`, `@test/chain/anvil.js`, `@test/ipfs.js`, `@test/time.js`, `@test/store.js`, `@test/cli.js`).
- Tests mirror `src/` paths. When a test file grows past ~400 LOC, split by aspect.
- E2E scripts live in `client/test/e2e/` and run via `tsx` (not vitest); each maps to a `yarn e2e*` script.
- `vi.mock` is restricted to true external boundaries and requires a `// MOCK_JUSTIFICATION:` comment on the preceding line. Inject deps instead of mocking internal modules.

## Development Commands

```bash
# Client
cd client
yarn install         # install deps (CI: yarn install --immutable)
yarn typecheck       # tsc --noEmit, must be zero errors
yarn test            # vitest run (mirrors src/ structure)
yarn test:watch      # vitest in watch mode
yarn build           # tsc → dist/ + chmod bin shims + copy dashboard html
yarn jinn <cmd>      # run any CLI subcommand from source via tsx (no build)
yarn jinn run        # production daemon (requires JINN_PASSWORD)
yarn e2e             # end-to-end on Anvil fork (test/e2e/validate.ts)
yarn staking         # earning bootstrap validation (test/e2e/staking.ts)
yarn stolas          # synthetic OLAS bridge e2e (test/e2e/stolas.ts)
yarn e2e-portfolio-v0           # portfolio.v0 intent kind e2e
yarn e2e:prediction              # prediction.v0 e2e (compiles contracts first)
yarn e2e-prediction-apy-v0       # prediction.apy.v0 e2e
yarn e2e:claude-code-learner     # learner-loop-test e2e
yarn pack:smoke                  # pack tarball + smoke test in clean dir
yarn release:operator-gate       # `staking` then `e2e` — stable release gate
yarn release:testnet-acceptance  # Docker-first manual testnet acceptance harness

# Run a single vitest test file or pattern
yarn test path/to/file.test.ts
yarn test -t "describes some behavior"

# Contracts
cd contracts
yarn install
yarn compile         # hardhat compile (regenerates artifacts/typechain)
yarn test            # Hardhat tests
yarn validate:phase1a            # end-to-end phase 1a deploy validation
yarn checkpoint                  # checkpoint-and-verify on sepolia

# Subgraph
cd subgraph
yarn install
yarn codegen && yarn build
```

The client's CLI surface (stable contract) is defined in [`spec/2026-04-14-client-surface.md`](spec/2026-04-14-client-surface.md). Error envelopes emitted on non-zero exits conform to §6 of that spec — see `client/src/errors/`.

## Adding intent kinds

To add a new **in-repo** `spec.kind` (typed spec, `jinn submit-intent --spec-file`, optional auto-generators, and restorer/evaluator pairing), follow [`docs/runbooks/add-intent-kind.md`](docs/runbooks/add-intent-kind.md). Kind parsing dispatches through `client/src/intents/kinds/index.ts` (`SPEC_KINDS`); testnet auto-posting is wired via `getTestnetAutoConfig` + `collectTestnetAutoIntentGenerators` in the same module. Restorer selection is separate — see `client/src/cli/intent-registry-access.ts` and `client/src/restorer/impls/index.ts` (`buildRestorerImpls`).

## Spec Conventions

Spec files are named `YYYY-MM-DD-<topic>.md` and placed in `spec/`. Each has a version, date, and author in the header.

## Design System

**Root-level quick reference** (for `impeccable` and other skill consumers):
- [`PRODUCT.md`](PRODUCT.md) — register (default `brand`; override to `product` inside `client/`, `ui_kits/explorer/`, or any dashboard surface), users, brand personality, anti-references, and five strategic principles.
- [`DESIGN.md`](DESIGN.md) — visual spec in [Google Stitch format](https://stitch.withgoogle.com/docs/design-md/format/): YAML frontmatter with colours, typography, radii, spacing, and component tokens; six-section prose body (Overview, Colors, Typography, Elevation, Components, Do's and Don'ts).
- [`DESIGN.json`](DESIGN.json) — sidecar extending the frontmatter with tonal ramps, canonical OKLCH, shadow/motion/breakpoint tokens, and drop-in component HTML/CSS.

These three files are the root-level precipitate of `docs/design/jinn-design-system/`. If you're writing marketing copy, docs, slides, or product UI, start with PRODUCT.md + DESIGN.md. If you're extending the brand itself (new sigil, new palette variant, new surface treatment), continue to the long-form source below.

---

Jinn's design system lives at [`docs/design/jinn-design-system/`](docs/design/jinn-design-system/). **Read it before building any UI, slide, mock, docs page, marketing surface, or other user-facing artifact** — it's the source of truth for colors, type, voice, iconography, and surface rules.

Entry points, in order:
- [`docs/design/jinn-design-system/BRAND_POSTURE.md`](docs/design/jinn-design-system/BRAND_POSTURE.md) — what "headless" means here (grounded in Other Internet's [*Headless Brands*](https://otherinter.net/research/headless-brands/)); which parts are protocol vs. narrative
- [`docs/design/jinn-design-system/project/README.md`](docs/design/jinn-design-system/project/README.md) — brand posture, voice/lexicon, visual foundations (colors, type, spacing, borders, shadows, radii, motion, layout), iconography
- [`docs/design/jinn-design-system/project/SKILL.md`](docs/design/jinn-design-system/project/SKILL.md) — short operational manifest and non-negotiables
- [`docs/design/jinn-design-system/project/colors_and_type.css`](docs/design/jinn-design-system/project/colors_and_type.css) + [`foundations.css`](docs/design/jinn-design-system/project/foundations.css) — copy these into any new HTML artifact; treat the CSS variables as the canonical tokens
- [`docs/design/jinn-design-system/project/assets/`](docs/design/jinn-design-system/project/assets/) — sigils and wordmark SVGs; reuse, don't redraw
- [`docs/design/jinn-design-system/project/preview/`](docs/design/jinn-design-system/project/preview/) — reference cards for every token (colors, type, buttons, chips, cards, shadows, textures, sigils, voice)
- [`docs/design/jinn-design-system/project/ui_kits/explorer/`](docs/design/jinn-design-system/project/ui_kits/explorer/) and [`slides/`](docs/design/jinn-design-system/project/slides/) — reference implementations; match visual output, not internal structure
- [`docs/design/jinn-design-system/chats/chat1.md`](docs/design/jinn-design-system/chats/chat1.md) — design chat transcript where decisions (blue+gold palette, softened-brutalism radii, rederived semantic colors) were made

**Non-negotiables** (from `SKILL.md`, with one correction):
- Never use emoji in product, marketing, or docs.
- Never use gradients as decoration (protection gradients over imagery are the only exception).
- Never invent new vow-language (`summon / bind / vow / vessel / wish / smoke / seer / wane`) without marking it as a proposal.
- Drop the metaphor and speak plainly whenever money, safety, or legal consent is on the line.
- **Corners are softened-brutalist, not square.** `SKILL.md` still says "never rounded"; the README supersedes it — use `--radius-1` (4px chips/inputs), `--radius-2` (6px default for buttons, small cards), `--radius-3` (10px panels/large cards), `--radius-pill` for status chips only.

### Brand posture — "headless" in the Other Internet sense

Jinn's brand is **headless** in the specific sense defined by Other Internet's [*Headless Brands*](https://otherinter.net/research/headless-brands/) (read it before doing brand work). That means:

1. **No central brand authority.** No one owns Jinn's narrative. The design system is a Schelling point for coordination, not a corporate style guide. Participants — creators, vessels, seers, BD, node operators — are expected to fork, remix, and re-skin.
2. **Immutable protocol foundations.** The parts that *don't* move are the protocol-level commitments: the loop (Creation → Execution → Evaluation → Knowledge), the lexicon (*summon, bind, vow, vessel, wish, smoke, seer, wane*), the content non-negotiables (no emoji, plain speech on money/safety/legal). These are the "21M supply + proof-of-work" of the brand — fixed so narratives can layer on top.
3. **Narratives layer on top.** Palette, typography, sigils, surface treatment — all of it is narrative, and narrative is allowed (expected) to fork per surface, operator, product, or community. Multiple visual dialects of Jinn can coexist on the same protocol.
4. **Brand lives in participants' minds.** Consistency emerges from convergent narratives on shared protocol primitives, not from enforcement. A node operator's dashboard and a creator's pitch deck can look nothing alike and both still be Jinn — as long as they share the words and the loop.
5. **User-stakeholders are brand workers.** Anyone with a stake in the network (tokens, reputation, deployed vessels) has standing to propose brand direction. Contribution to the brand is a first-class form of participation, not marketing overhead.

**Operational rule, restated:** **keep the words, loosen the visuals.** The lexicon and non-negotiables are the protocol; everything else is narrative. If you're about to invent new vow-language, that's a protocol change — mark it as a proposal. If you're about to change a color or swap a sigil, that's a narrative move — just document what you changed.

The received design bundle (palette, sigils, type pairing) is one narrative — a well-reasoned starting point, not the canonical Jinn. Treat it as such.
