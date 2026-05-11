# Discovery API and shared indexer

- **Date:** 2026-05-11 (v0.1 draft) → 2026-05-11 (v0.2 — collapse standalone indexer into daemon-in-embedded-mode)
- **Author:** Oak with Opus
- **Status:** Design draft — ready for review
- **Version:** 0.2
- **v0.2 change:** Removed the standalone-indexer deployment shape. The "shared indexer" is now a daemon running in embedded mode with its Ponder GraphQL port published externally (`discovery.publishIndexer: true`). One deployment artifact (`client/Dockerfile`), three configuration variants per §8.
- **Related:**
  - `spec/2026-04-30-phase-a-umbrella.md` (corpus library as the "first app" / programmatic library; `routeResolver` seam)
  - `spec/2026-05-05-solvernet-creation-and-launch.md` §13 (registry client interface designed to be swappable)
  - `spec/2026-05-registry-discovery.md` (external impl registry — sibling discovery problem)
  - `client/src/corpus/index.ts`, `client/src/corpus/onchain-query.ts` (existing on-chain discovery path)
  - `client/src/adapters/mech/task-subgraph.ts` (the load-bearing subgraph dependency)
  - `client/src/solvernets/registry-client.ts`, `client/src/solvernets/most-recent-wins.ts` (SolverNet manifest registry)
  - `client/src/erc8004/subgraph.ts` (stub; peer/artifact backfill path, currently inactive)

## 1. Purpose

Define how the daemon performs read-side discovery (claimable tasks, SolverNet manifests, corpus envelopes) without a runtime dependency on a third-party hosted subgraph that requires a centralized API key.

The decision: introduce a `DiscoveryAPI` interface, ship two implementations of it (HTTP-to-shared-indexer, embedded-Ponder), and keep a direct on-chain RPC path as the always-available fallback. The "shared indexer" is not a separate service — it is a daemon running in embedded mode with its Ponder GraphQL port published externally. The default daemon configuration points at one such instance, **privately operated by the daemon's current maintainer** (Oak), running the same daemon image as everyone else with `publishIndexer: true`. It is not protocol infrastructure and not Jinn-the-project-operated. Operators who want full autonomy flip a config flag to run embedded mode locally; operators who later prefer a different default point at a different URL; operators who want to be public indexers themselves flip the same `publishIndexer` flag.

## 2. Problem

The daemon currently has three subgraph callsites. Two are inactive or already have an alternative; one is load-bearing.

### 2.1 Load-bearing: task claim discovery

`client/src/adapters/mech/task-subgraph.ts` → `client/src/adapters/mech/adapter.ts:545-580` (`discoverSubgraphRestorationTasks`).

The `CLAIMABLE_TASKS_QUERY` filters JinnRouter `Task` entities by `manifestDigest`, time-windowed `claimWindowStart_lte` / `claimWindowEnd_gte`, `refunded: false`, `finalized: false`, joined with `attempts` and `operatorAttempts` to compute per-task and per-operator attempt counts. The delivery-watcher loop polls this constantly.

The query is the only place in the daemon where a real *join* is required — attempt counts per `(task, operator)`. Reproducing this against raw RPC requires enumerating `AttemptSubmitted` events and grouping client-side, i.e. building a small purpose-built indexer.

### 2.2 Already neutralised: corpus discovery

`client/src/corpus/query.ts` (subgraph path) coexists with `client/src/corpus/onchain-query.ts` (direct `IdentityRegistry.MetadataSet` event scan via viem `getLogs`). `client/src/corpus/index.ts:79-92` runs whichever is configured, merging refs and surfacing per-source warnings. The corpus library is *not* blocked by this spec — its on-chain mode already works.

### 2.3 Mechanically swappable: SolverNet manifest registry

`client/src/solvernets/registry-client-erc8004.ts` reads `IdentityRegistry.setMetadata` events keyed `solvernet-manifest:*` and folds them via `most-recent-wins.ts` into current lifecycle status. The fold is a pure function over an event array. Swapping the event source from subgraph to `getLogs` is mechanical. `spec/2026-05-05-solvernet-creation-and-launch.md` §13 already calls this out as a day-1 backing meant to be replaceable.

### 2.4 Inactive: peer-discovery / artifact backfill

