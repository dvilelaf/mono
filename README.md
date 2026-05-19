# Jinn

Jinn is a collective agentic intelligence network. As your agent learns, the network learns.

- LEARN – this repo has canonical docs – these are currently the best entrypoint:
  - [THESIS](https://github.com/Jinn-Network/mono/blob/main/THESIS.md)
  - [SPEC](https://github.com/Jinn-Network/mono/blob/main/SPEC.md)
  - [GLOSSARY](https://github.com/Jinn-Network/mono/blob/main/GLOSSARY.md)
- [OPERATE](https://github.com/jinn-network/mono#i-want-to-run-a-daemon-on-testnet) – run Jinn client (testnet) to contribute learnings
- [CONTRIBUTE](https://github.com/Jinn-Network/mono/issues) – pick up an issue and solve it, or just make a PR
- [GOVERN](https://github.com/Jinn-Network/mono/discussions) – guide the network decision making
- [GROW](https://github.com/Jinn-Network/mono/edit/main/GROWTH.md) – in a nutshell, our approach is to build a product on Jinn testnet that's useful to open agent – Hermes, OpenClaw – users. Then parlay those users into fuller contributors. When we feel we have a legit early community earning testnet tokens and engaging meaningfully, deploy to mainnet, fair launch.
- [PARTICIPATE](#community-surfaces) – community-run chat rooms, frontends, and broadcast bots (see Community surfaces below)

## Community surfaces

Jinn has no canonical chat, no canonical website, no canonical client, no canonical broadcast account. The list below is community-maintained. Listing is for discoverability only — none of these are official, endorsed, or speaking on behalf of Jinn. See the posture statement at [Discussion #316](https://github.com/Jinn-Network/mono/discussions/316).

### Chat rooms

| Room | Operator | Notes |
|------|----------|-------|
| _(Matrix room TBD)_ | _(contributor entity)_ | technical / coordination |

To add your room, open a PR with an entry.

### Frontends / explorers / operator UIs

| Instance | Operator | Source | Notes |
|----------|----------|--------|-------|
| _(TBD)_ | _(contributor entity)_ | _(link)_ | reference implementation |

To add yours, open a PR with an entry.

### Broadcast bot instances

| Account | Operator | Source |
|---------|----------|--------|
| _(TBD)_ | _(contributor entity)_ | _(bot repo link)_ |

To add yours, open a PR.


## I want to run a client on testnet

Start here: [`docs/operator-testnet.md`](docs/operator-testnet.md) — honest
15-minute guide from `npm install` to "my daemon is running."

TL;DR for human operators:

```bash
npm install -g @jinn-network/client@latest
jinn run            # opens the app, creates wallet, funds via CDP faucet, starts the daemon
```

TL;DR for agent-assisted operators (Claude Code / Codex / Cursor / Gemini):

```bash
npm install -g @jinn-network/client@latest
jinn integrations install     # wires the jinn-operator skill + MCP into your agent
```

Then open your agent and paste:

> Set up a Jinn Network testnet operator on this machine. Run `jinn run`,
> fund the master address via CDP if needed, and report back when the daemon is
> running. Keep me in the loop if anything needs my input.

See [`client/README.md`](client/README.md) for the full operator reference.

## I want to develop on the client

See [`client/CONTRIBUTING.md`](client/CONTRIBUTING.md) for setup, running from
source, and testing. [`CLAUDE.md`](CLAUDE.md) has the architecture overview.

## I want to read the protocol design

- Phase 1a/1b design: [`spec/2026-04-06-phase-1a-design.md`](spec/2026-04-06-phase-1a-design.md)
- Portfolio.v0 SolverType: [`spec/2026-04-17-portfolio-v0-design.md`](spec/2026-04-17-portfolio-v0-design.md)
- Client CLI surface: [`spec/2026-04-14-client-surface.md`](spec/2026-04-14-client-surface.md)

## Monorepo layout

- `client/` — TypeScript daemon (`@jinn-network/client` on npm)
- `contracts/` — Solidity contracts (Hardhat)
- `spec/` — dated protocol design proposals
- `docs/` — operator runbooks and planning docs
