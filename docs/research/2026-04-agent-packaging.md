# Agent Packaging Research

**Date:** 2026-04-16
**Author:** Claude (research agent)
**Status:** Research — not a spec or commitment

## Problem Statement

A user wants to go from zero to operating an agent on the Jinn Network. Today the client is a monorepo-internal Node.js daemon with a 17-verb CLI (`jinn run`, `jinn init`, etc.), an 11-step fleet bootstrap state machine, and contract deployments on Base Sepolia. The question: what packaging format and onboarding flow gets an external operator running with minimum friction?

---

## 1. What Exists Today

### 1.1 CLI Surface (`client/src/bin/jinn.ts` → `client/src/cli/`)

The `jinn` CLI already has a complete operator workflow:

| Verb | Purpose |
|------|---------|
| `jinn init` | Generate master wallet, encrypt keystore |
| `jinn doctor` | Preflight checks (Node.js, Claude binary, deployment config) |
| `jinn fund-requirements` | Show exact funding gaps |
| `jinn bootstrap` | Advance fleet state machine |
| `jinn run` | Start daemon (creator + restorer + delivery-watcher loops) |
| `jinn status` | Poll daemon health |
| `jinn submit-intent` | Post a desired state on-chain |
| `jinn fleet` / `jinn balance` / `jinn history` / `jinn rewards` | Inspect state |
| `jinn withdraw` / `jinn keys backup` | Fund management |

The CLI emits structured JSON on stdout (machine-readable by default, `--human` for terminal output) and routes logs to stderr. This is already well-designed for agent consumption — an orchestrating agent can parse stdout JSON directly.

### 1.2 MCP Server (`client/src/mcp/server.ts`)

The existing MCP server is **subprocess-scoped**, not standalone. It is spawned by `ClaudeRunner` as a child process for each restoration/evaluation task, with context passed via env vars:

**Existing tools:**
- `get_desired_state` — read the current task assignment
- `report_progress` — log progress
- `submit_restoration_result` — submit success/failure verdict
- `get_restoration_delivery` — fetch restoration data for evaluation
- `publish_artifact` — store knowledge for future agents
- `search_artifacts` — query past artifacts
- `acquire_artifact` — fetch remote artifacts from peers

**What this MCP server is:** A toolbox for the *inner agent* — the Claude subprocess that performs a single restoration or evaluation. It is tightly coupled to one task execution.

**What this MCP server is NOT:** A general-purpose interface for an external agent to discover, join, and operate on the Jinn network. It cannot init a wallet, bootstrap, submit intents, check status, or manage the fleet.

### 1.3 HTTP API (`client/src/api/server.ts`)

Runs on port 7331 when the daemon is active:
- `GET /v1/status` — daemon health, fleet state, RPC status
- `GET /artifacts/search` — query artifacts
- `GET /artifacts/:id/content` — fetch artifact content
- `POST /artifacts` — publish artifacts
- `GET /x402/artifacts/:id/content` — payment-gated access

### 1.4 npm Package (`package.json`)

Already configured for publishing:
- Name: `@jinn-network/client`
- `bin.jinn` → `./dist/bin/jinn.js`
- `publishConfig.access: "public"`
- `files: ["dist/", "deployments/"]`
- `prepublishOnly` runs build + test
- Library exports via `main`/`types` for programmatic use

### 1.5 Bootstrap State Machine

The `FleetBootstrapper` walks through wallet creation → Safe deployment → service registration → staking → mech deployment. Key properties:
- **Idempotent** — persists state to `~/.jinn-client/earning/earning_state.json`, safe to interrupt and resume
- **Funding gate** — pauses at `awaiting_funding` with a structured envelope telling the operator exactly what needs funding
- **Two staking modes** — `standard` (stOLAS, no OLAS needed) and `self-bond`

### 1.6 Dependencies & Prerequisites

- Node.js 22 (hard requirement via `engines` and corepack)
- Claude Code CLI on PATH (checked by `jinn doctor`)
- Foundry only for local dev (Anvil fork); not needed for testnet/mainnet operation
- `JINN_PASSWORD` env var for keystore encryption

---

## 2. Packaging Format Analysis

### 2.1 npm Package with CLI (Primary — Ready Today)

**What it is:** `npm install -g @jinn-network/client` gives the user `jinn` on PATH.

**Current readiness:** High. The `bin`, `files`, `publishConfig`, and `prepublishOnly` fields are already configured. The CLI has 17 verbs covering the full operator lifecycle.

