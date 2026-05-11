# Deploying @jinn-network/indexer to a VPS

Operational checklist for running the Jinn protocol indexer on a VPS.
This is documentation, not infrastructure-as-code — you operate the VPS
directly and use this as a reference.

## Required services

- **Node.js 22+** — the indexer is a Node.js process. Install via `nvm` or
  the official distribution packages.
- **Postgres 14+** — for production persistence. PGlite (in-process, no
  separate service) works for local dev (`yarn dev`) but is not recommended
  for a long-running VPS deployment.
- **RPC endpoint access** — at least one of Base Sepolia (chain 84532) or
  Base mainnet (chain 8453), depending on which networks you want to index.
  HyperSync-backed endpoints from [Envio](https://envio.dev) give higher
  throughput during historical sync.

## Setup

### 1. Clone or copy the indexer package

```bash
git clone https://github.com/Jinn-Network/mono.git
cd mono/cargo/packages/indexer
```

### 2. Install dependencies

```bash
corepack enable          # ensures Yarn matches the packageManager field
yarn install --immutable
```

### 3. Create your `.env` file

```bash
cp deploy/.env.example .env
# Edit .env with your actual values:
#   PONDER_RPC_URL_84532  — Base Sepolia RPC
#   PONDER_RPC_URL_8453   — Base mainnet RPC
#   DATABASE_URL          — Postgres connection string
```

### 4. Build

```bash
yarn build
```

### 5. Start

```bash
yarn start   # starts the indexer + HTTP server
```

Or to run HTTP-only (useful when another process is indexing):

```bash
yarn serve
```

## Verifying the endpoint responds

After startup, the indexer needs time to sync historical events (minutes to
hours depending on start block and RPC rate limits). During sync, the health
endpoint responds but GraphQL may return empty results.

```bash
# Health check — should return {"ok":true,...}
curl http://localhost:42069/health

# Minimal GraphQL probe — should return {"data":{"tasks":{"items":[...]}}}
curl -X POST http://localhost:42069/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ tasks(limit:1) { items { id } } }"}'
```

Point your daemon at the indexer by setting `discovery.url` in the daemon
config:

```json
{
  "discovery": {
    "mode": "http",
    "url": "http://your-vps-hostname:42069",
    "fallbackToOnchain": true
  }
}
```

## Monitoring

- Set up a cron or uptime monitor that hits `/health` every 60 seconds.
- Alert if the HTTP status is not 200 or `ok` is not `true`.
- Ponder logs to stdout. Redirect to a log aggregator (`journald`, `syslog`,
  or a hosted log service) as appropriate for your VPS setup.

## Zero-downtime updates

Ponder supports zero-downtime deployments when using Postgres and the
`DATABASE_SCHEMA` env var. To update:

1. Deploy the new version with a different `DATABASE_SCHEMA` value (e.g.
   `jinn_indexer_v2`). It will sync from genesis (or from a snapshot) in
   parallel with the running instance.
2. Once the new instance is fully synced, update the reverse proxy to point
   to the new instance's port.
3. Stop the old instance and drop the old schema.

## Snapshot sync

A full historical sync from genesis can take time. If a snapshot is available
(snapshot CIDs are published in daemon release notes), restore it:

```bash
# Set the snapshot start block in .env:
#   PONDER_START_BLOCK=<snapshot-height>
# Then start normally.
yarn start
```

## Notes

- Do NOT run `yarn dev` in production — it uses PGlite (in-process, not
  persistent across restarts) and is designed for local iteration only.
- The default port is 42069. Change with `PORT=<port>` in `.env`.
- No Kubernetes, Terraform, or GitHub Actions deploy workflows are included —
  this checklist assumes you manage the VPS directly.
