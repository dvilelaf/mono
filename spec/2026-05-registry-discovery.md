# Plug-in Registry & Discovery — Technical Spec

> Version: 1
> Date: 2026-04-27
> Author: Ale
> Status: Proposed (not yet adopted)
> Supersedes: none
> Informs: `jinn-mono-7zz` (first-class operator-supplied restorers / plug-in flow)
> Audit: `jinn-mono-j75` §7.2.3, §8 decision #1
> Sibling specs: `spec/2026-05-schema-versioning.md`, `spec/2026-05-executor-trust-boundary.md`

## 1. Purpose and scope

This spec records the **Phase 1 decision for how a Jinn client discovers
which `RestorerImpl` / `EvaluatorImpl` instances exist** at boot time,
and how an operator extends the set without forking the daemon.

It is a short decision record. The mechanism it commits to (in-repo
directory + config-declared plug-ins) is shaped jointly with the two
sibling specs:

- `spec/2026-05-schema-versioning.md` — what kinds an impl claims via
  its manifest `supportedKinds`.
- `spec/2026-05-executor-trust-boundary.md` — what credentials and
  filesystem an impl receives, and how its manifest is signed and
  pinned.

This spec answers the **discovery** question only: where does the list
of impl candidates come from, and what is the rejection rule for
sources outside that list. The trust-boundary spec owns provenance
verification on the candidates this spec selects.

### 1.1 In scope

- The Phase 1 mechanism for enumerating candidate impls at daemon
  startup.
- The config field that declares operator-supplied plug-ins (sketch;
  exact shape finalised by `jinn-mono-7zz`).
- The interaction with the trust-boundary manifest from
  `spec/2026-05-executor-trust-boundary.md` §5.2.
- What is **explicitly excluded** for Phase 1 and what would be
  required to reopen each excluded option.

### 1.2 Out of scope

- The plug-in loader's runtime mechanism (dynamic `import()` vs fork
  vs out-of-process). That is `jinn-mono-7zz`; this spec gives it a
  source-of-candidates contract, not an execution model.
- Manifest signature verification, CID pinning, capability allow-lists,
  and revocation. Those live in
  `spec/2026-05-executor-trust-boundary.md` §5.
- Schema versioning of intent kinds and manifests. That is
  `spec/2026-05-schema-versioning.md`.
- Multi-operator plug-in marketplaces, payments, or reputation. Phase
  2+ concerns; see §5.

### 1.3 Non-goals

- This is not an on-chain registry spec. Phase 1 explicitly does **not**
  publish or read impl identity from any chain. Phase 2 may; see §4.
- This is not a package-management spec. Operators install packages
  with their existing tooling (`yarn add`, `npm install`, container
  base image, etc.); the daemon does not fetch or update packages.

## 2. Problem