**Gaps:**
- No `npx @jinn-network/client` quick-start experience (the bin name is `jinn`, which works)
- No guided interactive setup (all config is via env vars or JSON file)
- Need to verify `yarn pack` → install → `jinn doctor` works cleanly outside the monorepo (the `pack:smoke` script exists for this)

**Verdict:** This is the foundation. Ship this first.

### 2.2 Standalone MCP Server (High Value — Needs Building)

**What it would be:** A new MCP server entry point that exposes the full operator workflow as MCP tools, designed to be registered in Claude Code, Cursor, Windsurf, or any MCP-compatible agent.

**Why it matters:** MCP is the emerging standard for agent tool discovery. An agent with the jinn MCP server configured can operate on the network without knowing CLI syntax.

**Proposed tools for a standalone MCP server:**

| Tool | Maps to | Notes |
|------|---------|-------|
| `jinn_init` | `jinn init` | Create wallet, return master address |
| `jinn_doctor` | `jinn doctor` | Preflight checks |
| `jinn_fund_requirements` | `jinn fund-requirements` | Show funding gaps |
| `jinn_bootstrap` | `jinn bootstrap` | Advance state machine |
| `jinn_status` | `jinn status` | Daemon + fleet health |
| `jinn_submit_intent` | `jinn submit-intent` | Post desired state on-chain |
| `jinn_fleet` | `jinn fleet` | Fleet overview |
| `jinn_balance` | `jinn balance` | Wallet balances |
| `jinn_history` | `jinn history` | Activity log |
| `jinn_start_daemon` | `jinn run` | Start daemon (long-running — needs careful design) |
| `jinn_stop_daemon` | `jinn stop` | Stop daemon |

**Implementation approach:** Since the CLI already emits structured JSON, the simplest path is a thin MCP wrapper that shells out to `jinn <verb>` and returns the parsed JSON. This avoids duplicating logic and means the MCP server always matches CLI behavior. A `client/src/mcp/operator-server.ts` that imports from `cli/` directly (without spawning a subprocess) would be even cleaner — each MCP tool calls the same `CommandModule.run()` that the CLI uses.

**Registration:** Users would add to their MCP config:
```json
{
  "mcpServers": {
    "jinn": {
      "command": "npx",
      "args": ["@jinn-network/client", "mcp-serve"],
      "env": { "JINN_PASSWORD": "..." }
    }
  }
}
```

Or if installed globally:
```json
{
  "mcpServers": {
    "jinn": {
      "command": "jinn",
      "args": ["mcp-serve"],
      "env": { "JINN_PASSWORD": "..." }
    }
  }
}
```

### 2.3 Claude Code Skill / Codex Plugin

**What it would be:** A skill file that teaches Claude Code how to use the jinn CLI or MCP server.

**Assessment:** Lower priority than MCP. A skill is just a prompt template — it tells the agent what tools exist but doesn't provide them. If we have the MCP server (2.2), a skill is useful as a discovery/onboarding layer ("you have jinn tools available, here's how the protocol works"). Without the MCP server, a skill could instruct the agent to use `jinn` CLI commands via Bash, but this is fragile and doesn't work in sandboxed environments.

**Verdict:** Nice-to-have after MCP server ships. Could be a single markdown file that describes the protocol and available tools.

### 2.4 Docker Image

**What it would be:** `docker run ghcr.io/jinn-network/client` with volume mounts for keystore persistence.

**Assessment:** Useful for:
- Operators who don't want Node.js installed
- Deployment on cloud VMs, Kubernetes, etc.
- Reproducible environment (pinned Node version, dependencies)

**Gaps:**
- Claude Code CLI would need to be in the image (large dependency)
- Keystore persistence needs volume mount guidance
- Interactive password entry doesn't work well with Docker

**Verdict:** Valuable for production operators, but not the first packaging target. The npm package covers the initial audience (developers and agent builders).

### 2.5 Combination Recommendation

**Ship order:**
1. **npm package** (today — mostly ready)
2. **Standalone MCP server** (`jinn mcp-serve` verb) — highest impact for agent consumption
3. **Claude Code skill** — discovery and onboarding layer
4. **Docker image** — production deployment

---

## 3. Zero-to-Operating User Flow

### 3.1 Current Flow (What Exists)

