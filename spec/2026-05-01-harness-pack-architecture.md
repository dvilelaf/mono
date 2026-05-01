# SolverNet architecture — Harness, SolverPlugin, and Task semantics

- **Date:** 2026-05-01
- **Author:** opus (drafted on jinn-mono-dwqm; Captain ritsukai)
- **Status:** Proposal
- **Version:** 0.5
- **Tracks:** Phase A.2 reframe — supersedes the wrapper-with-specialist construct introduced in PR #63; replaces `spec/2026-04-30-plug-in-surface.md` Path 1 with a harness-agnostic SolverPlugin mechanism that extends existing AI-tool plugin formats.

**Sibling specs (load-bearing pre-reads):**

- `spec/2026-04-28-restorer-architecture.md` — ADR: specialists-first; `claude-code-learner` is one impl among many. This spec re-aligns the implementation with the ADR after a drift in PR #63.
- `spec/2026-04-30-plug-in-surface.md` — the spec this one supersedes for Path 1. Path 2 commitments hold under the renames in §11.
- `spec/2026-05-external-restorer-impls.md` / `spec/2026-05-executor-trust-boundary.md` / `spec/2026-05-registry-discovery.md` / `spec/2026-05-schema-versioning.md` — Path 2 substrate. All five hold under the rename `RestorerImpl → Harness`.
- `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md` — the seven-phase pipeline. Stays as the bundled learner's internal architecture; the wrapper layer is removed.

**Discussion lineage:**

