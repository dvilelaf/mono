# @jinn-network/indexer

Ponder indexer for the Jinn protocol. Indexes four entities (Task, Attempt,
SolverNetManifest, Envelope) from JinnRouter and IdentityRegistry events on
Base Sepolia and Base mainnet.

## Architecture: server-side only

This package is pure server-side — schema definitions, event handlers, and the
Ponder runtime that serves a GraphQL endpoint. The daemon-side client that
consumes that endpoint lives at `client/src/discovery/http.ts` (in the
`@jinn-network/client` package), not here. This split keeps the daemon's
dependency footprint clean — daemon consumers never install Ponder transitively.

Any third party running their own Jinn-shaped indexer should deploy this
package as-is; their operators' daemons already contain the GraphQL client that
conforms to this schema.

Ships one consumption surface:
- Ponder's auto-generated GraphQL endpoint at `/graphql`

The same package is deployed in two shapes:
- `jinn-mono-280n.4` — VPS deployment, privately operated, Postgres backend
- `jinn-mono-280n.5` — embedded in the daemon process, PGlite backend

## Running locally (PGlite, no external database)

```bash
# Install dependencies
yarn install

# Provide at least one RPC URL (Ponder will error if neither is set and
# no default RPC is reachable; the defaults in ponder.config.ts are public
# Base RPC endpoints that may rate-limit in production).
export PONDER_RPC_URL_84532=https://sepolia.base.org
export PONDER_RPC_URL_8453=https://mainnet.base.org

# Start the indexer in dev mode (PGlite under .ponder/, hot reload)
yarn dev
```

The GraphQL explorer is available at http://localhost:42069/graphql by default.

### Health check

```bash
curl http://localhost:42069/health
# {"ok":true,"service":"@jinn-network/indexer","version":"0.1.0"}
```

## Running in production (Postgres + HyperSync)

```bash
# Set the Postgres connection string
export DATABASE_URL=postgresql://user:password@localhost:5432/jinn_indexer

# For HyperSync performance, use a HyperSync-backed RPC URL from Envio
# (https://envio.dev). Ponder treats it as a standard JSON-RPC endpoint.
export PONDER_RPC_URL_8453=https://base.hypersync.xyz/<your-envio-api-key>
export PONDER_RPC_URL_84532=https://base-sepolia.hypersync.xyz/<your-envio-api-key>

# Build and start
yarn build
yarn serve
```

### Docker / VPS

The indexer is a standard Node.js process. Any environment that runs Node 22+
with network access to the configured RPC endpoints and a reachable Postgres
instance can host it. Ponder's zero-downtime deployment support is available
when using Postgres with the `DATABASE_SCHEMA` env var for schema isolation.

## Schema-version policy

Any **breaking change** to an existing entity — renaming or removing a column,
changing a column type — bumps the schema version and requires a re-sync.
Re-sync from a snapshot is the intended path: pull the snapshot CID published
in the latest daemon release, restore it under `.ponder/`, then restart with
`PONDER_START_BLOCK=<snapshot-height>`. Snapshot publishing infrastructure
arrives with `jinn-mono-280n.4`.

**Pure-additive changes** (new columns with defaults, new entities, new indexes)
do not bump the schema version and do not require a re-sync.

## Known limitations (v0.1)

### No TaskFinalized / TaskRefunded events

JinnRouter V3 does not emit standalone `TaskFinalized` or `TaskRefunded` events.
The indexer sets `task.finalized = true` when a `SolutionDeliveryClaimed` event
is received for that task (the terminal success state in V3). `task.refunded`
always starts as `false`; no on-chain refund event exists at v0.1.

The daemon compensates: its `canClaimTask` simulation (in
`client/src/adapters/mech/contracts.ts`) is the correctness gate before any
claim is attempted. The indexer is an acceleration path; the simulation is the
truth.

A future JinnRouter version may add explicit finalization events. When they
land, add a handler in `src/index.ts` and update this limitation note.

### claimWindowStart / claimWindowEnd not indexed

These fields are part of the `policy` tuple passed to `createTask` but are not
emitted in the `TaskCreated` event. Decoding them requires reading the
originating transaction input (call traces). At v0.1 these columns are stored
as nullable; `findClaimableTasks` in the adapter compensates by falling back to
the `nowSeconds` parameter for client-side filtering and relying on
`canClaimTask` simulation for correctness.

Enabling `includeCallTraces` in `ponder.config.ts` and decoding the `policy`
tuple from `createTask` args is the fix; tracked in `jinn-mono-280n.4`.

### HyperSync is not a separate Ponder transport at v0.16.x

Ponder 0.16.x uses standard JSON-RPC transports. Use a HyperSync-backed RPC
URL (e.g. from Envio) in `PONDER_RPC_URL_*` to get HyperSync performance.
Native HyperSync transport support may arrive in a later Ponder release.

### `SolverNetManifestSummary` is a partial mirror

The GraphQL endpoint exposes 6 on-chain-derivable fields per SolverNet
(`manifestCid`, `solverNetId`, `launcherAgentId`, `status`, `statusUpdatedAt`,
`anchorBlock`) derived entirely from on-chain index data. The canonical
`SolverNetManifestSummary` in `client/src/solvernets/registry-client.ts` has
14 fields; the remaining 8 (`name`, `network`, `launcherSafeAddress`,
`contractId`, `contractVersion`, `solutionPriceWei`, `verdictPriceWei`,
`openRoles`) live in the IPFS manifest body and are not stored in the indexer.

The daemon's `HttpDiscoveryAPI` (at `client/src/discovery/http.ts`) fills
these 8 fields with sentinel values and leaves enrichment to the caller. This
matches how `solvernets/registry-client-erc8004.ts:listLaunched` already works
post-`280n.3`: it fetches the IPFS manifest for each summary row.

### `CorpusQuery.solverType` cannot be filtered at the indexer level

`solverType` is a field of the IPFS manifest body, not part of the on-chain
envelope payload (`IdentityRegistry.MetadataSet` only carries the ABI-encoded
`(version, tier, manifestHash, ...)` tuple). The indexer cannot populate or
filter by `solverType`.

Callers that need per-`solverType` filtering must do so client-side after
fetching and decoding the IPFS manifests referenced by the returned
`EnvelopeRef` rows. Passing `solverType` in a `CorpusQuery` to
`queryEnvelopes` is accepted at the interface level but is silently ignored by
the indexer adapter.

## Development commands

```bash
yarn dev       # Ponder dev server (hot reload, PGlite)
yarn build     # Ponder build (compile + validate schema; required before yarn start/serve)
yarn start     # Ponder production server (indexer + HTTP, requires DATABASE_URL)
yarn serve     # Ponder production HTTP server only (no indexer, requires DATABASE_URL)
yarn codegen   # Regenerate ponder-env.d.ts type artifacts
yarn typecheck # TypeScript check (no emit)
yarn test      # Vitest unit tests — currently zero tests in this package;
               # the GraphQL adapter tests moved to client/test/discovery/http.test.ts
               # as part of jinn-mono-280n.4. Handler integration tests will live
               # in the daemon's integration suite.
```