```
1. Install Node.js 22
2. npm install -g @jinn-network/client
3. Install Claude Code CLI
4. JINN_PASSWORD=secret jinn init
   → Generates wallet, prints master address
5. JINN_PASSWORD=secret jinn doctor
   → Checks environment readiness
6. JINN_PASSWORD=secret jinn fund-requirements
   → Shows: "Master needs 0.01 ETH on Base Sepolia"
7. [MANUAL] Go to faucet, get testnet ETH, send to master address
8. JINN_PASSWORD=secret jinn bootstrap
   → Deploys Safe, registers service, stakes, deploys mech
9. JINN_PASSWORD=secret jinn run
   → Daemon starts, 3 loops running
```

**Pain points:**
- Step 7 is a manual faucet visit — breaks the automated flow
- No single command does steps 4-9
- Password must be set in every command (no session or keyring)
- Default network is testnet (good for onboarding) but config file must be created for any customization

### 3.2 Ideal Flow (What We Should Build)

```
1. npm install -g @jinn-network/client
2. jinn quickstart
   → Prompts for password (or reads from env)
   → Generates wallet
   → Attempts faucet funding (Coinbase CDP API)
   → If faucet fails: prints address + faucet URL, waits
   → Runs bootstrap
   → Starts daemon
   → Prints: "Your agent is running. API at http://127.0.0.1:7331"
```

Or for MCP-first users:
```
1. Add to MCP config:
   { "mcpServers": { "jinn": { "command": "npx", "args": ["@jinn-network/client", "mcp-serve"] } } }
2. Tell your agent: "Set up a Jinn agent on testnet"
3. Agent calls jinn_init, jinn_bootstrap, jinn_start_daemon
```

### 3.3 Proposed `jinn quickstart` Command

A new CLI verb that combines init + fund + bootstrap + run into a guided flow:

```
jinn quickstart [--password-fd N] [--no-daemon]

Steps:
  1. init        — create wallet (idempotent)
  2. fund-check  — check balances
  3. auto-fund   — attempt Coinbase CDP faucet (if testnet + CDP key available)
  4. wait-fund   — if auto-fund fails, print instructions and poll until funded
  5. bootstrap   — advance state machine to completion
  6. run         — start daemon (unless --no-daemon)
```

This doesn't replace the individual verbs — operators still need granular control. But it collapses the 80% case into one command.

---

## 4. What Can Be Automated vs. What Needs Human Input

### 4.1 Fully Automatable

| Step | How |
|------|-----|
| Wallet creation | `jinn init` — deterministic from password |
| Safe prediction + deployment | Bootstrap state machine |
| Service registration + staking | Bootstrap state machine |
| Mech deployment | Bootstrap state machine |
| Config generation | Defaults cover testnet; `jinn init` creates keystore dir |
| RPC endpoint | Defaults to `https://sepolia.base.org` for testnet |
| Daemon startup | `jinn run` |

### 4.2 Automatable with External Dependency

| Step | Dependency | Automation Path |
|------|-----------|-----------------|
| Testnet ETH funding | Coinbase CDP API key | `cdp.evm.requestFaucet({ address, network: "base-sepolia", token: "eth" })` — free tier, 1 claim/24h/address |
| Claude API access | User's Anthropic API key or Claude Max subscription | Claude Code CLI handles this; user must have it configured separately |

### 4.3 Requires Human Decision

| Step | Why |
|------|-----|
| Password choice | Security — must be chosen by operator |
| Claude Code CLI installation | Separate product, separate auth flow |
| Mainnet ETH funding | Real money; no faucet |
| Custom desired states | Domain-specific; operator defines what their agent should do |
| Network choice (testnet vs mainnet) | Operational decision (default testnet is correct for onboarding) |

### 4.4 Coinbase CDP Faucet — Implementation Notes

The Coinbase Developer Platform provides a programmatic faucet for Base Sepolia:

```typescript
// Using @coinbase/cdp-sdk
import { CdpClient } from '@coinbase/cdp-sdk';

const cdp = new CdpClient(); // Uses CDP_API_KEY_ID + CDP_API_KEY_SECRET env vars
await cdp.evm.requestFaucet({
  address: masterAddress,
  network: "base-sepolia",
  token: "eth"
});
```

**Constraints:**
- Requires a free CDP API key (sign up at cdp.coinbase.com)
- Rate limited: 1 claim per 24 hours per address
- Only testnet — not a mainnet solution
- Dispenses a small amount (~0.1 ETH, varies) which is sufficient for bootstrap gas

**Integration recommendation:** Make CDP faucet opt-in via `COINBASE_CDP_API_KEY_ID` / `COINBASE_CDP_API_KEY_SECRET` env vars. If set, `jinn quickstart` and `jinn bootstrap` attempt auto-funding before pausing at the funding gate. If not set, print the manual faucet URL (`https://faucet.circle.com/` or `https://www.coinbase.com/faucets/base-ethereum/sepolia`). Don't add `@coinbase/cdp-sdk` as a hard dependency — dynamic import with a helpful error message if missing.