`client/src/erc8004/subgraph.ts` is a stub returning empty arrays pending the rebuilt Jinn subgraph (bead `jinn-mono-fud`). Not load-bearing.

### 2.5 What "centralized API key" actually buys us today

A hosted Graph subgraph with an API key gives the daemon: indexed task tables with joins, low latency, no per-operator infra, no cold-start sync. The cost is a single Jinn-controlled API key that operators implicitly depend on, with no failover when the key is revoked, the hosted service is deprecated, or quotas are exceeded. This is the dependency this spec removes.

## 3. Non-goals

- **Decentralised indexer network selection.** Subsquid, The Graph decentralised network, peer-gossip indexing — out of scope. They remain available as future `DiscoveryAPI` implementations.
- **Marketplace UI / consumer app.** This spec defines the discovery substrate the marketplace will consume; the marketplace itself is a separate spec.
- **Removing IPFS / content-layer dependencies.** Manifest fetches still go through IPFS gateways (Autonolas by default). x402 still gates per-artifact bytes. This spec is about *discovery*, not *retrieval*.
- **Changing the on-chain schema.** No new contracts, no new events. The daemon already produces all the data this spec consumes.

## 4. Decision summary

1. **One interface, three implementations.** A new `DiscoveryAPI` interface in `client/src/discovery/` abstracts the read-side queries the daemon currently issues against the subgraph. Three implementations ship: `HttpDiscoveryAPI` (calls a public indexer over HTTP/GraphQL), `EmbeddedPonderDiscoveryAPI` (runs Ponder in-process; same code path supports private autonomy and public-indexer roles via a config flag), and `OnchainDiscoveryAPI` (direct RPC `getLogs` + multicall; the fallback path).
2. **One artifact, one deployment shape.** Ponder lives in `packages/indexer/` and is bundled into the daemon image (`client/Dockerfile`) when the daemon imports it. There is no separate indexer Dockerfile or service. The "shared indexer" deployment is a daemon running with `discovery.mode: 'embedded'` + `publishIndexer: true`. Public-indexer operators and private-autonomy operators run the same image; the difference is one config flag.
3. **HTTP-to-shared-indexer is the default.** Default daemon configuration points at the URL of a daemon-in-embedded-mode privately operated by the daemon's current maintainer (Oak). This is one operator's app, not protocol infrastructure. Operators flip a config field to switch to embedded mode locally, point at a different host, or become a public indexer themselves.
4. **On-chain fallback is always live.** If the chosen primary implementation fails (VPS unreachable, embedded Ponder still syncing, hosted subgraph 5xx), the daemon falls back to `OnchainDiscoveryAPI` for the duration of the outage. Slower but functional. Operators stay live during indexer outages.
5. **Hosted Graph subgraph is removed, not retained as a fallback.** Once `DiscoveryAPI` ships, `subgraphUrl` callsites move to the new interface. The Graph dependency leaves the runtime.

## 5. The DiscoveryAPI interface

The interface captures *what the daemon needs to know*, not the storage backend. The shape is deliberately narrow:

```ts
// client/src/discovery/types.ts (illustrative)

export interface DiscoveryAPI {
  /**
   * Claimable tasks for a set of SolverNet manifests, filtered by operator.
   * Replaces `queryClaimableTaskCandidates` in task-subgraph.ts.
   */
  findClaimableTasks(args: {
    solverNetManifestCids: string[];
    operatorAddress: `0x${string}`;
    nowSeconds?: number;
    pageSize?: number;
    maxPages?: number;
  }): Promise<ClaimableTaskCandidate[]>;

  /**
   * SolverNet manifest registry — launched-instance summaries with
   * current lifecycle status. Replaces the subgraph fetcher in
   * `registry-client-erc8004.ts`.
   */
  listLaunchedSolverNets(args?: {
    launcherAgentId?: string;
    status?: Array<'launched' | 'paused' | 'retired'>;
  }): Promise<SolverNetManifestSummary[]>;

  getLifecycleStatus(
    manifestCid: string,
  ): Promise<SolverNetLifecycleStatus | undefined>;

  /**
   * Corpus envelope discovery — refs only, not bytes. The corpus
   * library wraps this and adds manifest fetch / acquire / hash verify.
   */
  queryEnvelopes(query: CorpusQuery): Promise<EnvelopeRef[]>;
}
```