A Jinn daemon at boot needs to assemble the set of `RestorerImpl` and
`EvaluatorImpl` instances it will run. Today (per audit
`jinn-mono-j75` §5, §7.1.1, gap #1) that set is hard-coded across two
call sites: `client/src/main.ts` and
`client/src/cli/intent-registry-access.ts::buildIntentsCliRegistry`.
The 7ee close-out (audit §12) collapsed those into the single factory
`buildRestorerImpls` (`client/src/restorer/impls/index.ts`), so today
the answer is: "whichever impls are imported and constructed by
`buildRestorerImpls` at compile time."

That works for first-party impls reviewed in-repo. It does not work
for:

1. An operator who wants to run a third-party impl without forking the
   daemon binary.
2. An operator who wants to disable a first-party impl in their fleet
   without recompiling.
3. A maintainer who wants to publish a new impl on its own release
   cadence (e.g. an exchange-specific restorer that tracks an
   exchange's ABI changes faster than the daemon's release train).

The audit (`jinn-mono-j75` §7.2.3, §8 decision #1) frames the question
as four candidates, listed below. This spec picks one for Phase 1.

## 3. Options considered

The audit's four candidates, with the rejection or acceptance reason
for Phase 1.

### 3.1 (a) Directory scan only

**Mechanism:** the daemon enumerates files under
`client/src/restorer/impls/<name>/` (or a designated runtime path) and
loads everything it finds.

**Rejected for Phase 1.** Two problems:

1. No operator-controlled disable. Anything dropped in the directory
   runs; there is no per-fleet selection.
2. No provenance hook. The trust-boundary spec
   (`spec/2026-05-executor-trust-boundary.md` §5) requires a manifest
   signed by a key in `trustedImplSigners`. A bare directory scan has
   nothing to verify against.

In-repo impls today *are* discovered by static import in
`buildRestorerImpls`, which is functionally close to a directory scan
but constrained at code-review time — that channel remains and is
distinct from this option (see §4.1).

### 3.2 (b) Manifest + config-declared plug-ins — **selected**

**Mechanism:** two sources, unioned at boot:

1. The in-repo factory `buildRestorerImpls` (existing behaviour).
2. Config-declared plug-ins under a new `restorers.plugins` field;
   each entry references a package + manifest the daemon loads via
   the trust-boundary spec's install-time / runtime checks.

**Selected for Phase 1.** Rationale:

- Reviewable per-fleet surface. The operator's `config.json` is the
  single source of truth for which third-party impls are active.
- Provenance hook is direct. Each plug-in entry references a
  `jinn.manifest.json` (`spec/2026-05-executor-trust-boundary.md`
  §5.2), signed by a key the operator has trusted. Discovery and
  trust use the same artifact.
- No new infrastructure. Operators install packages with existing
  tooling; the daemon resolves entry points at boot.
- Forward-compatible. The `package.cid` field in the manifest is the
  integration point for a Phase 2 on-chain or remote registry: the
  same manifest, just delivered through a different channel.

### 3.3 (c) On-chain registry

**Mechanism:** a contract publishes `(name, manifestCid, signer)`
tuples; clients read it at boot.

**Deferred to Phase 2+.** Two blockers:

1. No node identity primitive yet. ERC-8004 is the planned identity
   layer (`jinn-cli-agents/docs/...`); until it lands, an on-chain
   registry has no canonical "who is this signer" answer beyond a raw
   pubkey, which `trustedImplSigners` already gives us off-chain.
2. Cost and latency. Boot would gain an RPC dependency for a list
   that, in Phase 1, has at most a handful of entries per operator.

Reopening this option requires a new spec citing the ERC-8004 (or
successor) design and a concrete fleet-size threshold above which the
on-chain table earns its cost.

### 3.4 (d) Remote registry

**Mechanism:** a hosted HTTP / IPFS endpoint serves a curated index of
manifests; clients fetch it at boot or via `jinn impls update`.

**Deferred to Phase 2+.** Two reasons:

1. Centralisation. A hosted index is a new trust anchor that competes
   with `trustedImplSigners`. Operators today choose which keys to
   trust; a remote registry would inject a maintainer-curated list
   between operator and signer.
2. Availability coupling. Daemon boot would depend on registry
   availability. The trust-boundary spec deliberately keeps boot
   offline-safe (§5.4); a remote registry undoes that guarantee
   unless cached aggressively, at which point it is a manifest CID
   under a different name.

The maintainer-published revocation list
(`spec/2026-05-executor-trust-boundary.md` §5.6.3) is the one
sanctioned hosted artifact for Phase 1, and it is **subtractive only**
(it removes trust, never grants it). A remote registry is the
additive counterpart and is deferred.

## 4. Phase 1 decision

The daemon assembles its impl set at boot from two — and only two —
sources, unioned:

### 4.1 Source A: in-repo factory

`buildRestorerImpls` in `client/src/restorer/impls/index.ts` continues
to be the in-repo enumeration. Its impls are trusted to the same level
as the daemon binary (audit §7.2.3,
`spec/2026-05-executor-trust-boundary.md` §5.1) and do **not** carry a
`jinn.manifest.json`. Adding, removing, or changing an in-repo impl is
a normal code review on the daemon repo.

Operators MAY disable individual in-repo impls via configuration
(`restorers.disabled: ["legacy-claude", ...]`, exact field name
finalised by `jinn-mono-7zz`). Disabling is purely subtractive — it
cannot change behaviour, only suppress an impl entirely.

### 4.2 Source B: config-declared plug-ins

A new top-level field on the daemon config:

```jsonc
// ~/.jinn-client/config.json (sketch — exact field names finalised by jinn-mono-7zz)
{
  "restorers": {
    "plugins": [
      {
        "name": "@some-operator/restorer-foo",   // matches jinn.manifest.json `name`
        "package": "ipfs://bafy...manifest",      // points at the manifest, not the tarball
        "entry": "./node_modules/@some-operator/restorer-foo"
      }
    ]
  }
}
```

The fields, in plain terms:

| Field | Purpose |
|---|---|
| `name` | The unique impl name. MUST equal the `name` in the resolved `jinn.manifest.json`. Mismatch is an install-time refusal. |
| `package` | A pointer to the plug-in's `jinn.manifest.json` (typically `ipfs://<cid>` or a local path during development). The manifest carries the tarball CID, signature, and capability allow-list per `spec/2026-05-executor-trust-boundary.md` §5.2. |
| `entry` | The local filesystem path the daemon's loader resolves at boot (typically a node_modules path the operator has populated with their package manager). The chosen loader (`jinn-mono-7zz`) decides whether this is a dynamic-import path, a fork-template root, or an MCP server descriptor. |

The exact key names (`plugins` vs `pluginEntries`, `package` vs
`manifest`, etc.) are finalised by `jinn-mono-7zz` when it lands the
implementation. This spec commits to the **shape** — name, manifest
pointer, local entry — not the spelling.

### 4.3 Discovery procedure at boot

The boot sequence:

1. `buildRestorerImpls` constructs the in-repo impls (§4.1). Disabled
   names are filtered out.
2. For each entry in `restorers.plugins`:
   a. Resolve `package` to a local pinned `jinn.manifest.json`
      (install-time work; the daemon does not fetch from IPFS at
      boot — see `spec/2026-05-executor-trust-boundary.md` §5.4).
   b. Run runtime trust checks: signature verifies against
      `trustedImplSigners`; tarball sha256 matches `package.hash`;
      capability allow-list is within daemon ceiling; impl is not
      revoked (`spec/2026-05-executor-trust-boundary.md` §5.6).
   c. Resolve `entry` to a module / process descriptor via the
      Phase 1 loader (`jinn-mono-7zz`).
   d. Register the constructed impl into the same `RestorerImpl`
      registry the in-repo source feeds.
3. Reject any duplicate `name` across both sources. Plug-in collision
   with an in-repo name is an operator-fixable error: rename the
   plug-in, disable the in-repo entry, or remove the plug-in.

If step (2b) fails for any plug-in, that plug-in is excluded and
`status.fleet.needsAttention` is flagged with reason `"impl-trust"`
or `"impl-revoked"` (per the client-surface spec). The daemon does
not abort boot — other impls remain available.

### 4.4 What this rules out

The decision in §4.1–§4.3 explicitly rules out, for Phase 1:

- **No on-chain discovery.** The daemon does not read impl identity,
  manifest pointers, or signer trust state from any contract. The
  only on-chain reads at boot remain those required for staking,
  Safe ownership, and OLAS service state (`client/src/earning/`).
- **No remote registry HTTP fetch.** The daemon does not call out to
  a maintainer-hosted index for impl candidates. The single permitted
  hosted artifact is the revocation list
  (`spec/2026-05-executor-trust-boundary.md` §5.6.3), which is
  subtractive.
- **No directory scan of operator-writable paths.** A future
  `~/.jinn-client/impls/` autoload directory is **not** part of Phase
  1. Operators add plug-ins by editing config; the daemon never picks
  up a plug-in the operator has not explicitly listed.
- **No bare-package plug-ins.** Every config-declared plug-in MUST
  resolve to a `jinn.manifest.json` per the trust-boundary spec. An
  npm package without a manifest is not a valid plug-in source.

Reopening any of the above requires a new spec. The intent is that
the next operator who proposes "let's just add a directory scan" has
to reckon with §3.1 first.

## 5. Phase 2+ outlook (informational)

This section is non-binding and does not commit the protocol to any
of the below. It exists so the §4.4 deferrals have a forward path.

### 5.1 ERC-8004 node identity

When ERC-8004 (or the successor identity primitive) is integrated, an
on-chain registry becomes plausible because each signer can bind a
pubkey to a node identity with payment / reputation context. The
Phase 2 spec covering this would extend the `package` field with an
on-chain pointer (e.g. a registry contract address + index) as an
alternative to `ipfs://`.

### 5.2 Maintainer-curated index

A hosted additive index — symmetric to the revocation list — could
publish "manifests the Jinn maintainers have reviewed" without
removing the operator's `trustedImplSigners` veto. Whether this
materialises depends on operator demand: if Phase 1 fleets routinely
share the same five plug-ins, an index reduces config churn; if every
fleet runs its own bespoke set, it does not.

### 5.3 Cross-fleet plug-in discovery

A multi-operator marketplace (browse, install, rate impls across
fleets) is explicitly deferred. It composes on top of either §5.1 or
§5.2 once those exist, and is not on the Phase 1 / Phase 1b roadmap.

## 6. Acceptance and downstream impact

### 6.1 Acceptance

This spec is accepted when:

1. It is merged under `spec/`.
2. `jinn-mono-7zz` description is updated to reference this spec as
   its discovery-source input (alongside
   `spec/2026-05-schema-versioning.md` and
   `spec/2026-05-executor-trust-boundary.md`).
3. The third sibling of epic `jinn-mono-9ry` is closed by this merge.

### 6.2 Downstream tasks (informational, not committed by this spec)

- `jinn-mono-7zz` finalises the exact field names under `restorers`
  (§4.2 sketch) and ships the loader implementation. It is the only
  consumer of all three 9ry specs and is the integration point where
  discovery, trust, and versioning meet runtime code.
- A follow-up bead implements the in-repo disable list (§4.1) — small
  and self-contained, but distinct from the plug-in loader work.
- A follow-up bead defines the `jinn impls list` / `jinn impls show`
  CLI verbs that surface the discovery state (which plug-ins
  resolved, which were excluded by trust failure or revocation, which
  in-repo impls are disabled). Companion to the install / trust verbs
  in `spec/2026-05-executor-trust-boundary.md` §7.2.

### 6.3 Open questions deferred

- Whether the `entry` field allows a remote target (e.g. an MCP
  server URL) directly, or only a local filesystem path resolved by
  the operator's package manager. `jinn-mono-7zz` decides as part of
  the loader model; the trust-boundary spec's §6 seams already
  anticipate both.
- Per-plug-in environment / config injection (e.g. a plug-in needs
  an exchange API base URL). Deferred to the trust-boundary spec's
  `ctx.secrets` flow plus a future plug-in-config field; out of scope
  here.
- Plug-in update semantics (how an operator moves to a newer
  manifest CID). Conceptually a `jinn impls update <name>` verb that
  re-runs install-time checks against a new `package` pointer; field
  shape lives with `jinn-mono-7zz`.

## 7. References

- `docs/reviews/2026-04-22-architecture-audit-j75.md` — audit; this
  spec records the policy half of §8 decision #1 and closes §7.2.3.
- `spec/2026-05-schema-versioning.md` — sibling spec. A plug-in's
  `jinn.manifest.json` `supportedKinds` array follows that spec's
  grammar; this spec assumes it as the kind-routing contract.
- `spec/2026-05-executor-trust-boundary.md` — sibling spec. §5 of
  that spec owns manifest signing, capability allow-lists, install
  vs runtime checks, and revocation. This spec calls into those
  rules for every config-declared plug-in.
- `spec/2026-04-14-client-surface.md` — `status.fleet.needsAttention`
  and `jinn version --json` shape that the discovery surface (§4.3)
  reports into.
- `client/src/restorer/impls/index.ts` — the in-repo factory that is
  Source A in §4.1.