**Alternative faucets (web-only, no API):**
- Alchemy Base Sepolia faucet — web UI only, 1 claim/24h
- Circle faucet (faucet.circle.com) — web UI, supports Base Sepolia

---

## 5. Standalone MCP Server Design (Detailed)

### 5.1 Architecture Decision: CLI Wrapper vs. Direct Integration

**Option A — Shell out to `jinn` CLI:**
```typescript
// Simple but requires jinn on PATH
const result = execSync('jinn status --json', { env: { JINN_PASSWORD: password } });
return JSON.parse(result.toString());
```

Pros: Zero code duplication, always matches CLI behavior.
Cons: Requires global install, subprocess overhead, can't manage daemon lifecycle easily.

**Option B — Import CLI command modules directly:**
```typescript
// Direct integration, no subprocess
import statusCommand from './cli/commands/status.js';
const output = new StringWriter();
await statusCommand.run({ argv: [], writer: output, ... });
return JSON.parse(output.toString());
```

Pros: No subprocess overhead, single process, can share state.
Cons: CLI commands call `process.exit()` on errors (via `emitEnvelope`), need to refactor exit behavior.

**Option C — Import library layer, bypass CLI:**
```typescript
// Use exports from index.ts directly
import { FleetBootstrapper, Daemon, MechAdapter, ClaudeRunner, loadConfig } from '@jinn-network/client';
```

Pros: Cleanest, most flexible.
Cons: Most work — need to reimplement the orchestration that `main.ts` does.

**Recommendation:** Option B for most tools (the CLI commands already do JSON I/O with injectable writers and exits), with Option C for daemon lifecycle (start/stop need in-process control). The `emitEnvelope` function already accepts `{ writer, exit }` — passing a no-op exit function prevents process termination.

### 5.2 Daemon Lifecycle in MCP Context

The daemon (`jinn run`) is a long-running process. In MCP, tools are request/response. Two approaches:

**A. Background process management:**
- `jinn_start_daemon` spawns `jinn run` as a detached subprocess, returns PID
- `jinn_stop_daemon` sends SIGTERM to the PID (pidfile already written to `~/.jinn-client/earning/daemon.pid`)
- `jinn_status` reads from the HTTP API at `:7331/v1/status`

**B. In-process daemon:**
- The MCP server itself hosts the daemon (long-lived MCP server = long-lived daemon)
- Tools like `jinn_status` query in-process state
- MCP server shutdown = daemon shutdown

Option A is simpler and matches existing architecture. The daemon already writes a pidfile and `jinn stop` already exists.

### 5.3 MCP Server Entry Point

New verb: `jinn mcp-serve`

```
jinn mcp-serve [--password-fd N]

Starts an MCP server on stdio (StdioServerTransport).
Exposes operator-level tools for agent consumption.
Long-lived — runs until stdin closes or SIGTERM.
```

This would be a new file at `client/src/mcp/operator-server.ts` and a new CLI command at `client/src/cli/commands/mcp-serve.ts`.

---

## 6. Comparison: How Other Agent Ecosystems Handle Onboarding

### 6.1 LangChain Tools

- Published as pip packages (`pip install langchain-community`)
- Each tool is a Python class with `_run()` method
- Configuration via constructor args or env vars
- No daemon — stateless tool invocations
- **Lesson:** Stateless tools are easiest to distribute. Jinn's protocol requires state (wallet, staking), which adds irreducible complexity.

### 6.2 CrewAI Tools

- Published as pip packages (`pip install crewai-tools`)
- Tools are decorated functions
- Config via env vars
- **Lesson:** Simple tool surface, but doesn't solve the "persistent service" problem that Jinn has.

### 6.3 MCP Ecosystem (Anthropic)

- MCP servers published as npm packages
- Registered in `~/.claude/mcp.json` or project-level config
- `npx` as the standard launch mechanism (no global install needed)
- Examples: `@modelcontextprotocol/server-github`, `@modelcontextprotocol/server-filesystem`
- **Lesson:** `npx` launch is the convention. The MCP config JSON is the discovery mechanism. This is the right model for Jinn.

### 6.4 OLAS (Jinn's Current Foundation)

