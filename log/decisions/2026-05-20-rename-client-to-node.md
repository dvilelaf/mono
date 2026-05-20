---
id: DR-2026-05-20
title: Rename `client` → `node` — what we ship is a node, not a client
date: 2026-05-20
verb: Propose
status: proposed
authors: opus (proposed), oak (Captain pending)
---

## Context

The artifact in `client/`, published as `@jinn-network/client`, installed to `~/.jinn-client/`, and launched as `jinn run` is not a client by the standard distributed-systems definition. It has on-chain identity (agent EOA + Safe + service NFT), stakes OLAS, runs eight long-running loops, exposes an HTTP API on :7331 serving artifacts to peers, syncs with peers, persists state in SQLite, and is meant to run 24/7 inside an OLAS service. That is unambiguously a **node**.

A *client*, in the sense Jinn is going to need one, is a thin CLI or SDK that talks to somebody else's node — no Safe, no stake, no peer-sync, no daemon. `spec/2026-04-14-client-surface.md` already imagines that surface but inherits the name "client" from the current package, colliding head-on with what `client/` actually is.

The drift originates in the Ethereum convention — geth, reth, erigon are called "clients" though they are node software. Outside that ecosystem the convention reverses: client = consumer, node = peer with identity. Even Ethereum operators say "I'm running a node." The cost of carrying the wrong name compounds as the actual client surface ships: every doc, every onboarding paragraph has to explain "by client we mean node, and the actual client is called something else."

The blast radius today is bounded — one package, one repo dir, one config dir, ~70 source files referencing `JINN_*` or `~/.jinn-client/`, a handful of canonical docs. Post-mainnet the cost compounds with every operator deployment.

## Decision

**Rename the published artifact from `client` to `node`** as canonical Jinn terminology, with a single migration cycle that preserves operator on-disk state.

Concretely:

- **Repo directory:** `client/` → `node/`. One `git mv` + monorepo import sweep + Yarn workspace path update.
- **npm package:** `@jinn-network/client` → `@jinn-network/node`. Publish `@jinn-network/client` as a deprecated alias that re-exports `@jinn-network/node` for one minor cycle, removed at the v0.2.0 cut.
- **Binary:** `jinn` stays. Already brand-named, no collision.
- **Class:** `Daemon` stays. Daemon describes process shape, orthogonal to the network-role rename.
- **Config / state dir:** `~/.jinn-client/` → `~/.jinn/` (drop the suffix; it's the only Jinn dir on the operator's machine). For one minor cycle the node reads from `~/.jinn/` and falls back to `~/.jinn-client/` with a one-shot deprecation log instructing the operator to `mv`. Fallback removed at v0.2.0.
- **Env vars:** `JINN_*` stays. Already brand-neutral, no collision (`JINN_PASSWORD`, `JINN_RPC_URL`, `JINN_DB_PATH`, etc. unchanged).
- **Canon sweep:** `CLAUDE.md`, `README.md`, `client/README.md`, runbooks, and the handbook sections that use "client" as a synonym for the running daemon. `spec/2026-04-14-client-surface.md` re-titles to describe the *future thin client*, not the current node.
- **No on-chain change.** Service NFT, Safe, JinnRouter, staking — untouched.

The future client surface (a `jinn client` subverb, or a separate `@jinn-network/sdk`) keeps the name "client" reserved for that scope.

## Rationale

- **The name is wrong by the standard definition.** Client = consumer; node = peer with identity, stake, and persistent network presence. What we ship is unambiguously the latter.
- **The drift gets worse, not better.** The thin client surface is on the near roadmap (`spec/2026-04-14-client-surface.md`). Shipping it under the current "client" name forces a worse rename later, with more downstream references and more operators on disk.
- **Mainnet hasn't happened yet.** Bounded blast radius now; unbounded later.
- **"Node" is already the operator-facing word.** Even in Ethereum, where the software is called a "client," operators say "I run a node." Letting the package name catch up reduces friction in every future conversation.

## Alternatives considered and rejected

- **Do nothing.** The collision lands the moment the thin client surface ships and persists for the lifetime of the project. Rejected.
- **Keep "client" for the daemon and call the thin surface "SDK" instead.** Considered. "SDK" works for the library form but not for a CLI verb surface, and `spec/2026-04-14-client-surface.md` is CLI-shaped. Picking "SDK" either forces a same-magnitude rename of the spec or keeps the collision. Net: similar cost, worse outcome. Rejected.
- **Rename only the directory, keep `@jinn-network/client`.** The package name is the highest-leverage surface for newcomers; renaming the dir without the package leaves `npm install @jinn-network/client` actively misleading. Rejected.
- **Rename to `peer`, `operator`, or `daemon` instead of `node`.** `peer` is overloaded with full-p2p connotations we don't match. `operator` is the human role, not the software. `daemon` is process shape, not network role — the class is already `Daemon` for that reason. Rejected.