- [#57](https://github.com/Jinn-Network/mono/discussions/57) — Prediction SolverNet GTM. The "client as meta-harness" framing is *implemented as registry-default-Harness + plugin-aware loading*, not as an every-SolverType wrapper.
- [#59](https://github.com/Jinn-Network/mono/discussions/59) — knowledge-market roadmap. The "harness-level compounding" claim is what the learner does end-to-end inside its own implStateDir; this spec resolves how that fits with peer Harnesses that don't learn.

**Bead lineage:**

- `jinn-mono-dwqm` — "Learning loop excludes Path 2 specialist behaviour." This spec resolves that bead by *removing the construct that created the problem* (the universal wrapper) rather than patching around it.
- `jinn-mono-juw` / GH#43 — `RestorerImpl → Harness` rename. Lands as part of this spec.

---

## 1. Purpose and scope

### 1.1 What this spec commits

Five coordinated architectural moves that re-align the implementation with what the Phase A.2 spec already said and what the original learner design intended:

1. **Delete the universal wrapper.** `claude-code-learner` becomes a peer Harness in the registry, not a substrate that wraps every SolverType. Its `supports()` returns `true` for any non-evaluation restoration; it is the registry's *default* when no other Harness claims a SolverType. It owns its `run()` end-to-end.
2. **Rename `RestorerImpl → Harness`** and the protocol role **`Restorer → Solver`**. The thing-an-operator-runs is a Harness; the protocol role they fulfil is Solver. The rename disambiguates role from implementation and unifies the vocabulary cluster (SolverNet / SolverType / SolverPlugin / Solver / Solution).
3. **Introduce SolverPlugins.** A SolverPlugin is a harness-agnostic package supplying SolverType-specific *substrate* — schemas (optional), MCP-tool servers, and skills an operator plugs into their Harness to handle a SolverType. **A SolverPlugin is a superset of existing AI-tool plugin formats** (Claude Code's `.claude-plugin/plugin.json`, Gemini's `gemini-extension.json`) — a single artifact that's a Claude Code plugin, a Gemini extension, *and* a Jinn SolverPlugin at the same time, depending on which consumer reads it. SolverPlugins do not dictate flow, tunables, or starting Harness — those live elsewhere (Harness owns flow + tunables; SolverNet config carries the starting Harness).
4. **Introduce SolverNets and Tasks as distinct levels.** A SolverNet is the campaign / group / objective. A Task is one posted item — the on-chain unit a Solver claims and produces a Solution for. The SolverNet declares one SolverType; many Tasks of that SolverType flow through it.
5. **Ship the Prediction SolverNet as the first instance.** `@jinn-network/prediction-plugin` ships in-repo, on by default for new operators. The starting Harness (the learner) plus the prediction plugin is what the GTM in #57 calls the "client as meta-harness" running against the Polymarket-derived Task stream.

### 1.2 In scope

- The SolverPlugin manifest shape (extension of existing host plugin formats).
- The Harness interface (renamed from `RestorerImpl`) and its plugin-loader.
- The Task vocabulary (renamed from `intent` / `RestorationJob`).
- The Solution / Verdict output vocabulary (renamed from `RestorationOutput`).
- Registry resolution rules (`bySolverType` + default; Path 2 trumps default).
- The `@jinn-network/prediction-plugin` content for v1 of the Prediction SolverNet.
- Migration of `prediction-v0-baseline`, the existing `client/src/intents/kinds/` modules, and the wrapper code paths.
- Trust-boundary disposition (SolverPlugin content vs. Harness code vs. operator state).
- The "SolverNet" composition pattern (SolverType + objective + starting plugin + starting Harness + Task generator).

### 1.3 Out of scope

- Implementation of the rename PR itself (the renames are *committed* here; mechanical execution lives in follow-up beads).
- Per-component royalty / pricing / DRM (continues to be off the roadmap per DR-2026-04-30).
- Multi-evaluator consensus mechanics (Phase B).
- Hot-reload of SolverPlugins or Harnesses inside a running daemon (Phase 2+; consistent with `2026-05-external-restorer-impls.md` §3.4).
- An on-chain SolverPlugin registry (Phase 2+; analogous to the impl-registry deferral).
- Tight coupling of Task-on-chain to a specific SolverPlugin CID (loose-association in v1; tight is Phase B+).
- Path 1 in its previous form. The phase-agent-override / topic-explorer / hook / memory-backend slot taxonomy from `spec/2026-04-30-plug-in-surface.md` §4.2 is *retired* in favour of the SolverPlugin mechanism. Path 1's recruit story becomes "ship a SolverPlugin" (harness-agnostic) or "fork the learner template" (harness-specific). See §11.6.

### 1.4 Non-goals

- This spec does not commit a marketplace.
- This spec does not redefine the protocol layer. JinnRouter, IdentityRegistry, ValidationRegistry, ReputationRegistry, ClaimRegistry, x402, ERC-8004 — all unchanged in shape; only the on-chain field name `kind` becomes `type` (carrying the SolverType identifier) per §11.4.
- This spec does not define a new Harness alongside `claude-code-learner`. Alternative Harnesses (Pi.dev / Codex / Gemini-CLI ports) are recruit targets — they ship their own plugin-loaders when they appear.

---

## 2. Glossary

| Term | Definition |
|---|---|
| **SolverNet** | A composition: (SolverType + objective + starting plugin + starting Harness + optional Task generator). The campaign / group level. The Prediction SolverNet is the first instance. Defined in operator config and a reference in-repo; not a protocol object. |
| **Objective** | The public scalar a SolverNet rallies around. For the Prediction SolverNet: spread vs. Polymarket consensus. Trend matters more than level (#57 §5). |
| **SolverType** | The schema-versioned identifier a Task's spec conforms to. Examples: `prediction.v0`, `prediction.apy.v0`, `portfolio.v0`. Grammar per `spec/2026-05-schema-versioning.md`. SolverType *schemas* live in the Type-defining SolverPlugin; the Type identifier is just a string tag the daemon and Harnesses use as a join key. |
| **SolverPlugin** | A harness-agnostic package supplying SolverType-specific substrate — schemas (optional), MCP servers, skills — that an operator plugs into their Harness to handle a SolverType. Manifested as an extension of an existing AI-tool plugin format (Claude Code plugin / Gemini extension / standalone) with a `jinn` field. Read-only at runtime. Distributable via npm, plugin marketplace, git release, or IPFS. |
| **Task** | The on-chain posted item. Today: `JinnRouter.createRestorationJob`'s product. Carries a `specCid` referencing the IPFS-stored spec. The Solver claims a Task, runs it via their Harness, and submits a Solution. |
| **Solution** | The Solver's output for a Task. The thing today called `RestorationOutput`. |
| **Verdict** | The Evaluator's output scoring a Solution. Carries a `verdictPayload` (kept; protocol-level field). |
| **Harness** | The runtime an operator runs to claim and solve Tasks. The thing today called `RestorerImpl`. Implements the Solver protocol role. May or may not be plugin-aware; may or may not learn. Owns its flow, improve-phase, and tunables. |
| **HarnessContext** | The runtime context the daemon hands to a Harness's `run()` method — the bundle of inputs and capabilities a Harness has to do its work. Carries: the `Task`, the `specCid`, an `implStateDir` (the Harness's persistent state directory), a `workingDir` (ephemeral, cleared between attempts), a `log` callback, an `abort` `AbortSignal`, an `msUntilEndTs` deadline accessor, a `trajectory` collector for span emission, and (when the daemon is providing them per the Harness's manifest allow-list) scoped `signer` / `rpc` / `secrets` capability handles per `spec/2026-05-executor-trust-boundary.md` §3. Today: `RestorationContext`, defined in `client/src/restorer/types.ts`. See §7.2.1. |
| **Solver** | A protocol role (Creator / Solver / Evaluator) — and the operator who fulfils it. The Solver claims a Task, runs it via their Harness, and submits a Solution. Renamed from `Restorer` (the on-chain function name `createRestorationJob` and other deployed-contract identifiers stay; the conceptual role label changes — see §11.2). |

---

## 3. First-principles model

Two levels with distinct concerns; primitives at each level keep clean boundaries:

```
─── Level 1 (group / persistent definition) ────────────────────────────────
     SolverNet (operator config + reference in-repo)
       ├── name
       ├── solverType         → schema-versioned identifier (prediction.v0)
       ├── objective          → public scalar + aggregation rule
       ├── taskGenerator      → posts Tasks on a cadence (optional)
       ├── startingPlugin     → recommended SolverPlugin for new operators (swappable)
       └── startingHarness    → recommended Harness for new operators (swappable)

─── Level 2 (per-item / ephemeral) ──────────────────────────────────────────
     Task (one per posted item; many per SolverNet)
       ├── on-chain           → JinnRouter object with escrow + eligibility
       └── spec (IPFS)        → solverType + per-Task fields (predicate, window, ...)

       Solver claims Task → Harness runs → Solution submitted
       Evaluator scores Solution → Verdict produced
       Verdict's score contributes to SolverNet's Objective

─── Operator-installed primitives (the things that make a SolverNet runnable) ─
     SolverPlugin (host-plugin-format package; one or more per SolverType)
       ├── jinn.supportsSolverTypes
       ├── jinn.schemas (if Type-defining)         ← canonical schemas for the SolverType
       ├── mcpServers (host plugin field)
       └── skills (host plugin field; knowledge embedded as skill content)

     Harness (npm package)
       ├── owns flow + improve-phase + tunables (Harness-internal)
       └── consumes installed SolverPlugins at session-start (registers tools/skills/schemas)
```

- **Level 1 is persistent.** A SolverNet is defined once and runs continuously. Its SolverType and Objective don't change between Tasks; its scalar accumulates as Tasks resolve.
- **Level 2 is ephemeral.** Each Task is posted, claimed, solved, scored, settled, indexed.
- **The join key is SolverType.** On-chain a Task carries its SolverType identifier; operator-side a SolverNet declares which SolverType it coordinates around; SolverPlugins declare which SolverTypes they provide substrate for. JinnRouter (protocol) only knows about SolverTypes; SolverNet is operator/config-level coordination.
- **SolverPlugin and Harness are independent.** A SolverPlugin ships substrate (schemas + tools + skills) for a SolverType. A Harness owns the runtime (flow, improve-phase, tunables) and consumes whatever plugins are installed. Neither dictates the other; the SolverNet's starting plugin and starting Harness are starting points, not bindings.
- **Schemas live in the Type-defining plugin.** Permissionless: anyone can publish a plugin with new schemas + tools + skills and operators install it without going through the core team. Cross-language: schemas are JSON Schema, readable by any Harness regardless of language. First-party SolverNets ship with their Type-defining plugin pre-installed so first-boot operators don't see a schema-missing failure.

The clean separation: **SolverType supplies an *identifier*; SolverPlugin supplies *what shape (via schemas) and what tools/skills are useful*; Harness supplies *how to actually run it*; SolverNet supplies *what we're trying to improve*; Task supplies *the specific thing to solve right now*.**

---

## 4. The SolverNet

### 4.1 Definition

A SolverNet is a composition pattern declared in operator config and (for first-party SolverNets) defined as a reference in-repo:

```jsonc
{
  "name": "Prediction",
  "solverType": "prediction.v0",
  "objective": {
    "scalar": "brier-spread-vs-polymarket",
    "polarity": "lower-is-better",
    "rollingWindowDays": 84
  },
  "taskGenerator": "polymarket-derived-auto-poster",
  "startingPlugin": "@jinn-network/prediction-plugin",
  "startingHarness": "claude-code-learner",
  "publicDashboard": "https://jinn.network/solvernets/prediction"
}
```

A SolverNet is **not a protocol object**. JinnRouter doesn't know about SolverNets; it knows about Tasks with SolverTypes. The SolverNet is operator-side coordination — the way a daemon decides "which plugin and Harness to start with for a Task with `spec.type: 'prediction.v0'`," and the way the network publicly rallies around an Objective.

### 4.2 What a SolverNet declares

| Field | Purpose |
|---|---|
| `name` | Human-readable label. Used for dashboards, prose, and the `<name> SolverNet` proper-noun in docs. |
| `solverType` | The schema-versioned SolverType the SolverNet coordinates around. Per `spec/2026-05-schema-versioning.md`. |
| `objective` | The public scalar definition: how to compute it, polarity, rolling window. Used by the dashboard and (eventually) by Solvers' improve phases as the meta-feedback signal. |
| `taskGenerator` | The auto-poster (today: `creator.ts` + `getTestnetAutoConfig`). Optional — operators can disable to consume Tasks posted by others without contributing to creation. |
| `startingPlugin` | The SolverPlugin a new operator's daemon installs by default. Operators can swap or remove. |
| `startingHarness` | The Harness a new operator's daemon uses by default for this SolverType. Operators can override via `harnesses.bySolverType`. |
| `publicDashboard` | Informational. Where the rolling Objective trend is rendered. |

### 4.3 Multiple SolverNets per daemon

A daemon can run more than one SolverNet at a time — e.g., Prediction + Portfolio. Each SolverNet declares its own SolverType; the daemon's registry routes incoming Tasks by SolverType to the correct Harness. SolverNets do not compete inside one daemon; they coexist. Cross-SolverNet selection ("which SolverNet should this generic Task go to?") is not a protocol concern — Tasks identify their SolverNet by SolverType.

---

## 5. The SolverPlugin

### 5.1 What a SolverPlugin is

A SolverPlugin is **what an operator plugs into their Harness to handle a particular SolverType**. It is *substrate* — schemas, tools, skills. It does not prescribe how to use them.

A SolverPlugin contains:

- **Schemas (optional)** — JSON Schemas for the SolverType's Task / Solution / Verdict shapes. A plugin that ships schemas is *Type-defining* (see §5.3). A plugin that omits schemas is adding tools/skills atop a SolverType already defined by another plugin.
- **MCP-tool servers** — process-based tools any MCP-aware Harness can spawn.
- **Skills** — markdown files with frontmatter that plugin-aware Harnesses register (in Claude Code / Gemini, the host plugin format's standard `skills` field). Knowledge files (forecasting techniques, calibration approaches, etc.) are shipped as skills — there's no separate "knowledge" concept.

A SolverPlugin does NOT contain:

- **Flow** — the Harness owns the pipeline. Mandating flow at the plugin level would prescribe how to solve, contradicting the SolverNet's purpose of discovering what works.
- **Tunables** — the Harness owns its improve-phase contract; tunables describe what the *Harness* mutates, not what the plugin ships.
- **Starting Harness** — plugin is harness-neutral. The SolverNet's operator config carries a starting Harness for ergonomics; the plugin itself doesn't bind to one.

The `jinn` extension on a SolverPlugin manifest is **two fields total**: `supportsSolverTypes` and (optionally) `schemas`.

### 5.2 Format — extension of existing AI-tool plugin manifests

A SolverPlugin is a superset of existing AI-tool plugin formats with a minimal `jinn` field. **Same artifact, multiple consumers** — Claude Code and Gemini consume the standard plugin fields; the Jinn daemon's plugin-aware Harnesses additionally read `jinn.*`. Other plugin hosts ignore `jinn.*`.

This avoids fragmenting the AI-tool plugin ecosystem. Plugin authors who already ship Claude Code plugins extend with one field and they're done. New plugin authors get marketplace install UX, format documentation, and tooling for free.

The full Prediction SolverPlugin manifest:

```jsonc
// .claude-plugin/plugin.json (also valid as gemini-extension.json with field-name shim)
{
  "name": "@jinn-network/prediction-plugin",
  "version": "0.1.0",
  "description": "Substrate for the Prediction SolverNet — Polymarket-style binary forecasts.",

  // Standard plugin fields — Claude Code / Gemini consume.
  "mcpServers": {
    "polymarket": {
      "command": "node",
      "args": ["./mcp-servers/polymarket-api/server.js"]
    }
  },
  "skills": [
    "skills/forecasting-techniques/SKILL.md",   // domain knowledge as skill content
    "skills/calibration-approaches/SKILL.md",
    "skills/base-rates/SKILL.md",
    "skills/common-biases/SKILL.md",
    "skills/polymarket-specifics/SKILL.md"
  ],

  // Jinn extension — two fields.
  "jinn": {
    "supportsSolverTypes": ["prediction.v0"],
    "schemas": {
      "task":     "schemas/task.json",
      "solution": "schemas/solution.json",
      "verdict":  "schemas/verdict.json"
    }
  }
}
```

**Field semantics for the `jinn` extension:**

| Field | Purpose |
|---|---|
| `jinn.supportsSolverTypes` | Per `spec/2026-05-schema-versioning.md` grammar. The SolverType identifiers this plugin's substrate is intended for. The daemon's join key — match a Task's `spec.type` to a plugin via this field. |
| `jinn.schemas` (optional) | JSON Schemas defining the SolverType's payloads. **If present**, the plugin is *Type-defining*: it ships the canonical shape for `task`, `solution`, `verdict`. **If absent**, the plugin is *tools-only*: it adds MCP servers and skills atop a SolverType already defined by another plugin. See §5.3. |

That's the entire `jinn` surface. Two fields.

The standard plugin fields (`mcpServers`, `skills`, optionally `agents`, `hooks`, etc.) carry everything else.

The manifest is JSON-Schema validated at install time and at session start. Unknown `jinn.*` keys fail loud (forward-compat).

### 5.3 Three usage shapes (emergent from `jinn.schemas` being optional)

The optionality of `jinn.schemas` produces three natural plugin shapes — usage patterns, not architectural roles:

| Shape | Has `jinn.schemas` | Has `mcpServers` / `skills` | Purpose |
|---|---|---|---|
| **Type-defining + substrate** | yes | yes | The canonical case for a first-party SolverNet. `@jinn-network/prediction-plugin` ships schemas + tools + skills together. |
| **Tools-only** | no | yes | Extends a SolverType already defined by another plugin. Example: `@some-author/extra-polymarket-tools` adds Kalshi tools alongside the canonical prediction plugin. |
| **Schemas-only** | yes | no | Defines a SolverType for downstream consumers (evaluators, dashboard implementers, cross-language Harnesses) who want schemas without running the substrate. |

All three are valid. The daemon doesn't distinguish them as roles; it just reads the manifest and uses what's there.

**Conflict resolution when two plugins ship `jinn.schemas` for the same SolverType:**

The daemon SHA-256-compares the schema files at install time:

- **Identical** → both load. (Common case: a Tools-only plugin re-ships the same schemas as a sanity copy.)
- **Different** → install fails with a clear error pointing at which file differs and which Type-defining plugin is already canonical.
- **First-claim-wins:** the first Type-defining plugin registered for a SolverType effectively defines its canonical shape. Subsequent Type-defining plugins must match exactly.

This mirrors how npm package-name claiming works in practice: there's no central authority, but conflicts are surfaced at install time. SolverType evolution lives in the Type-defining plugin's version bumps; consumers of that plugin upgrade alongside.

### 5.4 No-Type-defining-plugin behaviour

If a Task arrives for a SolverType with no Type-defining plugin installed:

- The daemon cannot validate the spec.
- The Task is dispatched to whichever Harness claims the SolverType. The Harness decides: refuse with `canAttempt → { ok: false, reason: 'no schema for ...' }`, or proceed permissively (consume raw spec content).
- For first-party SolverTypes like `prediction.v0`, the default daemon ships `@jinn-network/prediction-plugin` pre-installed — so this case is moot in practice.
- Permissionless operators introducing new SolverTypes ship a Type-defining plugin alongside the SolverNet config. The plugin IS the canonical shape definition.

### 5.5 Distribution and install

The SolverPlugin format is distribution-agnostic. The daemon's `jinn plugins add` verb supports multiple resolvers:

```bash
# npm registry
jinn plugins add @jinn-network/prediction-plugin

# Claude Code plugin marketplace
jinn plugins add cc:jinn-network/prediction-plugin

# git release
jinn plugins add github:jinn-network/prediction-plugin@v0.1.0

# local path (development)
jinn plugins add ./client/plugins/jinn-prediction-plugin

# IPFS CID (Phase B+)
jinn plugins add ipfs://bafy...
```

Each resolver fetches the package and validates:

1. Manifest parses (whichever of `.claude-plugin/plugin.json`, `gemini-extension.json`, or a standalone `jinn.plugin.json` is present).
2. `jinn.supportsSolverTypes` validates against the SolverType grammar.
3. If `jinn.schemas` present: paths exist, parse as JSON Schema, hash-compare against any other Type-defining plugin already installed for the same SolverType (§5.3).
4. Standard plugin fields parse against the host plugin schema (skills paths exist, MCP entries are well-formed, etc.).
5. Appends to `~/.jinn-client/config.json` under `solverPlugins[]`.

**Default operator config installs `@jinn-network/prediction-plugin` automatically for new daemons** so the Prediction SolverNet works out of the box. Migration handling for existing operators: §11.8.

### 5.6 Versioning + compatibility

- **SolverPlugin content** (`@jinn-network/prediction-plugin` itself) follows semver. Breaking changes to schemas bump the major; new tools / skills are minor; bug fixes are patches.
- **The `jinn` extension's own schema** follows semver with a 12-week deprecation window. v1 ships with two fields; minor adds (e.g., a future optional metadata field) won't break existing plugins.
- **Harness compatibility** is informal — Harness plugin-loaders read whatever `jinn` fields they recognize and ignore unknown ones (forward-compat). A Harness that requires a future `jinn.*` field declares its minimum supported version in its own manifest and refuses to load plugins missing it.

---

## 6. The Task

### 6.1 The on-chain object

A Task is what `JinnRouter.createRestorationJob` produces today, with the rename `RestorationJob → Task`. Its on-chain form (post-rename, semantics unchanged):

| Field | Source | Notes |
|---|---|---|
| `taskId` | router | Unique identifier. |
| `creator` | router | Address that posted the Task. |
| `escrow` | router | Funds held until resolution. |
| `eligibility` | router | Eligibility-checker contract. |
| `window` | router | Deadlines. |
| `specCid` | spec | IPFS CID pointing to the Task's spec content. (Renamed from `intentCid`.) |

### 6.2 The IPFS-stored spec

The Task's spec is the JSON-stored description of *what* this specific Task is asking for. It carries a `type` field identifying the SolverType, plus SolverType-specific fields validated against the Type-defining plugin's `jinn.schemas.task`:

```jsonc
// example: a single Polymarket-derived Prediction Task
{
  "type": "prediction.v0",
  "predicate": "Will the Fed cut by 50bps before July 2026?",
  "resolutionMarket": "0x...",
  "resolutionTime": "2026-07-01T00:00:00Z",
  "resolutionSource": "polymarket"
}
```

The `type` field in the spec is the **join key** between protocol and operator-side. The daemon receives the Task, reads its spec from IPFS, looks up the Type-defining plugin by `type`, validates the spec against that plugin's `schemas.task`, looks up the SolverNet declaring `solverType: 'prediction.v0'`, dispatches to that SolverNet's starting Harness (or the operator's per-SolverType override).

### 6.3 What changes vs. today

Field renames only. The shape of the on-chain object and the IPFS-stored spec are otherwise unchanged. The protocol-level loop (Creator → Solver → Evaluator) operates identically; we are renaming, not redesigning. Deployed contract identifiers (`createRestorationJob`, `deliverToMarketplace`, etc.) stay because they're tied to live contracts; only the conceptual role label and TypeScript-level identifiers change.

---

## 7. The Harness

### 7.1 Renames

- **Type:** `RestorerImpl → Harness`. Interface in `client/src/restorer/types.ts` renamed; directory `client/src/restorer/` → `client/src/harnesses/`; `RestorationContext → HarnessContext`; `RestorationOutput → Solution`; `restorationPayload → solutionPayload`.
- **Path 2 SDK:** `@jinn-network/restorer-sdk` → `@jinn-network/harness-sdk`, dual-publish for 12 weeks.
- **Protocol role:** `Restorer → Solver`. The conceptual role-label in docs and TypeScript-level identifiers change. Deployed contract identifiers (e.g., `JinnRouter.createRestorationJob`, `RestorationActivityChecker`, `restorationPayload` field on submitted manifests) stay — they're pinned to live contracts; renaming them would force a redeployment for cosmetic reasons. Future contract revisions may rename; this spec doesn't.

The role-vs-implementation split is preserved: a Solver (role) runs a Harness (implementation). The Solver vocabulary is now consistent everywhere — SolverNet / SolverType / SolverPlugin / Solver / Solution.

### 7.2 Interface (post-rename)

```ts
export interface Harness {
  readonly name: string;
  readonly version: string;
  supports(spec: { type: string; role?: 'restoration' | 'evaluation' }): boolean;
  isReady(spec?: { type: string; role?: 'restoration' | 'evaluation' }): Promise<ReadyStatus>;
  canAttempt?(task: Task): Promise<{ ok: true } | { ok: false; reason: string }>;
  onEnable?(args: Record<string, string | undefined>, spec?: { type: string; role?: 'restoration' | 'evaluation' }): Promise<EnableResult>;
  onDisable?(spec?: { type: string; role?: 'restoration' | 'evaluation' }): Promise<void>;
  run(ctx: HarnessContext): Promise<Solution>;
}
```

**Field-name note:** the old shape was `{ kind: string; type?: 'restoration' | 'evaluation' }`. The rename `kind → type` (carrying the SolverType identifier) collides with the existing role field. Resolved by renaming `type → role` in the same pass — `'restoration' | 'evaluation'` is semantically a *role*, not a *type*, so the rename improves clarity. The role values themselves (`'restoration'` / `'evaluation'`) stay as protocol-level strings until contract redeployment lets them shift to `'solution'` / `'evaluation'`. Migration mechanics: §11.4.

### 7.2.1 What HarnessContext carries

The `HarnessContext` object the daemon hands to `run()` is the Harness's full input + capability bundle:

```ts
export interface HarnessContext {
  /** The Task this Harness is being asked to handle. */
  task: Task;

  /** IPFS CID of the Task's spec content (renamed from `intentCid`). */
  specCid?: string;

  /** Persistent directory for Harness-specific state. The improve phase mutates here. */
  implStateDir: string;

  /** Ephemeral working directory; cleared between attempts. */
  workingDir: string;

  /** Logger callback. */
  log: (event: { level: 'info' | 'warn' | 'error'; msg: string; data?: unknown }) => void;

  /** Fires at window.endTs. */
  abort: AbortSignal;
  msUntilEndTs: () => number;

  /**
   * In-run trajectory collector. Harnesses call ctx.trajectory.addSpan(...) to
   * emit spans; the daemon emits the collected trajectory to IPFS before
   * envelope assembly and populates envelope.trajectory with { cid, sha256 }.
   */
  trajectory: TrajectoryCollector;

  /**
   * Scoped capability handles, present only when the daemon is providing the
   * surface per the Harness's manifest allow-list. Absent for stub-mode CLI.
   * Trust contract: `spec/2026-05-executor-trust-boundary.md` §3.
   */
  signer?: ScopedSigner;
  rpc?: ScopedRpc;
  secrets?: ScopedSecrets;
}
```

The Harness reads from the context, does its work, returns a `Solution`. Mutations the Harness wants to persist between runs go to `implStateDir/`. Ephemeral artifacts (intermediate tool calls, partial outputs) go to `workingDir/` which the daemon clears between attempts. Capability handles are scoped per the Harness's manifest — the daemon enforces the allow-list, the Harness sees only the surface area its manifest declared.

This shape is unchanged from today's `RestorationContext` modulo the field renames in §11.4 — the rename is mechanical, not architectural.

### 7.3 Selection (registry resolution)

The registry resolves a Harness for a Task by:

1. **`config.harnesses.bySolverType[task.spec.type]`** — explicit per-SolverType binding wins. Used by operators who want a Path 2 specialist for a specific SolverType.
2. **Default Harness** — `claude-code-learner`. Claims any non-evaluation Task that wasn't routed to a specialist.
3. **Disabled list** — `config.harnesses.disabled[]` excludes a Harness from selection regardless.

**The wrapper is gone.** `wrapWith` config and `DEFAULT_WRAP_WITH` are removed. The first-match-wrapper-with-specialist construct in `wrapper.ts` is deleted.

### 7.4 Plugin-awareness

A Harness declares plugin-awareness in its package metadata:

```jsonc
{
  "name": "@jinn-network/claude-code-learner",
  "jinn": {
    "kind": "harness",
    "pluginAware": true,
    "pluginLoader": "./dist/plugin-loader.js"
  }
}
```

A plugin-aware Harness loads the operator's installed SolverPlugins at session-start via its declared plugin-loader. A plugin-unaware Harness ignores plugins entirely — the substrate is invisible to it. Both shapes are first-class.

### 7.5 The default learner under this model

`claude-code-learner` is a plugin-aware Harness. It runs the seven-phase pipeline (per `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`) end-to-end — the pipeline (orient → strategize → plan → execute → debrief → improve → memory-consolidation) is **the Harness's flow, not the SolverPlugin's**. The plugin-loader registers the operator's installed plugins' tools and skills so the pipeline's agents can use them, and exposes the Type-defining plugin's schemas for Task / Solution validation.

Without any plugin matching the Task's SolverType, the learner runs vanilla — the seven-phase pipeline still executes, just without SolverType-specific tools, skills, or schema validation.

The improve phase mutates `implStateDir/`. The mutation surfaces are:
- **`implStateDir/skills/<name>/SKILL.md`** — operator-learned skills. Loaded alongside plugin-shipped skills; on name collision, operator-learned wins (override semantics below).
- **`implStateDir/agents/<name>.md`** — operator-learned agents. Same override semantics.
- **`implStateDir/tunables/<tunable>.json`** — operator-learned values for *Harness-declared* tunables (the learner declares its own knobs — calibration aggressiveness, ensemble size for its own ensemble step, corpus-lookup top-k, etc.). Tunables are a Harness contract, not a plugin contract; alternative Harnesses define different tunables relevant to their own pipelines.
- **`implStateDir/configs/<name>.json`** — operator-learned config overrides.

**Override semantics:** at session-start the plugin-loader registers plugin-shipped skills first, then operator-learned skills; on name collision (`forecasting-techniques` shipped by a plugin vs. `forecasting-techniques` written by the operator's promoter into `implStateDir/skills/`), the operator-learned skill wins. The plugin-shipped skill remains on disk for inspection / `git diff` purposes; it is just not loaded into the runtime when an override exists. Clean separation: "from the plugin" (read-only, inspectable) vs. "operator-learned" (loaded, mutable).

### 7.6 The plugin-loader (implementation detail)

A plugin-loader is a per-Harness module that reads installed SolverPlugins at session-start and emits whatever the Harness needs. Not a top-level architectural primitive — it's the code each plugin-aware Harness ships internally to consume the (harness-agnostic) plugin format.

Contract:

```ts
export interface PluginLoader {
  /** The Harness package this loader targets. */
  readonly harness: string;

  /**
   * Read installed SolverPlugins and emit the harness-specific runtime artifacts.
   * Called once per session-start.
   */
  loadPlugins(input: {
    plugins: SolverPluginManifest[];
    implStateDir: string;
    activeSolverType: string;
  }): Promise<HarnessRuntimeArtifacts>;
}
```

`HarnessRuntimeArtifacts` is harness-shaped. For `claude-code-learner`:

```ts
export interface ClaudeCodeLearnerArtifacts {
  registeredSkills: Array<{ name: string; path: string }>;          // mounted into the harness's skill registry
  mcpServerSpawns: Array<{ name: string; entry: string }>;
  schemas: { task?: object; solution?: object; verdict?: object };  // for input/output validation
}
```

V1 ships exactly one plugin-loader: `claude-code-learner`'s. It lives in `client/src/harnesses/claude-code-learner/plugin-loader.ts`. The loader:

1. Reads each plugin's standard plugin fields (`mcpServers`, `skills`) and `jinn.schemas` if present.
2. Filters by `jinn.supportsSolverTypes` against the active SolverType (plugins with empty / missing `supportsSolverTypes` apply universally).
3. Spawns each surviving plugin's `mcpServers[]` entries and registers their tools with the Harness's MCP client.
4. Mounts each surviving plugin's `skills[]` entries into the Harness's skill registry.
5. Selects schemas from the Type-defining plugin (the one with `jinn.schemas`) and exposes them for Task / Solution validation. If no Type-defining plugin is installed for the active SolverType, the loader returns empty schemas and the learner's `canAttempt` may refuse based on its own policy.
6. Does **not** synthesize phase agents from any plugin content — the Harness owns its flow.

Alternative-Harness plugin-loaders (Pi.dev / Codex / Gemini-CLI ports) are out of scope for v1 — they appear when those Harnesses do.

---

## 8. Trust boundaries

The reframe gives three named surfaces with clear ownership:

| Surface | Owner | Mutability | How signed |
|---|---|---|---|
| SolverPlugin content (manifest + schemas + tools + skills) | Plugin author | Read-only at runtime | Plugin-marketplace publish / npm publish + (Phase B) signed manifest per `spec/2026-05-executor-trust-boundary.md` |
| Harness code (and its declared tunables list) | Harness author | Read-only at runtime | npm publish + Path 2 manifest signing per existing trust-boundary spec |
| Operator state (`implStateDir/`, including tunable *values*) | Operator | Mutable by Harness's improve phase | Git-history within the operator's local implStateDir; no external attestation |

This resolves the `jinn-mono-dwqm` contradiction directly: there is no "signed code that learns at runtime." Signed code (Harness, plugin) doesn't mutate. Operator state mutates. The improve phase's action surface is bounded to operator state.

A Path 2 specialist that doesn't want to use plugins continues to be signed-and-immutable. A Path 2 specialist that wants learning either templates the learner or implements its own learning loop — its choice. Neither path requires the network to relax the signature on its code.

---

## 9. Three layers of compounding (restated against the model)

Per #59 §1, "two layers of compounding: corpus-level and harness-level." Under this model the picture is:

1. **Per-operator (harness-level)** — operator's implStateDir mutates run over run. The improve phase is bounded to operator-state surfaces (§7.5). Compounds within one operator's deployment.
2. **Network (corpus-level)** — trajectories land in the corpus library (Phase A.1). All Harnesses can read the corpus during orient/debrief. Compounds across operators.
3. **Author-mediated (plugin-level)** — plugin authors observe trajectories, ship new plugin versions. Operators upgrade via `yarn upgrade @jinn-network/prediction-plugin`. Compounds across the SolverNet.

The 26-week reversion threshold from #57 §5 reads (1)+(2)+(3) together: if Brier-spread doesn't trend positive, *one of these three layers is failing to compound*. The dashboard tells us which.

---

## 10. The Prediction SolverNet (v1 worked example)

| Component | Concrete |
|---|---|
| Name | `Prediction` |
| SolverType | `prediction.v0` (defined by the Type-defining plugin's `jinn.schemas`) |
| SolverPlugin | `@jinn-network/prediction-plugin`, lives at `client/plugins/jinn-prediction-plugin/` |
| Objective | Brier-spread vs. Polymarket consensus, rolling 84-day window, lower-is-better (#57 §5) |
| Task generator | Polymarket-derived auto-poster (Phase A.3 — separate plan) |
| Starting Harness | `claude-code-learner` (the bundled default) |
| Public dashboard | `https://jinn.network/solvernets/prediction` (separate plan) |

**Out-of-the-box state for a default operator:**

The daemon installs the prediction plugin, the learner becomes the Harness for `prediction.v0`, the creator loop posts Polymarket-derived Tasks, the loop runs end-to-end. No additional configuration needed.

**v1 contents of `@jinn-network/prediction-plugin`:**

- `schemas/{task,solution,verdict}.json` published — Type-defining plugin.
  - `task.json`: requires `type: "prediction.v0"`, `predicate`, `resolutionMarket`, `resolutionTime`, `resolutionSource`.
  - `solution.json`: requires `probability ∈ [0,1]`; optional `confidence`, `reasoningCid`, `evidenceCids`, `methodology`.
  - `verdict.json`: `resolved: bool`, optional `outcome ∈ {YES,NO,INVALID}`, `brierScore ∈ [0,1]`.
- `mcp-servers/polymarket-api/` ships and tests pass against the live Polymarket API on testnet. Provides `market_state`, `resolution`, `recent_volume`, `resolution_rule` tools.
- `skills/` populated with at least: `forecasting-techniques`, `calibration-approaches`, `base-rates`, `common-biases`, `polymarket-specifics`. Each skill is a markdown file with frontmatter — domain knowledge embedded as instruction, consumable by any Claude Code-shaped Harness.
- `jinn.supportsSolverTypes: ["prediction.v0"]` and `jinn.schemas` populated.
- The learner's plugin-loader registers all skills, spawns all MCP servers, and exposes schemas at session-start with no errors against this plugin.
- An end-to-end e2e test posts a fake `prediction.v0` Task on Anvil and asserts the learner produces a `Solution.solutionPayload` validated against the plugin's solution schema.

**What is NOT in the v1 plugin** (lives elsewhere):

- The seven-phase flow → owned by `claude-code-learner` (its existing pipeline; uses plugin tools and skills as resources).
- Calibration / ensemble / corpus-lookup tunables → owned by `claude-code-learner` and declared in its own manifest, populated with operator-learned values under `implStateDir/tunables/` over time.
- The Objective and Task generator → declared in the SolverNet config (§4 / §11.8).

---

## 11. Migration from current state

### 11.1 Wrapper deletion

- Delete `client/src/restorer/impls/claude-code-learner/wrapper.ts`.
- Delete `synthesizeExecuteSummaryFromSpecialist` (no longer needed — specialists run alone, write their own outputs directly).
- Remove `DEFAULT_WRAP_WITH = 'claude-code-learner'` from `intent-registry-access.ts`.
- Remove `wrapWith` from `JinnConfig.restorers`.
- Remove `resolveEffectiveWrapWith` and call sites.
- Remove the `wrapWith` registry construction option in `RestorerImplRegistry`.

### 11.2 RestorerImpl → Harness rename + Restorer → Solver role rename

- Move `client/src/restorer/types.ts` → `client/src/harnesses/types.ts`. Type rename.
- Rename `client/src/restorer/` → `client/src/harnesses/`. Update all imports (~ a few dozen call sites; mechanical).
- Rename `JinnConfig.restorers` → `JinnConfig.harnesses` (config-file migration helper writes a one-time conversion).
- Rename `@jinn-network/restorer-sdk` → `@jinn-network/harness-sdk`. Dual-publish for 12 weeks; the old package re-exports from the new with a deprecation `console.warn`.
- Update prose / comment / docstring usages of "Restorer" (the protocol role) to "Solver." Examples: `client/src/daemon/daemon.ts` orchestration comments, JSDoc on the Harness interface, README content.
- Update `BRAND.md` / `SPEC.md` / `GLOSSARY.md` cross-references in a follow-up canonical-doc PR (separate from this spec's merge — canonical docs change via approved PRs per `spec/2026-04-28-canonical-docs.md`).
- **Deployed contract identifiers stay:** `JinnRouter.createRestorationJob`, `RestorationActivityChecker`, the `restorationPayload` envelope field, ABI artifacts, etc. Renaming these forces a redeployment + migration. Future contract revisions may rename; this spec doesn't.
- Closes `jinn-mono-juw` / GH#43.

### 11.3 Output / context renames

- `RestorationOutput → Solution`.
- `restorationPayload → solutionPayload`.
- `RestorationContext → HarnessContext`.
- All field-level usages updated. Field renames in tests + e2e accordingly.

### 11.4 Task / spec field renames

- `RestorationJob → Task` (the on-chain object's TypeScript name).
- `intentCid → specCid` on the Task struct + ABIs.
- `spec.kind → spec.type` in the IPFS-stored spec format (carries the SolverType identifier).
- `spec.type: 'restoration' | 'evaluation'` → `spec.role: 'restoration' | 'evaluation'`. Avoids collision with the renamed SolverType-identifier field.
- `byKind → bySolverType` in operator config.
- `supportedKinds → supportedSolverTypes` in Path 2 Harness manifests.

The schema-versioning grammar in `spec/2026-05-schema-versioning.md` continues to apply — only the field name changes; values like `'prediction.v0'` are unchanged.

### 11.5 SolverType modules → Type-defining plugin

The existing `client/src/intents/kinds/<kind>/` modules contain Zod schemas + TypeScript types for first-party SolverTypes. Under the in-plugin-schemas model:

- The JSON Schemas migrate to `client/plugins/jinn-prediction-plugin/schemas/{task,solution,verdict}.json` (and similarly for `prediction.apy.v0`, `portfolio.v0` when their plugins are written).
- TypeScript-typed access for in-repo callers happens via a thin adapter that imports the plugin's JSON Schema and runs JSON-Schema-to-TS at build time (e.g., `json-schema-to-typescript`), or via a hand-maintained Zod schema in the plugin itself that re-exports both.
- The directory `client/src/intents/kinds/` is renamed to `client/src/solver-types/` and contains *adapter* modules only — no canonical schema content. Once all first-party SolverTypes have plugins, the directory may collapse entirely (TBD; see §13 open question 5).

The auto-poster wiring in `client/src/intents/kinds/index.ts` (`SPEC_KINDS`, `getTestnetAutoConfig`, `collectTestnetAutoIntentGenerators`) moves to `client/src/solver-types/index.ts` with the same shape, just imports updated.

### 11.6 SolverPlugin mechanism

- New module: `client/src/plugins/`.
  - `resolvers/` — multi-format resolvers: `npm.ts`, `cc-marketplace.ts`, `git.ts`, `local.ts`, (Phase B+) `ipfs.ts`. Each resolver takes a spec string, fetches the package, and returns a normalized `SolverPluginManifest` regardless of which host-format (Claude Code plugin / Gemini extension / standalone) the package uses.
  - `loader.ts` — reads `config.solverPlugins[]`, calls the appropriate resolver, validates the `jinn.*` extension, hash-checks Type-defining schema conflicts, builds an in-memory `SolverPluginRegistry`.
  - `loader-registry.ts` — registry of installed plugin-loaders keyed by Harness name.
  - `types.ts` — `SolverPluginManifest`, `PluginLoader`, `HarnessRuntimeArtifacts`.
  - `cli.ts` — `jinn plugins list / add / remove / show`.
- Daemon `main.ts` initialises the SolverPluginRegistry before constructing the Harness registry; plugin-aware Harnesses receive their plugin-loader handle in their constructor env.
- `@jinn-network/prediction-plugin` ships at `client/plugins/jinn-prediction-plugin/` as the first concrete plugin — a Claude Code plugin with the `jinn` extension populated per §5.2.
- The `claude-code-learner` plugin-loader ships at `client/src/harnesses/claude-code-learner/plugin-loader.ts`. It registers plugins' standard plugin `mcpServers` and `skills` into the learner's runtime, exposes the Type-defining plugin's schemas for input/output validation, and does *not* synthesize phase agents — the learner owns its flow.

### 11.7 Path 1 retirement

The slot taxonomy from `spec/2026-04-30-plug-in-surface.md` §4.2 (phase-agent-override / topic-explorer / mcp-tool / skill-bundle / memory-backend / hook / bundle) is **retired**. Recruits who would have shipped Path 1 plug-ins now pick one of:

- **Ship a SolverPlugin** — for substrate that is genuinely SolverType-specific and harness-agnostic (schemas, MCP tool servers, skills with embedded domain knowledge).
- **Fork the learner** — for harness-specific extensions (a custom planner agent, a specialised step-worker). The learner is open-source; forking is a recruit-friendly path for skill / agent / memory-backend authors who want to ship something claude-code-learner-shaped without the network needing a per-harness slot taxonomy.
- **Ship a Harness** (Path 2 — unchanged) — for builders with a working monolith.

The cost of retirement is real: phase-agent-overrides and skill-bundles were the lowest-friction recruit shape in the prior spec. The benefit is that the substrate is now portable across Harnesses (and reusable as Claude Code plugins outside Jinn entirely), which is what the Phase A.2 ambition required all along.

`spec/2026-04-30-plug-in-surface.md` §4 (Path 1) is marked superseded by this spec. The §3 Path 2 commitments (SDK, scaffolding, worked examples) hold under the renames.

### 11.8 Specialists currently in-tree

| Today | Disposition |
|---|---|
| `claude-code-learner` (with wrapper) | Wrapper deleted; learner is now a peer Harness, default in registry. |
| `prediction-v0-baseline` | Moves to `examples/external-harnesses/prediction-v0-baseline/`. Becomes the worked-example "Harness without plugins" — a Path 2 monolith that ignores plugins. Operators who want it register via `bySolverType`. Remains compiled in CI as an example. |
| `prediction-apy-v0-baseline` | Same disposition as `prediction-v0-baseline`. |
| `claude-mcp-hyperliquid` | Stays in-tree as a default-disabled Path 2 specialist (existing behaviour); not plugin-aware; portfolio.v0 plugin is a future bead. |
| `claude-mcp-prediction` / `claude-mcp-prediction-apy` | Stay in-tree for now; revisit once `@jinn-network/prediction-plugin` is producing comparable or better results. Candidates for the same disposition as the baselines. |
| `legacy-claude` | Stays as an unrelated Harness; not plugin-aware; not affected by this spec. |
| `*-evaluator` impls | All evaluator Harnesses stay in-tree. Evaluation is deterministic per SolverType; plugins do not currently provide evaluator substrate. (Evaluator plugins are a future-bead question.) |

### 11.9 Default config for new operators

```jsonc
{
  "harnesses": {
    "bySolverType": {},
    "disabled": []
  },
  "solverPlugins": [
    "@jinn-network/prediction-plugin"
  ],
  "solverNets": [
    {
      "name": "Prediction",
      "solverType": "prediction.v0",
      "objective": {
        "scalar": "brier-spread-vs-polymarket",
        "polarity": "lower-is-better",
        "rollingWindowDays": 84
      },
      "taskGenerator": "polymarket-derived-auto-poster",
      "startingPlugin": "@jinn-network/prediction-plugin",
      "startingHarness": "claude-code-learner"
    }
  ]
}
```

Existing operators on testnet receive a one-time config-migration prompt at daemon start (`jinn migrate-config`) that produces the above shape.

---

## 12. What we're explicitly deferring

- **Tight Task-plugin association on-chain.** A Task does not currently reference a recommended plugin. v1 is loose-association: operator config maps SolverTypes to plugins. Tight association (e.g., a `recommendedPluginCid` field on the Task) is Phase B+.
- **An on-chain SolverPlugin registry.** Distribution is npm / marketplace / git / IPFS in v1. A curated marketplace and on-chain pinning are Phase 2+.
- **Cross-plugin dependencies.** A plugin does not declare it depends on another plugin. If a future plugin genuinely needs another's MCP tools, the recommendation is to vendor or to ship a single bundled plugin.
- **Hot reload.** Plugins and Harnesses load once per process, consistent with Path 2's existing once-per-process lifecycle.
- **Plugin content signing.** v1 trusts npm publish + operator vouch-by-install. Path 2-shaped manifest signing extended to plugins is a follow-up bead.
- **Tunable-mutation policy.** v1 lets the Harness's improve phase write any Harness-declared tunable. Per-tunable policy (rate limits, validation, attestation) is Phase B+.
- **Author-mediated improvement velocity.** This spec assumes plugin authors observe trajectories and ship new versions on their own cadence. Tooling for "publish a new plugin version from operator-trajectory data" is out of scope.
- **Evaluator plugins.** Today evaluators are deterministic and don't need substrate. If a future evaluator wants knowledge or tools (e.g., a probabilistic verifier), the same plugin mechanism applies — no architecture change needed.

---

## 13. Open questions

1. **Should the default config silently install `@jinn-network/prediction-plugin`, or surface a one-line consent prompt at first boot?** Lean: silent install for new operators; one-line prompt on `jinn migrate-config` for existing operators.
2. **Where do Harness-declared tunables live?** Each Harness declares its own tunables (calibration aggressiveness, ensemble size, corpus-lookup top-k for the learner). Format: in the Harness's `package.json` `jinn` field? In a separate `harness.tunables.json`? Lean: in the Harness's `package.json` `jinn.tunables[]` array. Keeps the declaration close to the code that reads them.
3. **Should the `claude-code-learner` plugin-loader cache its registration work by `(pluginVersion, pluginContentHash)`?** Lean: yes for performance; with a `--no-cache` daemon flag for debugging.
4. **Path 2 builders losing the slot ergonomics — is "fork the learner" actually a viable recruit path?** This is the most genuine concern of the Path 1 retirement. Mitigation: the learner repo includes a `learner-template/` directory with a stripped-down skeleton; the recruit story becomes "fork the template, swap your specialist code in, optionally re-use the same `@jinn-network/harness-sdk` SDK." If recruits report this is too high-friction, Phase A.4 retro re-opens the slot taxonomy as a follow-up.
5. **What's left in `client/src/solver-types/` after schemas move into plugins?** The directory currently holds Zod schemas + TS types + auto-poster wiring. Schemas move to plugins; auto-poster wiring stays. Open: do TypeScript adapters that derive types from plugin JSON Schemas at build time live there, or directly import from the plugin? Lean: thin adapter modules in `client/src/solver-types/` that re-export plugin schemas as Zod for ergonomic in-repo usage. Drop the directory entirely if/when no first-party in-repo callers need TypeScript types separately from the plugin.
6. **Should evaluator Harnesses also be plugin-aware?** Today evaluators are deterministic and don't need substrate. If a future evaluator wants knowledge or tools, the same plugin mechanism applies — no architecture change needed.
7. **Should `solverNets[]` config be operator-side declarative as shown in §11.9, or should SolverNet definitions ship as their own npm packages (e.g., `@jinn-network/prediction-solvernet`) that bundle objective + Task-generator config + plugin reference together?** Lean: operator-side config in v1 (simpler); promote to dedicated SolverNet packages if multiple SolverNets ship and the bundling reduces operator burden.
8. **Solver as a noun in code.** The vocabulary uses "Solver" informally for an operator running a Harness. Should this surface in code (e.g., a `Solver` class composing `Harness` + identity), or stay purely a prose-level term? Lean: prose-only in v1; the operator entity is already represented by the Safe + Harness pair, no need for a new class.
9. **Cross-host plugin-format mapping.** Claude Code uses `.claude-plugin/plugin.json`; Gemini uses `gemini-extension.json`; Codex has its own. The shapes are similar but field names differ. The plugin-loader should accept any of these as host-shape and read its `jinn` extension uniformly. v1 commits to: a plugin ships *one* canonical host-shape (Claude Code plugin in v1, since that's what Jinn's daemon spawns); other hosts can read the same package via field-mapping shims. A formal multi-host manifest spec (single plugin manifest renderable into N host shapes) is a follow-up bead if we ship a Gemini-CLI Harness and discover the shim is too lossy.

---

## 14. Acceptance criteria

This spec is accepted when:

1. **Merged under `spec/`.**
2. **Cross-references added** to the sibling specs (§ lineage list) and to `spec/2026-04-30-plug-in-surface.md` marking §4 (Path 1) superseded.
3. **`@jinn-network/harness-sdk` v1.0.0 published** (renamed from `restorer-sdk`); 12-week dual-publish window declared.
4. **Wrapper code deleted** per §11.1.
5. **Rename PR merged** per §11.2 + §11.3 + §11.4; `jinn-mono-juw` / GH#43 closed.
6. **`client/src/plugins/` module shipped** with loader, loader-registry, CLI, and unit tests.
7. **`claude-code-learner` plugin-loader shipped** under `client/src/harnesses/claude-code-learner/plugin-loader.ts`.
8. **`@jinn-network/prediction-plugin` v0.1.0 shipped** at `client/plugins/jinn-prediction-plugin/` with the §10 contents — schemas + tools + skills + `jinn` extension — and passing CI.
9. **e2e validation** — the existing `yarn e2e` script extended to assert: prediction plugin loads, plugin-loader registers skills/MCP servers/schemas, the learner produces a schema-valid `solutionPayload` against an Anvil-posted `prediction.v0` Task.
10. **Specialists re-disposed** per §11.8; `examples/external-harnesses/` directory created.
11. **Default config updated** per §11.9; `jinn migrate-config` verb shipped.
12. **In-repo SolverType modules migrated** per §11.5 (schemas live in the plugin; in-repo holds adapter / auto-poster wiring only).

The campaign-launch gate (#57 §1) is *not* acceptance for this spec — it is acceptance for Phase A.4. This spec ships the architecture that makes the campaign run.

---

*End of v0.5.*