- Agents packaged as Docker images registered on-chain
- Complex setup: Safe wallet, service registration, staking, mech deployment
- Managed via `autonomy` CLI (Python)
- **Lesson:** Jinn's `jinn` CLI already simplifies this significantly vs. raw OLAS tooling. The bootstrap state machine is a major improvement.

---

## 7. Recommendations

### 7.1 Immediate (This Sprint)

1. **Publish npm package.** Run `yarn pack:smoke` to verify the package installs and `jinn doctor` works outside the monorepo. Then `npm publish`.

2. **Add `jinn mcp-serve` verb.** Thin MCP server wrapping CLI commands. Start with read-only tools (`jinn_status`, `jinn_doctor`, `jinn_fleet`, `jinn_balance`, `jinn_history`) plus `jinn_init`. This is shippable in a day.

### 7.2 Near-term (Next 2 Weeks)

3. **Add write tools to MCP server.** `jinn_bootstrap`, `jinn_submit_intent`, `jinn_start_daemon`, `jinn_stop_daemon`. These require careful error handling since they mutate state.

4. **Add `jinn quickstart` verb.** Guided flow combining init + fund-check + bootstrap + run. Detects CDP credentials and attempts auto-funding.

5. **Optional CDP faucet integration.** Dynamic import of `@coinbase/cdp-sdk`, gated on env vars. Fails gracefully to manual instructions if unavailable.

### 7.3 Medium-term

6. **Claude Code skill.** A markdown skill file that describes the Jinn protocol and teaches agents how to use the MCP tools. Distributable via the npm package or a separate skill registry.

7. **Docker image.** `Dockerfile` in `client/`, published to ghcr.io. Include Node.js + Claude Code CLI. Volume mount for `~/.jinn-client/`.

8. **Codex / Cursor / Windsurf plugin manifests.** These ecosystems are converging on MCP, so the MCP server covers them. If any require custom plugin formats, create thin wrappers.

### 7.4 Architecture Principle

**The CLI is the source of truth.** Every packaging format (MCP server, skill, Docker, plugin) should delegate to the CLI or its underlying modules. This prevents behavioral divergence and means testing the CLI tests everything.

---

## 8. Gap Analysis: Existing MCP Server vs. Complete Agent Experience

| Capability | Task MCP (existing) | Operator MCP (proposed) |
|------------|-------------------|------------------------|
| Understand current task | `get_desired_state` | N/A (operator level) |
| Submit work result | `submit_restoration_result` | N/A (daemon handles) |
| Search knowledge | `search_artifacts`, `acquire_artifact` | `jinn_history` |
| Create wallet | - | `jinn_init` |
| Check readiness | - | `jinn_doctor` |
| Fund wallet | - | `jinn_fund_requirements` |
| Bootstrap infra | - | `jinn_bootstrap` |
| Start operating | - | `jinn_start_daemon` |
| Monitor health | - | `jinn_status` |
| Submit intents | - | `jinn_submit_intent` |
| Check earnings | - | `jinn_rewards`, `jinn_balance` |

The existing task MCP server and the proposed operator MCP server serve different roles and different agents. The task MCP server is for the *inner agent* (Claude subprocess doing restoration work). The operator MCP server is for the *outer agent* (the user's agent that manages Jinn operations). Both should exist.

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| npm package has monorepo-specific paths | Medium | High (broken install) | `pack:smoke` script exists — run it in CI |
| MCP server daemon management is fragile | Medium | Medium | Use existing pidfile + HTTP API pattern |
| CDP faucet rate limits block multi-service bootstrap | High | Low | Only need ~0.01 ETH; one faucet claim is sufficient |
| Claude Code CLI not installed | High | High (can't run daemon) | `jinn doctor` already checks this; clear error message |
| Testnet contracts redeploy breaks config | Medium | High | Ship deployment artifacts in npm package (`deployments/` is in `files`) |

---

## 10. Open Questions

1. **Should the MCP server manage its own daemon, or require a separate `jinn run` process?** Background process management (Option A in 5.2) is simpler but means two processes. In-process (Option B) is cleaner but couples MCP lifetime to daemon lifetime.

2. **Is `@jinn-network/client` the right package name for external operators?** Consider whether a separate `@jinn-network/agent` package with fewer dependencies (no Hardhat, no test fixtures) would be better for distribution.

3. **Should quickstart default to stOLAS (standard) staking mode?** Standard mode doesn't require OLAS tokens, lowering the funding barrier. This is already the default.

4. **Do we need a hosted RPC endpoint?** The default `https://sepolia.base.org` is rate-limited. For onboarding, it works. For production, operators will need their own. Should we provide one during testnet phase?