## Consequences

- **One PR of canonical-doc churn.** `CLAUDE.md` (~14 refs), `README.md` (~3), `client/README.md` (~19), `spec/*` (~5 files), handbook + skill text. Mechanical.
- **One PR of code churn.** ~70 source files reference `JINN_*` env or hardcoded `~/.jinn-client/` paths; sweep + dual-path read for one cycle. TypeScript import paths across the monorepo (`client/src/...` → `node/src/...`).
- **External references.** Public installs of `@jinn-network/client` keep working for one minor cycle via the alias package, then break at v0.2.0 (announced in v0.1.x and v0.2.0 release notes).
- **DR-2026-05-19 stewardship.** The v0.1.6 stewardship boundary is unaffected; this lands as a `refactor` shape in a future patch cut, or as part of the v0.2.0 cut.
- **`spec/2026-04-14-client-surface.md` re-frames.** Becomes the spec for the future thin client; its current "client" references re-read correctly under the new terminology.
- **Recovery path for operators who don't read release notes.** Fallback read on `~/.jinn-client/` covers one cycle; missing that, the daemon re-bootstraps from zero and the keystore + earning state is on disk for `mv` recovery.

## Migration plan

Single tracking Issue, four child Issues, all `refactor` shape:

1. **Rename A — code surface.** `git mv client node` + monorepo import sweep + tsconfig path updates + Yarn workspace path. Land as one PR; rebases hard, schedule in a clean week.
2. **Rename B — package surface.** Publish `@jinn-network/node@<v>` as canonical. Publish `@jinn-network/client@<v>` as deprecated alias re-exporting `@jinn-network/node`. Update install docs.
3. **Rename C — operator surface.** Daemon reads `~/.jinn/` and falls back to `~/.jinn-client/` with one-shot deprecation log. Update `CLAUDE.md`, `README.md`, `client/README.md`, runbooks.
4. **Rename D — alias removal.** v0.2.0 cut. Drop the `@jinn-network/client` alias publish. Drop the `~/.jinn-client/` fallback read path. Announce in release notes.

Steps A + B + C land together in one minor cut. Step D lands at v0.2.0, no earlier than 4 weeks after C.

## Risk assessment

- **Operator state loss.** If an upgrade hits and the fallback read fails, the daemon re-bootstraps from zero — losing keystore + earning state. Mitigation: read-fallback covers the one-cycle window; the fallback also logs the deprecation path; keystore is still on disk for manual recovery. Risk: low.
- **External integrators.** Anyone consuming `@jinn-network/client` programmatically gets one minor cycle of warning. Risk: low (small surface today).
- **Search-engine + link drift.** Stack Overflow / Discord / blog references to `@jinn-network/client` outlive the alias. Mitigation: keep the alias package's npm description pointing at the rename. Risk: cosmetic.
- **Rebase pain during the rename PR.** ~70-file diff is sensitive to concurrent work. Mitigation: schedule in a low-PR week; freeze new `client/` PRs for the duration.
- **Mid-cycle confusion.** Two paths, two package names, deprecation log all at once. Mitigation: deprecation log is one line, fallback is silent if `~/.jinn-client/` doesn't exist. Risk: low.

## Open

- **Config dir name: `~/.jinn/` or `~/.jinn-node/`?** Argument for `~/.jinn/`: cleaner, parallels `~/.npm/`, `~/.cargo/`, owns the brand namespace. Argument for `~/.jinn-node/`: leaves `~/.jinn/` available for a future parent shared by Jinn-affiliated tools. Default proposal: `~/.jinn/`.
- **Future thin-client name.** Whether the actual client surface ships as `@jinn-network/sdk`, `@jinn-network/client` (reclaimed post-alias-removal), or a `jinn client` subverb. Decide when the thin surface ships, not now.
- **Timing.** Whether A+B+C land in the v0.1.x patch cycle or are held for v0.2.0. Default proposal: A+B+C in patch, D at v0.2.0.

## Status

Proposed by opus 2026-05-20. Captain ratification pending. Implementation tracked under the umbrella GitHub Issue created at ratification; children A–D land as sub-issues of that umbrella.