Notes:

- The interface returns the same shapes the existing subgraph callers already consume (`SubgraphTaskCandidate` → renamed `ClaimableTaskCandidate`; `SolverNetManifestSummary` already exists; `EnvelopeRef` is the corpus library's existing type). No call-site changes beyond swapping the injected dependency.
- Each method is independently implementable. An implementation may throw `DiscoveryUnavailableError` for any subset of methods; the fallback chain catches and retries against the next implementation.
- No write surface. Manifest publication, lifecycle transitions, and ERC-8004 metadata writes continue to go directly on-chain through the existing publishers (`registry-client-erc8004.ts`, `IdentityPublisher`, etc.). `DiscoveryAPI` is read-only.

## 6. Implementations

### 6.1 `HttpDiscoveryAPI` — default

Thin HTTP client. Lives at `client/src/discovery/http.ts`. Talks GraphQL to a remote daemon running in embedded mode with its Ponder endpoint published externally (§6.2). The current default points at an instance run by the daemon's maintainer (Oak) on personal VPS infrastructure. Default URL ships in `client/src/config.ts` (`DEFAULT_TESTNET_DISCOVERY_URL`, `DEFAULT_MAINNET_DISCOVERY_URL`), env-overridable via `JINN_DISCOVERY_URL` so any operator can repoint at a different host without touching the binary.

The GraphQL queries that the daemon issues are vendored in `http.ts` itself — symmetric to how `onchain.ts` vendors its own event-scan queries against the same on-chain data. The `@jinn-network/indexer` package contains the schema those queries target but does not ship a TypeScript client; the wire contract is implicit in matching schemas across daemon versions.

API stability: the HTTP endpoint is a real versioned API. Breaking changes require a new path prefix (`/v2/...`) and a deprecation window for `/v1/...`. The daemon pins to a major version; minor changes are additive. Because the public indexer is just someone's daemon with the indexer endpoint published, the operator running that daemon owns the API contract — operators who point at a third-party host inherit that host's stability discipline, which is a per-host trust decision.

### 6.2 `EmbeddedPonderDiscoveryAPI` — opt-in autonomy and the public-indexer enabler

Runs Ponder in-process as an additional daemon loop. The same code path supports two operator intents:

- **Private/autonomy**: operator sets `discovery.mode: 'embedded'` and runs the indexer purely for their own daemon's reads. Ponder's GraphQL port is not published externally. No third party can query it.
- **Public/maintainer**: operator sets `discovery.mode: 'embedded'` AND `discovery.publishIndexer: true` (or equivalent), which publishes Ponder's GraphQL port externally. Other operators' daemons (`mode: 'http'`) can now query this daemon. This is how the "shared indexer" the rest of the spec talks about actually gets deployed: it is the maintainer's daemon, not a separate service.

Operator UX (both intents):

- Cold start: pulls a recent indexed-state snapshot from IPFS (CID published in the daemon release artifact) and replays from snapshot height. New operators reach head in minutes, not hours.
- Steady state: tails events via the operator's configured `rpcUrl`. Uses HyperSync as the upstream when available; falls back to plain RPC.
- Storage: PGlite under `~/.jinn-client/indexer/` for local autonomy; Postgres (via `DATABASE_URL`) recommended when running as a public indexer. Schema version baked into the path so daemon upgrades that change the schema re-sync cleanly from snapshot.
- RAM: ~300 MB steady state, ~600 MB during initial sync, regardless of whether the port is published.

Failure mode: if embedded Ponder is mid-sync or has crashed, the daemon's fallback chain routes its own reads to `OnchainDiscoveryAPI` until embedded mode reports `head_within_n_blocks`. The daemon never blocks on indexer sync. When `publishIndexer: true` and the indexer is unhealthy, the HTTP endpoint returns a 503 so consumer daemons fall through to their own configured fallback.

**Architectural consequence:** collapsing standalone indexer + daemon into one process means there is no separate "indexer Dockerfile." The daemon's `client/Dockerfile` is the one deployment target. The indexer package (`@jinn-network/indexer`) is bundled into the daemon image when the daemon depends on it (lands with this task in the migration plan).

### 6.3 `OnchainDiscoveryAPI` — fallback

Direct RPC via viem `getLogs` + multicall, no indexer state. Implements the same interface but with caveats:

- `findClaimableTasks`: enumerates `TaskCreated` events from a known start block, multicalls current `finalized` / `refunded` state, enumerates `AttemptSubmitted` events and groups client-side. Bounded result set (only active claim windows), but slow on cold scans. Caches results in the daemon's existing SQLite for the duration of the daemon process.
- `listLaunchedSolverNets` / `getLifecycleStatus`: reads `IdentityRegistry.MetadataSet` events directly (the same path `corpus/onchain-query.ts` already implements), folds via `most-recent-wins.ts`.
- `queryEnvelopes`: delegates to the existing `runOnchainCorpusQuery` in `corpus/onchain-query.ts`.

The on-chain implementation is the **always-live floor**. The daemon ships with it enabled and uses it as the primary if no other implementation is configured. This is the property that lets the daemon boot working even before any VPS is deployed.

## 7. Ponder schema

The Ponder package indexes four event sources, each producing one entity:

| Entity | Source events | Used by |
|---|---|---|
| `Task` | `JinnRouter.TaskCreated`, `TaskFinalized`, `TaskRefunded` | `findClaimableTasks` |
| `Attempt` | `JinnRouter.AttemptSubmitted`, `AttemptResolved` | `findClaimableTasks` (joined with Task) |
| `SolverNetManifest` | `IdentityRegistry.MetadataSet` (key prefix `solvernet-manifest:`) | `listLaunchedSolverNets`, `getLifecycleStatus` |
| `Envelope` | `IdentityRegistry.MetadataSet` (envelope keys per ERC-8004 spec) | `queryEnvelopes` |

The schema is **deliberately narrow at v0.1**: it replaces today's three subgraph callsites and nothing more. Phase B.2 reputation entities, Phase C marketplace-specific entities, and any other future query domains are additive — they slot in as new entities + handlers without renaming or restructuring the existing four.

Schema version is bumped on any breaking change to existing entities and triggers a re-sync from the bundled snapshot. Pure-additive changes do not bump the version.

## 8. Deployment shapes

There is exactly one deployment artifact in this design: the daemon (`client/Dockerfile`). The three shapes below are configuration variants of the same image.

### 8.1 Maintainer's daemon (the default shared indexer)

- The daemon's current maintainer (Oak) deploys the daemon image on a personal VPS with `discovery.mode: 'embedded'` and `discovery.publishIndexer: true`.
- The daemon's Ponder GraphQL port is published externally. Other operators' daemons point `discovery.url` at this VPS.
- Domain: operator-chosen; current default URL ships in `config.ts` and is operator-overridable. Not anchored to a `jinn.network` subdomain — the indexer is not protocol infrastructure and should not appear to be.
- Backed by: HyperSync upstream, Postgres for steady state (via `DATABASE_URL`), S3 (or equivalent) for snapshot publishing.
- Snapshot cron publishes the indexed-state snapshot to IPFS once per epoch; CID is committed on-chain via the maintainer's EOA so embedded-mode operators can verify it.
- Cost owner: the maintainer personally. Not material at current scale (~$20-200/month). The protocol does not subsidise it and Jinn-the-project carries no obligation for its uptime.

### 8.2 Operator daemon in embedded mode (private autonomy)

- Operator sets `discovery.mode: 'embedded'` and leaves `publishIndexer` unset (or false).
- Daemon spawns Ponder in-process on boot, restores from the bundled snapshot, then tails events.
- No external service dependency. RPC quota is the operator's own. No HTTP exposure of the indexer.

### 8.3 Operator daemon in HTTP mode (consumes someone's public indexer)

- Operator sets `discovery.mode: 'http'` and `discovery.url: <maintainer-or-other-host>`.
- Daemon issues GraphQL queries to the configured URL via the vendored client at `client/src/discovery/http.ts`.
- No indexer runs in this operator's daemon. Smallest resource footprint.

### 8.4 On-chain (always-live floor)

- Daemon falls back to this automatically when the configured primary is unhealthy, regardless of which primary mode is selected.
- Operators can pin to on-chain mode explicitly via `discovery.mode: 'onchain'`; useful for testing, air-gapped setups, or maximum-trust-minimisation operators willing to eat latency.

## 9. Daemon-side integration

### 9.1 Config surface

Two new fields under a single `discovery` block (replaces today's loose `subgraphUrl`):

```jsonc
{
  "discovery": {
    "mode": "http" | "embedded" | "onchain", // default: "http"
    "url": "https://<operator-chosen-host>",  // when mode = http
    "fallbackToOnchain": true,                // default: true; on-chain floor always honored
    "publishIndexer": false                   // when mode = embedded: publish Ponder GraphQL externally
  }
}
```

Env overrides: `JINN_DISCOVERY_MODE`, `JINN_DISCOVERY_URL`, `JINN_DISCOVERY_FALLBACK`. `subgraphUrl` is removed (breaking config change — flagged in release notes; `DEFAULT_TESTNET_SUBGRAPH_URL` deletion in `config.ts:825` is part of the migration).

### 9.2 Callsite migration

Three current callsites move from "construct subgraph client; pass URL" to "inject `DiscoveryAPI`; call method":

1. `adapters/mech/adapter.ts:545-580` — `discoverSubgraphRestorationTasks` → `discoverClaimableTasks`. The HTTP `taskDiscovery` config block collapses into the `discovery` block.
2. `solvernets/registry-client-erc8004.ts` — currently constructs its own subgraph fetcher; switches to consuming the injected `DiscoveryAPI`.
3. `corpus/index.ts` — `createCorpus({ subgraphUrl, onchain, ... })` becomes `createCorpus({ discovery, ... })`. The corpus library no longer owns the subgraph-vs-onchain split; that's `DiscoveryAPI`'s job.

### 9.3 Fallback chain

```
primary = build(mode)                  // http | embedded | onchain
floor   = build('onchain')             // always
discovery = withFallback(primary, floor, { unhealthyThreshold, retryAfter })
```

`withFallback` is a small wrapper that catches `DiscoveryUnavailableError` and network errors from the primary, routes to the floor for the duration of the outage, and probes the primary periodically to re-engage. Exposed through telemetry so operators can see which path served each query.

## 10. Trust model

What each implementation guarantees:

- **`HttpDiscoveryAPI`**: trusts the operator of the configured URL to report tasks and envelopes accurately. Worst-case lie: hide existing tasks/envelopes from the operator (denial of opportunity) or surface stale entries (wasted claim attempts). Cannot fabricate envelopes that pass downstream verification — the corpus library hash-verifies content against the manifest at retrieval time. Cannot fabricate task state that passes downstream verification — the daemon multicalls the JinnRouter contract before claiming (`canClaimTask` in `adapter.ts`).
- **`EmbeddedPonderDiscoveryAPI`**: trusts only the operator's own RPC endpoint (and HyperSync if configured). No third-party in the discovery path.
- **`OnchainDiscoveryAPI`**: trusts only the operator's RPC endpoint.

Hash-verification at the content layer (corpus library) and on-chain state verification at the claim layer (`canClaimTask`) bound the damage any discovery-layer dishonesty can do. This is the property that makes the default `HttpDiscoveryAPI` mode safe for the network: a misbehaving shared indexer can degrade UX but cannot corrupt outcomes.

## 11. Migration plan (high level)

Detailed steps land as beads issues. The shape:

1. **Ponder package + schema.** Stand up `packages/indexer/` with the four-entity schema. CI builds it. No deployment yet.
2. **DiscoveryAPI interface + OnchainDiscoveryAPI.** Land the interface and the always-live floor implementation in `client/src/discovery/`. Wire it behind a feature flag; existing subgraph paths untouched.
3. **Callsite migration.** Move the three callsites (task discovery, SolverNet registry, corpus) to consume `DiscoveryAPI`. Subgraph paths become one implementation of the interface, gated by `discovery.mode: 'http-subgraph'` (a transitional implementation that delegates to the existing subgraph client — kept only for the migration window).
4. **HttpDiscoveryAPI client.** Land `client/src/discovery/http.ts` and wire `discovery.mode: 'http'` through the factory. The wire-contract queries are vendored in the daemon (Option A). No VPS deployment yet — the maintainer's daemon doesn't exist until step 5.
5. **EmbeddedPonderDiscoveryAPI + public-indexer support.** Wire Ponder as an in-process daemon loop. Add `discovery.publishIndexer` config flag to expose Ponder's GraphQL port externally. Update `client/Dockerfile` to bundle `@jinn-network/indexer` and its deps. Snapshot publication + verification pipeline. The maintainer's VPS deployment is a configuration of this same daemon image (`mode: 'embedded'` + `publishIndexer: true`); cut over the default `discovery.url` once the maintainer's instance is live.
6. **Remove subgraph callsites.** Drop `task-subgraph.ts`, the subgraph branch in `corpus/index.ts`, the subgraph fetcher in `registry-client-erc8004.ts`, the `subgraphUrl` config field, the transitional `http-subgraph` mode, and the stub `erc8004/subgraph.ts`. The Graph API key dependency leaves the system.

## 12. Federation path (out of scope for v0.1)

The HTTP service is intentionally not branded as protocol infrastructure. It's a privately-operated indexer that the daemon's current maintainer happens to run, and the daemon's `discovery.url` is operator-chosen — the default just happens to point at the maintainer's instance.

This matters: there is no "Jinn-operated indexer" anywhere in the runtime. The protocol does not run infrastructure; participants do. The current default exists because one participant (Oak) chose to run one and ship the daemon pointing at it. That choice is observable in the default config and reversible by any operator at any time.

When a second party wants to run their own public indexer, they:

1. Deploy the daemon image (`client/Dockerfile`) on their VPS with `discovery.mode: 'embedded'` and `discovery.publishIndexer: true`.
2. Operators who want to align with that party set `discovery.url: 'https://<their-host>/'`.

There is no separate indexer service to stand up — the daemon *is* the indexer in embedded mode. Anyone running a daemon can choose to be a public indexer by flipping configuration.

No protocol changes. No coordination. This is the headless-brand shape made literal: protocol stays minimal, surfaces vary, operators choose alignment. Multiple privately-operated indexers can coexist on the same protocol from day one — the only thing v0.1 doesn't ship is a *discovery-of-discovery* layer to help operators find alternatives. They find them by word-of-mouth or by reading config docs, which is fine for the current participant count.

A future spec may introduce a discovery-of-discovery layer (a list of known indexer endpoints anchored on-chain or in IPFS, possibly weighted by some operator-signal). v0.1 does not need it; pointing at a URL is enough.

## 13. Open questions

1. **GraphQL vs. JSON-RPC-style HTTP for the wire format.** Ponder ships GraphQL natively; the daemon already speaks GraphQL today. Default to GraphQL unless a concrete reason to differ surfaces in implementation. Worth a one-line answer in v0.2.
2. **Snapshot frequency and size.** What's an acceptable lag for embedded-mode cold start — daily? hourly? The size of the indexed state per release dictates this. Decide during implementation; not gating for v0.1.
3. **Telemetry on fallback engagement.** Should the daemon report when it's falling back to on-chain mode? Likely yes (operator visibility), via the existing telemetry channel. Confirm shape during integration.
4. **HyperSync availability and pricing model.** Embedded mode benefits massively from HyperSync but inherits its availability. Need to confirm current SLA / pricing / contingency for the embedded path. Not blocking; plain RPC works as a slower upstream.
5. **What to do with `erc8004/subgraph.ts`.** The stub references bead `jinn-mono-fud` for an upcoming Jinn-specific subgraph. Either roll that work into the Ponder schema (preferred — it's the same data domain) or close the bead as superseded. Decide during implementation.

## 14. References

- `spec/2026-04-30-phase-a-umbrella.md` — corpus library as the first programmatic-library "app"; `routeResolver` seam that this spec generalises into `DiscoveryAPI`.
- `spec/2026-05-05-solvernet-creation-and-launch.md` §13 — registry client interface designed to be swappable; the day-1 subgraph backing this spec replaces.
- `client/src/corpus/onchain-query.ts` — the working on-chain discovery path that `OnchainDiscoveryAPI` extends to cover all three query domains.
- `client/src/adapters/mech/task-subgraph.ts` — the load-bearing callsite this spec migrates.
- Ponder — https://ponder.sh — the indexer framework chosen for both deployment shapes.
