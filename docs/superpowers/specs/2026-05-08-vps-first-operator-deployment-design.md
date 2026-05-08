---
version: 0.1
date: 2026-05-08
author: oak
status: brainstorm-output
---

# VPS-First Operator Deployment

## Why this design exists

The Jinn operator daemon needs a publicly-reachable HTTPS endpoint to serve x402-paid artifact requests. Three POCs exploring decentralized alternatives (Helia/IPNS mutable manifests, bundled cloudflared TryCloudflare, libp2p mesh) demonstrated that:

- **IPNS-via-DHT is too slow in practice** (ProbeLab Aug 2025: 11s P50; 5-min Cloudflare CDN cache cliffs on `delegated-ipfs.dev`).
- **Default Helia on residential machines doesn't get provider records into the public DHT**; pinning to a service is critical-path, not optional.
- **TryCloudflare has a silent rate-limit kill** (~30 spawn-and-kill cycles per IP per hour triggers HTTP 429; cloudflared still prints the URL but DNS A record never appears).

The unifying insight: all the architectural complexity exists because we were trying to make consumer-laptop-NAT'd operators work. Most decentralized networks (Bitcoin, Ethereum validators, IPFS pinners, Tor relays, ActivityPub) accept that operators run servers. Jinn operators should too.

This design pivots operator deployment to **VPS-first**, with all the consequent simplifications: NAT traversal is gone, tunneling is gone, mutable-pointer layers (IPNS / DNSLink / ENS-CCIP-Read) are gone, TLS is trivial, sandboxing is real by default, the daemon is always-online.

## Architectural commitment

**Jinn runs no runtime infrastructure for operators.** Same posture as Bitcoin Core, geth, Tor relays, IPFS pinners, ActivityPub instances.

The distinction that matters:

- **Distribution** (operator fetches once during install): hosting `get.jinn.network/install.sh`, `github.com/Jinn-Network/operator` (compose stack template), `ghcr.io/jinn-network/client:latest` (daemon image). **Acceptable.** If we shut these down tomorrow, existing operators are unaffected — only new installs break. Operators don't depend on these for runtime.
- **Runtime** (operator depends on us during ongoing operation): DNS for their endpoint, TLS termination, hosted dashboard, custodial keystore, subdomain registry. **Not acceptable** under this principle.

Every design choice below is checked against this commitment.

## Design decisions

### 1. TLS + reverse proxy

**Caddy as a sidecar in `docker-compose.yml`.**

A second container in the operator's compose stack runs Caddy with a minimal `Caddyfile` that auto-provisions Let's Encrypt certs via HTTP-01 challenge. Cert state persists in a named docker volume (`caddy-data`).

```caddy
{$JINN_DOMAIN} {
    handle /v1/artifacts/* { reverse_proxy jinn-daemon:7331 }
    handle /v1/agent/*     { reverse_proxy jinn-daemon:7331 }
    handle /.well-known/*  { reverse_proxy jinn-daemon:7331 }
    handle                 { respond 404 }
}
```

The route filter (handle blocks) is critical — only public protocol routes (artifact fetch, ERC-8128, x402 facilitator wells) get proxied through Caddy. Dashboard / operator-admin routes return 404 from Caddy by design (see Decision 5).

Alternatives considered: Traefik (more flexible labels-based routing but more config than needed), nginx + certbot (more control, more steps; operator manages two things instead of one). Caddy chosen for "press button, get HTTPS" simplicity.

### 2. Publishing as an opt-in add-on

**The daemon always solves and evaluates.** Storing artifacts to local SQLite (`served_artifacts`) is the always-on baseline — no configuration toggle changes this. Operators run, do work, claim OLAS rewards, accumulate artifact bytes locally, regardless of any other state.

**Publishing is an add-on** layered on top. When the operator configures the `operator` block in `config.json` (or sets `JINN_OPERATOR_PUBLIC_ENDPOINT`), the daemon validates the endpoint at startup and starts publishing envelopes to IPFS + anchoring CIDs on-chain via `IdentityRegistry.setMetadata`.

Concrete startup gate:

- If `operator` block configured, `operator.publicEndpoint` must be a `https://` URL not pointing at `localhost`/`127.0.0.1`/`0.0.0.0`. Daemon refuses to start otherwise. Restores the `spec/2026-04-30-phase-a-umbrella.md` §6 intent that drifted to a soft warning at `client/src/main.ts:1351-1356`.
- If `operator` block absent, daemon runs in non-publishing mode. No endpoint required. No envelopes uploaded. Artifacts accumulate locally.

**Backfill capability** (new). When an operator transitions from non-publishing to publishing mode (or just wants to catch up), they trigger a one-shot "publish all unpublished artifacts" action — exposed both as a CLI command (`jinn publish-backfill`) and a dashboard button. Daemon walks `served_artifacts` for entries without a published CID, builds and pins envelopes, anchors CIDs on-chain, using config-defined pricing.

**Pricing stays as today.** `defaultPriceUsdc` + optional `perArtifactTypePrice` in config; existing precedence rules apply (`OUTPUTS.json > perArtifactTypePrice > defaultPriceUsdc`). No per-artifact pricing UI in this scope.

**Belt-and-suspenders**: `validateManifestForPublish(envelope)` runs before each IPFS upload, refuses to publish localhost URLs regardless of how the publish path was triggered (per Phase A umbrella §6).

### 3. On-chain endpoint registration

**Auto-on-first-activation, drift-detection thereafter.**

When the operator first transitions to publishing mode (operator block configured + valid endpoint + bootstrap reached `agents_registered` step), the daemon writes `IdentityRegistry.setMetadata(agentId, "endpoint:0", url)` from the operator's wallet. Idempotent: re-runs no-op if the on-chain value already matches.

On every subsequent boot, the daemon reads the on-chain `endpoint:0` and compares to the configured `operator.publicEndpoint`. If they differ:

- Log the drift.
- Surface a banner in the dashboard: "Your config says `<X>`, on-chain says `<Y>`. Click to update."
- Operator confirms → daemon calls `setMetadata` again with the new value.

The dashboard confirm step is intentional — it prevents typos in `.env` from auto-replicating to the chain. The first-time write is automatic because there's no prior on-chain state to lose.

### 4. First-boot password UX

**Auto-generate keystore password, persist to `/data/keystore-password`, `JINN_PASSWORD` env as override.**

The auto-generation behavior already exists for laptop mode (`client/src/main.ts:90`, `client/src/cli/password.ts`). On first boot, daemon generates a 32-byte random password, writes it to `~/.jinn-client/keystore-password` (mode 0o600), encrypts the keystore. On subsequent boots, the file is the source of truth.

**Bug to fix as part of this work**: the password-file path is `$HOME/.jinn-client/keystore-password`, which inside the container is `/root/.jinn-client/keystore-password` — and `/root/.jinn-client/` is **not** on the persistent volume (`/data` is). Container recreation (image update, host reboot) loses the password file, locking the daemon out of its keystore.

Fix: respect a new `JINN_PASSWORD_FILE` env override that defaults to `$HOME/.jinn-client/keystore-password`, and set `JINN_PASSWORD_FILE=/data/keystore-password` in the production `docker-compose.yml`. The dashboard's `POST /v1/setup/change-password` endpoint (which writes to the password-file path at `client/src/api/setup-endpoints.ts:728-735`) gets the same env override applied.

**In-app password rotation already works.** Dashboard → Configuration → Security → "Rotate keystore password" calls the existing endpoint, which decrypts with current → re-encrypts with new → atomically updates the password file → mirrors to `process.env['JINN_PASSWORD']` so the running daemon stays operational without restart. No new dashboard UI needed.

Operators with secrets-manager tooling who don't want a password file on disk can set `JINN_PASSWORD` in `.env` instead. Existing precedence (env beats file) handles this for free.

### 5. Dashboard auth: SSH-tunnel-only

**No public auth gate on the dashboard. Loopback-only, operator SSH-tunnels in.**

The architectural reframe: the operator already has an SSH key authorizing them to the VPS. That's the strongest credential they have. We don't need a parallel HTTP auth system; we use the credential they already use to manage the VPS.

Concrete shape:

- Daemon listens on `0.0.0.0:7331` inside the container (no daemon code change).
- `docker-compose.yml` binds the container port to **VPS loopback only**: `ports: ["127.0.0.1:7331:7331"]`. Internet cannot reach 7331 directly.
- Caddy reverse-proxies only **public protocol routes** (Decision 1's `Caddyfile` route filter). Dashboard routes (`/`, `/v1/operator/*`, `/v1/setup/*`) get a 404 from Caddy.
- Operator runs `ssh -L 7331:127.0.0.1:7331 user@vps -N` from their laptop, opens `http://localhost:7331` in the browser. We ship `scripts/operator-dashboard` (~10-line bash helper) that wraps the SSH tunnel command and opens the browser.

What this trades away: mobile / casual access from arbitrary devices. For the median operator, this is fine; for someone who really wants persistent dashboard reach, they can run Tailscale / WireGuard themselves — that's their choice, not our protocol concern.

What this gains: zero new auth code. No CSRF, no cookie-flag mistakes, no session fixation, no timing-attack concerns. Less code, less attack surface, faster shipping.

Public bearer-token dashboard auth becomes documented future work, gated by actual operator demand.

### 6. Migration from laptop daemon to VPS

**Build `jinn migrate export` and `jinn migrate import` CLI commands. Wire into the dashboard as a guided "Migrate from another machine" flow.**

State that gets migrated (encrypted tarball):

- `keystore.json` — encrypted EOA private key.
- `keystore-password` — keystore password.
- `earning/` — bootstrap state machine cursor.
- `jinn.db` — SQLite (served_artifacts, activity log, telemetry).
- `config.json` — operator config.

State that does not get migrated:

- **Claude OAuth credentials** (`~/.claude/`). Operators re-authenticate Claude on the new machine using the existing embedded-terminal flow in the dashboard (`client/src/agent/agent-ws.ts`, `client/src/dashboard/spa/src/regions/ClaudeAuthCard.tsx`). The dashboard's persistent Claude PTY scans stdout for OAuth URLs, opens them in the operator's laptop browser, and accepts the paste-back code in the embedded terminal — works seamlessly through the SSH tunnel.

CLI shape:

```bash
# On source (laptop or other VPS):
jinn migrate export ./jinn-state.tar.gz.enc
  - Refuses to export if the source daemon is still running (nonce conflict prevention).
  - Encrypts the tarball with a passphrase the operator provides.

# On destination (VPS):
docker compose run --rm -v $PWD:/import jinn-daemon \
  migrate import /import/jinn-state.tar.gz.enc
  - Refuses if /data already has state (no accidental overwrite).
  - Asks for the passphrase.
  - Extracts to /data/, sets correct permissions (0o600 on keystore files).
```

Dashboard flow: "Migrate from another machine" button → guided modal that walks the operator through running export on source, uploading the file, entering the passphrase, restarting the daemon. Consistent with the principle: post-first-boot setup happens in the dashboard, not via terminal.

**Default quickstart assumes fresh-start.** Migration is opt-in via the dashboard's first-boot wizard ("have you run Jinn before? click here").

**Update `client/docker-compose.yml` comments** to remove the outdated "run `claude setup-token` on host, paste into `.env`" instruction. Replace with: "first-boot brings you to the dashboard's embedded Claude session — sign in there. Container-mode paste-the-code flow works as documented in `ClaudeAuthCard.tsx`." The `CLAUDE_CODE_OAUTH_TOKEN` env var path is documented as the headless/CI alternative.

### 7. Sandboxing posture

**Cheap-by-default in compose, document VPS hygiene as operator responsibility, defer expensive measures to follow-up workstreams.**

Default in `docker-compose.yml` (daemon container):

- `user: "1000:1000"` — daemon runs as non-root inside container.
- `cap_drop: [ALL]` — daemon doesn't need Linux capabilities.
- `security_opt: ["no-new-privileges:true"]` — stops setuid escalation inside container.
- Loopback-only port binding (Decision 5).

Caddy container: `cap_drop: [ALL]`, `cap_add: [NET_BIND_SERVICE]` (needed to bind 80/443 as non-root).

Dockerfile changes: add a non-root user, add `USER` directive, remap Claude credentials path from `/root/.claude/` to `/home/jinn/.claude/`, ensure `/data/` is writable by `1000:1000` (compose handles via volume permissions or init container).

Documented (operator-runs-not-enforced):

- SSH key-only auth, disable root login (`PermitRootLogin no` in `sshd_config`).
- Install `fail2ban` or equivalent.
- Enable `unattended-upgrades` (Debian/Ubuntu) for automatic OS patches.
- Single-purpose VPS posture: don't run other services on this host.

**Explicitly deferred** (file as future workstreams):

- **Network egress allowlist** — Claude needs huggingface, npm, github, arbitrary URLs as part of doing work. Allowlist either breaks operators weekly or is too permissive to mean anything.
- **Read-only root filesystem with `tmpfs` overlays** — Node.js writes to weird places (npm cache, build cache). Testing this with every harness implementation is high friction; benefit is small for our threat model.
- **Seccomp / AppArmor profiles** — default Docker profiles already block the worst stuff; custom profiles are real work to author and maintain. Reach for these if a real exploit surfaces.
- **KMS-backed keystore** (operator's EOA decrypted via cloud KMS API call instead of password file). Strong uplift but separate workstream.
- **Auto-sweep EOA earnings to Safe daily.** Limits hot-key loss window. Separate workstream.

The honest threat model: the VPS is the trust boundary. Single-purpose host, decent SSH hygiene, cheap container hardening. We don't try to defend the operator against their own Claude subprocess — that's a different problem with separate solutions.

### 8. Quickstart + automation

**Operator brings own VPS + own domain. Jinn ships a one-line installer + cloud-init template + compose template repo.**

The auto-DNS shortcut: most major VPS providers (Hetzner, AWS EC2, Linode, Vultr) ship every VM with a forward-resolvable public DNS hostname pointing at the VPS IP. Examples: `static.5.6.7.8.clients.your-server.de`, `ec2-3-4-5-6.compute-1.amazonaws.com`, `li1234-56.members.linode.com`. Let's Encrypt issues certs for these via standard HTTP-01 challenge.

**For operators on these providers, the DNS step disappears.** Only DigitalOcean operators (and a handful of niche providers without auto-DNS) need to bring their own domain.

#### Tier 1: Cloud-init (zero SSH for setup)

Operator pastes this into the VPS provider's user-data field at instance creation:

```yaml
#cloud-config
runcmd:
  - curl -fsSL https://get.jinn.network/install.sh | bash
```

By the time the VPS is reachable, the daemon is running.

#### Tier 2: Installer script (operator already has a VPS)

```bash
curl -fsSL https://get.jinn.network/install.sh | sudo bash
# or with explicit domain:
curl -fsSL https://get.jinn.network/install.sh | sudo bash -s -- --domain=jinn.example.com
```

#### Tier 3: Manual / advanced

`git clone github.com/Jinn-Network/operator`, edit files, `docker compose up -d`. Same end-state as Tiers 1 and 2.

#### What `install.sh` does

- Detects OS (Ubuntu 22/24, Debian 12, Alma/Rocky 9). Falls over loudly on others.
- Installs Docker via official convenience script if missing.
- Creates `/opt/jinn/`, drops `docker-compose.yml`, `Caddyfile`, `.env`.
- **Auto-detects domain**:
  1. Resolves public IPv4 (metadata service or `ifconfig.me`).
  2. Reverse-DNS lookup → candidate hostname.
  3. Verifies hostname forward-resolves back to the IP.
  4. If yes → use it. If no → prompts for `--domain=` (or fails with clear message in cloud-init mode).
- Generates a strong `JINN_PASSWORD` if not provided (writes to `.env`, mode 0o600).
- Pulls images. Runs `docker compose up -d`.
- Tails Caddy logs until TLS provisioning succeeds (60s timeout).
- Prints the dashboard SSH tunnel command for the operator to copy.

Idempotent: re-running upgrades (`docker compose pull && docker compose up -d`) without touching state.

#### Operator's typical journey on a major provider

```
1. Provision VPS with cloud-init paste:           ~3 min
2. Wait for cloud-init + Caddy TLS:               ~5-10 min
3. SSH-tunnel to dashboard:                       ~30 sec
4. In-app onboarding (Claude + fund Safe):        ~10 min
```

Total operator-attention: ~15 min, mostly waiting. **No DNS step. No cert configuration. No file editing.**

#### Hosting (distribution-only)

- `get.jinn.network/install.sh` — static-hosted with HTTPS. Cloudflare Pages or GitHub Pages backed by an auditable `Jinn-Network/operator-installer` repo.
- `github.com/Jinn-Network/operator` — compose stack template (`docker-compose.yml`, `Caddyfile`, `.env.example`, `scripts/operator-dashboard`).
- `ghcr.io/jinn-network/client:latest` — already exists.

If we shut these down tomorrow, existing operators keep running. Only new installs and image upgrades break. Operators are not runtime-dependent on Jinn infrastructure.

#### Dashboard upgrade path (custom domain)

For operators who want to migrate off provider auto-DNS to a custom domain (e.g., they're changing providers): dashboard surfaces a "Switch to custom domain" flow that:
- Asks for the new domain.
- Updates Caddy config + `.env`.
- Re-runs `docker compose up -d` to pick up the new cert.
- Calls `setMetadata(agentId, "endpoint:0", new_url)` on-chain (Decision 3 covers the chain side).

Surfaced as a soft nudge: *"You're using your provider's auto-assigned hostname. If you ever change providers, your published envelopes will break. Consider configuring a custom domain — it's free to switch."*

## Operator journey, end-to-end

```
1. Pick a provider (Hetzner / AWS / Linode / Vultr / DigitalOcean / etc.).
2. Provision VPS:
   - Choose region + size + Ubuntu 24.04 + your SSH key.
   - Paste cloud-init template into user-data box.
   - Click Create.                                          ~3 min
3. (For DigitalOcean or other no-auto-DNS providers:
    add a DNS A record at your registrar pointing
    your domain at the VPS IP.                              ~2 min + propagation)
4. Wait for cloud-init + TLS provisioning.                  ~5-10 min
5. SSH-tunnel to dashboard from laptop:
     ./jinn-dashboard <vps-ip>                              ~30 sec
6. Complete in-app onboarding:
   - Connect Claude (paste OAuth code in embedded terminal).
   - Watch bootstrap (wallet → Safe → service → staking → mech).
   - Fund Safe with OLAS (UI shows address + amount).
   - Optional: enable publishing + backfill.                ~10 min
```

Total operator-attention time: ~15-20 min, most of which is waiting.

## Implementation scope

### First slice (build now)

1. **Caddy sidecar** in `client/docker-compose.yml` + minimal `Caddyfile` with route filter.
2. **Startup gate**: in `client/src/main.ts`, replace the soft warning at lines 1351-1356 with hard refusal when `operator.publicEndpoint` is configured but invalid (non-https, localhost, missing). Keep the silent path when `operator` block is absent.
3. **On-chain `endpoint:0` write + drift-check**: extend `client/src/erc8004/identity.ts`'s `IdentityPublisher` to handle endpoint metadata; wire into the bootstrap completion path.
4. **Path fix for keystore-password**: introduce `JINN_PASSWORD_FILE` env override; default to `$HOME/.jinn-client/keystore-password`; set `JINN_PASSWORD_FILE=/data/keystore-password` in production compose. Update `client/src/main.ts:90`, `client/src/cli/password.ts`, `client/src/api/setup-endpoints.ts:728-735`.
5. **Bind dashboard port to loopback** in `client/docker-compose.yml`: `ports: ["127.0.0.1:7331:7331"]`.
6. **Caddy route filter** (public protocol routes pass, dashboard 404s).
7. **Container hardening**: non-root user in Dockerfile, `cap_drop: [ALL]` + `no-new-privileges` in compose, Claude credentials path remap `/root/.claude/` → `/home/jinn/.claude/`.
8. **Distribution stack**:
   - `Jinn-Network/operator` repo with compose template, Caddyfile, `scripts/operator-dashboard`.
   - `Jinn-Network/operator-installer` repo with `install.sh` (auto-DNS detection, OS detection, idempotent re-run, fallback messaging).
   - Static hosting at `get.jinn.network`.
9. **Quickstart doc** at `docs/runbooks/operator-vps-quickstart.md` — one page with cloud-init template + DNS guidance + dashboard tunnel command + link to in-app onboarding.
10. **Update `client/docker-compose.yml` comments** to point at the in-app embedded Claude OAuth flow as canonical (env-var path documented as the headless/CI alternative).

Estimated total: **~5 days of engineering** + ~1 day of docs.

### Follow-up (gated behind first slice)

11. **Backfill capability**:
    - Daemon-side: scan `served_artifacts` for entries without published CIDs, build envelopes, pin to IPFS, anchor on-chain. Idempotent.
    - CLI: `jinn publish-backfill`.
    - Dashboard: "Publish accumulated artifacts" button + progress UI.
12. **`jinn migrate export` / `jinn migrate import`** CLI commands (encrypted tarball + integrity checks + idempotency) + dashboard "Migrate from another machine" guided flow.
13. **VPS hardening appendix** in quickstart (SSH hygiene, fail2ban, unattended-upgrades, single-purpose-host posture).
14. **"Switch to custom domain" upgrade flow** in dashboard.

Estimated total: **~5 additional days of engineering**.

### Out of scope for this design (filed as separate workstreams)

- **IPFS-encrypted artifact storage** (Storacha pinning, encryption-at-publish, decryption-key delivery via x402). Independent of the deployment shape.
- **libp2p phase** for long-term decentralization, post-mainnet. VPS is the v1 production story.
- **Coinbase facilitator integration vs local x402 facilitator** — separate decision, doesn't affect deployment shape.
- **Per-artifact pricing UI** — operators select what to publish + at what price per artifact.
- **Public bearer-token dashboard auth** — gated by actual operator demand.
- **KMS-backed keystore + auto-sweep EOA earnings** — keystore hardening workstream.
- **Network egress allowlist + read-only FS + seccomp profiles** — sandboxing workstream.
- **Jinn-managed subdomains (`*.jinn.network`)** — explicitly rejected; would violate the "Jinn runs no runtime infra" architectural commitment.
- **Provider-CLI integration** (`jinn operator provision --provider hetzner`) — would compromise on the principle of "operator authorizes their cloud, not us." Not v1.

## Honest trade-offs

- **Operator must own a VPS (~$5/mo) and pay attention for ~20 min of setup.** This filters hobbyists; aligns with serious operators who'll earn USDC at any meaningful scale.
- **Provider auto-DNS lock-in.** Operators on auto-DNS hostnames lose published-envelope references if they change providers. Mitigated by the "Switch to custom domain" upgrade path (follow-up work) and a soft nudge in the dashboard.
- **SSH-tunnel for dashboard means no mobile / casual browser access.** Operators who really want it can run Tailscale / WireGuard themselves; not our problem.
- **Distribution is centralized** (`get.jinn.network`, `ghcr.io`, `github.com/Jinn-Network/operator`). If we go away, new installs break. Existing operators are unaffected — they can rebuild from local image cache and the open-source compose template.
- **Sandboxing is pragmatic, not paranoid.** We don't defend the operator against their own Claude subprocess. Hardening for that case is a separate workstream.

## Reference materials

- POC reports (in conversation history): IPNS production usage, Helia + IPNS empirical POC, cloudflared lifecycle POC.
- `client/Dockerfile` and `client/docker-compose.yml` — current container shape.
- `client/src/main.ts:1340-1367` — current `operatorPublicEndpoint` derivation with localhost-fallback warning.
- `client/src/config.ts:482-518` — `operator.publicEndpoint` config schema.
- `spec/2026-04-30-phase-a-umbrella.md` §6 — original "fail loudly if endpoint unset" intent.
- `client/src/erc8004/identity.ts` — `IdentityPublisher` and `setMetadata` patterns.
- `client/src/api/setup-endpoints.ts:694-751` — existing in-app password rotation flow.
- `client/src/agent/agent-ws.ts`, `client/src/dashboard/spa/src/regions/ClaudeAuthCard.tsx` — existing embedded Claude PTY OAuth flow that handles container mode correctly.
