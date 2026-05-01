# SolverNet architecture — Harness, Pack, and Task semantics

- **Date:** 2026-05-01
- **Author:** opus (drafted on jinn-mono-dwqm; Captain ritsukai)
- **Status:** Proposal
- **Version:** 0.4
- **Tracks:** Phase A.2 reframe — supersedes the wrapper-with-specialist construct introduced in PR #63; replaces `spec/2026-04-30-plug-in-surface.md` Path 1 with a harness-agnostic Pack mechanism.

**Sibling specs (load-bearing pre-reads):**

- `spec/2026-04-28-restorer-architecture.md` — ADR: specialists-first; `claude-code-learner` is one impl among many. This spec re-aligns the implementation with the ADR after a drift in PR #63.
- `spec/2026-04-30-plug-in-surface.md` — the spec this one supersedes for Path 1. Path 2 commitments hold under the renames in §11.
- `spec/2026-05-external-restorer-impls.md` / `spec/2026-05-executor-trust-boundary.md` / `spec/2026-05-registry-discovery.md` / `spec/2026-05-schema-versioning.md` — Path 2 substrate. All five hold under the rename `RestorerImpl → Harness`.
- `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md` — the seven-phase pipeline. Stays as the bundled learner's internal architecture; the wrapper layer is removed.

**Discussion lineage:**

- [#57](https://github.com/Jinn-Network/mono/discussions/57) — Prediction SolverNet GTM. The "client as meta-harness" framing is *implemented as registry-default-Harness + pack-aware loading*, not as an every-Type wrapper.
- [#59](https://github.com/Jinn-Network/mono/discussions/59) — knowledge-market roadmap. The "harness-level compounding" claim is what the learner does end-to-end inside its own implStateDir; this spec resolves how that fits with peer Harnesses that don't learn.

**Bead lineage:**

- `jinn-mono-dwqm` — "Learning loop excludes Path 2 specialist behaviour." This spec resolves that bead by *removing the construct that created the problem* (the universal wrapper) rather than patching around it.
- `jinn-mono-juw` / GH#43 — `RestorerImpl → Harness` rename. Lands as part of this spec.

---

## 1. Purpose and scope

### 1.1 What this spec commits

Five coordinated architectural moves that re-align the implementation with what the Phase A.2 spec already said and what the original learner design intended:

1. **Delete the universal wrapper.** `claude-code-learner` becomes a peer Harness in the registry, not a substrate that wraps every Type. Its `supports()` returns `true` for any non-evaluation restoration; it is the registry's *default* when no other Harness claims a Type. It owns its `run()` end-to-end.
2. **Rename `RestorerImpl → Harness`.** The thing-an-operator-runs is a Harness. The Restorer remains a protocol role; the rename disambiguates role from implementation.
3. **Introduce Packs.** A Pack is a harness-agnostic bundle that supplies Type-specific *substrate* — the things you'd plug into your Harness to handle a SolverType: MCP-tool servers, skills, and (optionally) the schemas defining the Type. **A Pack is a superset of existing AI-tool plugin formats** (Claude Code's `.claude-plugin/plugin.json`, Gemini's `gemini-extension.json`) — a single artifact that's a Claude Code plugin, a Gemini extension, *and* a Jinn Pack at the same time, depending on which consumer reads it. Pack-loading is an internal Harness concern, not a top-level architectural primitive. **Packs do not dictate flow, knowledge, tunables, or recommended Harness** — those are Harness-owned (flow, tunables) or SolverNet-config-owned (defaults). Packs supply substrate; how it's used is up to the Harness.
4. **Introduce SolverNets and Tasks as distinct levels.** A SolverNet is the campaign / group / objective. A Task is one posted item — the on-chain unit a Solver claims and produces a Solution for. The SolverNet declares one Type and ships one Pack; many Tasks of that Type flow through it.
5. **Ship the Prediction SolverNet as the first instance.** `jinn-prediction-pack` ships in-repo, on by default for new operators. The default Harness (the learner) + Prediction Pack combination is what the GTM in #57 calls the "client as meta-harness" running against the Polymarket-derived Task stream.

### 1.2 In scope

- The Pack manifest schema and content layout.
- The Harness interface (renamed from `RestorerImpl`) and its pack-loader.
- The Task vocabulary (renamed from `intent` / `RestorationJob`).
- The Solution / Verdict output vocabulary (renamed from `RestorationOutput`).
- Registry resolution rules (`byType` + default; Path 2 trumps default).
- The `jinn-prediction-pack` content for v1 of the Prediction SolverNet.
- Migration of `prediction-v0-baseline` and the wrapper code paths.
- Trust-boundary disposition (Pack content vs. Harness code vs. operator state).
- The "SolverNet" composition pattern (Type + Pack + Task generator + Objective + recommended Harness).

### 1.3 Out of scope

- Implementation of the rename PR itself (the renames are *committed* here; mechanical execution lives in follow-up beads).
- Per-component royalty / pricing / DRM (continues to be off the roadmap per DR-2026-04-30).
- Multi-evaluator consensus mechanics (Phase B).
- Hot-reload of Packs or Harnesses inside a running daemon (Phase 2+; consistent with `2026-05-external-restorer-impls.md` §3.4).
- An on-chain Pack registry (Phase 2+; analogous to the impl-registry deferral).
- Tight coupling of Task-on-chain to a recommended Pack CID (loose-association in v1; tight is Phase B+).
- Path 1 in its previous form. The phase-agent-override / topic-explorer / hook / memory-backend slot taxonomy from `spec/2026-04-30-plug-in-surface.md` §4.2 is *retired* in favour of the Pack mechanism. Path 1's recruit story becomes "ship a Pack" (harness-agnostic) or "fork the learner template" (harness-specific). See §11.5.

### 1.4 Non-goals

- This spec does not commit a marketplace.
- This spec does not redefine the protocol layer. JinnRouter, IdentityRegistry, ValidationRegistry, ReputationRegistry, ClaimRegistry, x402, ERC-8004 — all unchanged in shape; only the on-chain field name `kind` becomes `type` per §11.4.
- This spec does not define a new Harness alongside `claude-code-learner`. Alternative Harnesses (Pi.dev / Codex / Gemini-CLI ports) are recruit targets — they ship their own pack-loaders when they appear.

---

## 2. Glossary

| Term | Definition |
|---|---|
| **SolverNet** | A composition: (Type + Pack + Task generator + Objective + recommended Harness). The campaign / group level. The Prediction SolverNet is the first instance. Defined in operator config and reference in-repo; not a protocol object. |
| **Objective** | The public scalar a SolverNet rallies around. For the Prediction SolverNet: spread vs. Polymarket consensus. Trend matters more than level (#57 §5). |
| **Type** | The schema-versioned shape a Task's spec conforms to. Examples today: `prediction.v0`, `prediction.apy.v0`, `portfolio.v0`. Grammar per `spec/2026-05-schema-versioning.md`. The SolverNet declares one Type; Tasks identify their SolverNet by carrying that Type. |
| **Pack** | A harness-agnostic package supplying Type-specific *substrate* — MCP servers + skills + (optionally) schemas — that an operator plugs into their Harness to handle a SolverType. Manifested as an extension of an existing AI-tool plugin format (Claude Code plugin / Gemini extension / standalone) with a minimal `jinn` field. Read-only at runtime. Distributable via npm, plugin marketplace, git release, or IPFS. |
| **Task** | The on-chain posted item. Today: `JinnRouter.createRestorationJob`'s product. Carries a `specCid` referencing the IPFS-stored spec. The Solver claims a Task, runs the Pack's flow, and submits a Solution. |
| **Solution** | The Solver's output for a Task. The thing today called `RestorationOutput`. Validated against the Pack's solution schema before envelope assembly. |
| **Verdict** | The Evaluator's output scoring a Solution. Carries a `verdictPayload` (kept; protocol-level field). |
| **Harness** | The runtime an operator runs to claim and solve Tasks. The thing today called `RestorerImpl`. Implements the Restorer protocol role. May or may not be pack-aware; may or may not learn. |
| **HarnessContext** | The runtime context the Harness's `run()` receives. Today: `RestorationContext`. |
| **Solver** | An operator running a Harness in a SolverNet. Informal — used as a noun in protocol-adjacent prose (#57 / #59 vocabulary). The on-chain Restorer role is what the Solver fulfils. |
| **Tunable** | A pack-declared mutable surface that an operator's Harness is allowed to update during the improve phase. Pack signs the *list* of tunables; pack does not sign their values. |
| **Restorer** | A protocol role (Creator / Restorer / Evaluator). Unchanged. A Restorer runs *a Harness*. |

---

## 3. First-principles model

Two levels with distinct concerns, four primitives total:

```
─── Level 1 (group / persistent definition) ────────────────────────────────
     SolverNet (operator config + reference in-repo)
       ├── name
       ├── type             → schema-versioned identifier (prediction.v0)
       ├── objective        → public scalar + aggregation rule
       ├── taskGenerator    → posts Tasks on a cadence (optional)
       ├── defaultPack      → recommended Pack for new operators (swappable)
       └── defaultHarness   → recommended Harness for new operators (swappable)

─── Level 2 (per-item / ephemeral) ──────────────────────────────────────────
     Task (one per posted item; many per SolverNet)
       ├── on-chain         → JinnRouter object with escrow + eligibility
       └── spec (IPFS)      → type + per-Task fields (predicate, window, ...)

       Solver claims Task → Harness runs → Solution submitted
       Evaluator scores Solution → Verdict produced
       Verdict's score contributes to SolverNet's Objective

─── Operator-installed primitives (the things that make a SolverNet runnable) ─
     Pack (plugin-format package; one or more per Type)
       ├── jinn.supportsTypes
       ├── jinn.schemas (if Type-defining)
       ├── mcpServers (host plugin field)
       └── skills (host plugin field; knowledge embedded as skill content)

     Harness (npm package)
       ├── owns flow + improve-phase + tunables (Harness-internal)
       └── consumes installed Packs at session-start
```

- **Level 1 is persistent.** A SolverNet is defined once and runs continuously. Its Type and Objective don't change between Tasks; its scalar accumulates as Tasks resolve.
- **Level 2 is ephemeral.** Each Task is posted, claimed, solved, scored, settled, indexed. Each one moves the Objective by 1/N.
- **The join key is Type.** On-chain a Task carries its Type identifier; operator-side a SolverNet declares which Type it coordinates around; Packs declare which Types they provide substrate for. JinnRouter (protocol) only knows about Types; SolverNet is operator/config-level coordination.
- **Pack and Harness are independent.** A Pack ships substrate (tools + skills + optional schemas) for a Type. A Harness owns the runtime (flow, improve-phase, tunables) and consumes whatever Packs are installed. Neither dictates the other; the SolverNet's defaults are starting points, not bindings.

The clean separation: **SolverType supplies *what shape* (via a Type-defining Pack's schemas); Pack supplies *what tools / skills are useful*; Harness supplies *how to actually run it*; SolverNet supplies *what we're trying to improve*; Task supplies *the specific thing to solve right now*.**

---

## 4. The SolverNet

### 4.1 Definition

A SolverNet is a composition pattern declared in operator config and (for first-party SolverNets) defined as a reference in-repo:

```jsonc
{
  "name": "Prediction",
  "type": "prediction.v0",
  "pack": "@jinn-network/prediction-pack",
  "objective": {
    "scalar": "brier-spread-vs-polymarket",
    "polarity": "lower-is-better",
    "rollingWindowDays": 84
  },
  "taskGenerator": "polymarket-derived-auto-poster",
  "recommendedHarness": "claude-code-learner",
  "publicDashboard": "https://jinn.network/solvernets/prediction"
}
```

A SolverNet is **not a protocol object**. JinnRouter doesn't know about SolverNets; it knows about Tasks with Types. The SolverNet is operator-side coordination — the way a daemon decides "which Pack to load when a Task with `type: 'prediction.v0'` arrives," and the way the network publicly rallies around an Objective.

### 4.2 What a SolverNet declares

| Field | Purpose |
|---|---|
| `name` | Human-readable label. Used for dashboards, prose, and the `<name> SolverNet` proper-noun in docs. |
| `type` | The schema-versioned Type the SolverNet owns. Per `2026-05-schema-versioning.md`. |
| `pack` | The npm package providing the Type's Pack. The daemon ensures it's installed at boot. |
| `objective` | The public scalar definition: how to compute it, polarity, rolling window. Used by the dashboard and (eventually) by Solvers' improve phases as the meta-feedback signal. |
| `taskGenerator` | The auto-poster (today: `creator.ts` + `getTestnetAutoConfig`). For the Prediction SolverNet this becomes the Polymarket-derived poster. Optional — operators can disable to consume Tasks posted by others without contributing to creation. |
| `recommendedHarness` | Informational. Operators may pick another Harness via `byType` config. |
| `publicDashboard` | Informational. Where the rolling Objective trend is rendered. |

### 4.3 Multiple SolverNets per daemon

A daemon can run more than one SolverNet at a time — e.g., Prediction + Portfolio. Each SolverNet declares its own Type; the daemon's registry routes incoming Tasks by Type to the correct Pack + Harness. SolverNets do not compete inside one daemon; they coexist. Cross-SolverNet selection ("which SolverNet should this generic Task go to?") is not a protocol concern — Tasks identify their SolverNet by Type.

---

## 5. The Pack

### 5.1 What a Pack is — and isn't

A Pack is **what an operator plugs into their Harness to handle a particular SolverType**. It is *substrate* — tools, skills, optionally schemas. It does not prescribe how to use them.

Concretely, a Pack contains:

- **MCP-tool servers** — process-based tools any MCP-aware Harness can spawn.
- **Skills** — markdown files with frontmatter that pack-aware Harnesses register (in Claude Code / Gemini, this means the host plugin format's standard `skills` field). Knowledge files (forecasting techniques, calibration approaches, etc.) are shipped as skills — there's no separate "knowledge" concept.
- **Schemas (optional)** — JSON Schemas for the Type's Task / Solution / Verdict shapes. A Pack that ships schemas is *Type-defining*; one that omits them is *tools-only* (see §5.3).

A Pack does NOT contain:

- **Flow** — the Harness owns the pipeline. Mandating flow at the Pack level would prescribe how to solve, contradicting the SolverNet's purpose of discovering what works.
- **Tunables** — the Harness owns its improve-phase contract; Tunables describe what the *Harness* mutates, not what the Pack ships.
- **Recommended Harness** — Pack is harness-neutral. The SolverNet's operator config carries a default Harness for ergonomics; the Pack itself doesn't bind to one.

This makes the `jinn` extension on a Pack manifest **two fields total**: `supportsTypes` and (optionally) `schemas`.

### 5.2 Format — extension of existing AI-tool plugin manifests

A Pack is a superset of existing AI-tool plugin formats (Claude Code's `.claude-plugin/plugin.json`, Gemini's `gemini-extension.json`) with a minimal `jinn` field carrying the SolverType-specific extension. **Same artifact, multiple consumers** — Claude Code and Gemini consume the standard plugin fields; the Jinn daemon's pack-aware Harnesses additionally consume the `jinn.*` fields. Other plugin hosts ignore `jinn.*`.

This avoids fragmenting the AI-tool plugin ecosystem. Pack authors who already ship plugins extend with one field; new Pack authors get marketplace install UX, format documentation, and tooling for free.

The full Prediction Pack manifest:

```jsonc
// .claude-plugin/plugin.json (also valid as gemini-extension.json with field-name shim)
{
  "name": "@jinn-network/prediction-pack",
  "version": "0.1.0",
  "description": "Prediction SolverNet substrate — Polymarket-style binary forecasts.",

  // Standard plugin fields — Claude Code / Gemini both consume.
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

  // Jinn extension — minimal.
  "jinn": {
    "supportsTypes": ["prediction.v0"],
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
| `jinn.supportsTypes` | Per `spec/2026-05-schema-versioning.md` grammar. The Type identifiers this Pack supplies substrate for. The daemon's join key — match a Task's `spec.type` to a Pack via this field. |
| `jinn.schemas` (optional) | JSON Schemas defining the Type's payloads. **If present**, the Pack is *Type-defining*: it ships the canonical shape for `task`, `solution`, `verdict`. **If absent**, the Pack is *tools-only*: it adds MCP servers and skills atop a Type already defined elsewhere. See §5.3. |

That's the entire `jinn` surface. Two fields.

The standard plugin fields (`mcpServers`, `skills`, optionally `agents`, `hooks`, etc.) carry everything else. Pack authors who already ship Claude Code plugins add `jinn` and they're done.

The manifest is JSON-Schema validated at install time and at session start. Unknown `jinn.*` keys fail loud (forward-compat).

### 5.3 Type-defining vs. tools-only Packs; conflict resolution

`jinn.schemas` being optional creates two natural Pack roles:

| Role | Has `jinn.schemas` | Purpose |
|---|---|---|
| **Type-defining** | yes | Ships the canonical schemas + tools + skills for a Type. First-party example: `@jinn-network/prediction-pack`. |
| **Tools-only** | no | Adds substrate to a Type already defined by another Pack. Example: `@some-author/extra-polymarket-tools` extends prediction.v0 without redefining schemas. |

Multiple Packs can coexist for the same Type — typically one Type-defining Pack plus zero-or-more Tools-only Packs.

**Conflict resolution:** if two Packs both ship `jinn.schemas` for the same `supportsTypes` entry, the daemon SHA-256-compares the schema files at install time:

- **Identical** → both load.
- **Different** → install fails with a clear error pointing at the conflict (which file differs, which Pack the operator already had installed).
- **First-claim-wins:** the first Type-defining Pack registered for a Type effectively defines its canonical shape. Subsequent Type-defining Packs must match exactly.

This mirrors how npm package-name claiming works in practice: there's no central authority, but conflicts are surfaced at install time.

### 5.4 No-Pack-installed behaviour

If a Task arrives for a Type with no Pack installed:

- The daemon pulls the IPFS spec but cannot validate it (no schema).
- The Task is passed through to whichever Harness claims the Type. Harness decides whether to refuse (no schema → can't construct a valid Solution confidently) or proceed permissively.
- For first-party Types like `prediction.v0`, the default daemon ships the Type-defining Pack pre-installed, so this case is moot in practice.
- Permissionless operators introducing new Types ship a Type-defining Pack alongside the new Type's auto-poster.

### 5.5 Distribution and install

The Pack format is distribution-agnostic. The daemon's `jinn packs add` verb supports multiple resolvers:

```bash
# npm registry
jinn packs add @jinn-network/prediction-pack

# Claude Code plugin marketplace
jinn packs add cc:jinn-network/prediction-pack

# git release
jinn packs add github:jinn-network/prediction-pack@v0.1.0

# local path (development)
jinn packs add ./client/plugins/jinn-prediction-pack

# IPFS CID (Phase B+)
jinn packs add ipfs://bafy...
```

Each resolver fetches the package and validates:

1. Manifest parses (whichever of `.claude-plugin/plugin.json`, `gemini-extension.json`, or a standalone `jinn.pack.json` is present).
2. `jinn.supportsTypes` validates against the Type grammar.
3. If `jinn.schemas` present: paths exist, parse as JSON Schema, hash-compare against any other Type-defining Pack already installed for the same Type (§5.3).
4. Standard plugin fields parse against the host plugin schema (skills paths exist, MCP entries are well-formed, etc.).
5. Appends to `~/.jinn-client/config.json` under `packs[]`.

**Default operator config installs `@jinn-network/prediction-pack` automatically for new daemons** so the Prediction SolverNet works out of the box. Migration handling for existing operators: §11.7.

### 5.6 Versioning + compatibility

- **Pack content** (`@jinn-network/prediction-pack` itself) follows semver. Breaking changes to schemas bump the major; new tools / skills are minor; bug fixes are patches.
- **The `jinn` extension's own schema** follows semver with a 12-week deprecation window. v1 ships with two fields; minor adds (e.g., a future optional metadata field) won't break existing Packs.
- **Harness compatibility** is informal — Harness pack-loaders read whatever `jinn` fields they recognize and ignore unknown ones (forward-compat). A Harness that requires a future `jinn.*` field declares its minimum supported version in its own manifest and refuses to load Packs missing it.

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

The Task's spec is the JSON-stored description of *what* this specific Task is asking for. It carries a `type` field identifying the SolverNet, plus Type-specific fields validated against the Pack's `schemas.task`:

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

The Type field in the spec is the **join key** between protocol and operator-side. The daemon receives the Task, reads its spec from IPFS, looks up the SolverNet declaring `type: 'prediction.v0'`, loads that SolverNet's Pack, dispatches to that SolverNet's Harness.

### 6.3 What changes vs. today

Field renames only. The shape of the on-chain object and the IPFS-stored spec are otherwise unchanged. The protocol-level loop (Creator → Restorer → Evaluator) operates identically; we are renaming, not redesigning.

---

## 7. The Harness

### 7.1 Rename

`RestorerImpl → Harness`. The interface in `client/src/restorer/types.ts` is renamed; the directory `client/src/restorer/` is renamed to `client/src/harnesses/`; `RestorationContext → HarnessContext`; `RestorationOutput → Solution`; `restorationPayload → solutionPayload`. The Path 2 `@jinn-network/restorer-sdk` package is renamed to `@jinn-network/harness-sdk` with a 12-week dual-publish window.

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

**Field-name note:** the old shape was `{ kind: string; type?: 'restoration' | 'evaluation' }`. The rename `kind → type` would collide with the existing role field. Resolved by renaming `type → role` in the same pass — `'restoration' | 'evaluation'` is semantically a *role*, not a *type*, so the rename improves clarity. Migration mechanics: §11.4.

### 7.3 Selection (registry resolution)

The registry resolves a Harness for a Task by:

1. **`config.harnesses.byType[task.spec.type]`** — explicit per-Type binding wins. Used by operators who want a Path 2 specialist for a specific Type.
2. **Default Harness** — `claude-code-learner`. Claims any non-evaluation Task that wasn't routed to a specialist.
3. **Disabled list** — `config.harnesses.disabled[]` excludes a Harness from selection regardless.

**The wrapper is gone.** `wrapWith` config and `DEFAULT_WRAP_WITH` are removed. The first-match-wrapper-with-specialist construct in `wrapper.ts` is deleted.

### 7.4 Pack-awareness

A Harness declares pack-awareness in its package metadata:

```jsonc
{
  "name": "@jinn-network/claude-code-learner",
  "jinn": {
    "kind": "harness",
    "packAware": true,
    "packLoader": "./dist/pack-loader.js"
  }
}
```

A pack-aware Harness loads the operator's installed Packs at session-start via its declared pack-loader. A pack-unaware Harness ignores Packs entirely — the substrate is invisible to it. Both shapes are first-class.

### 7.5 The default learner under this model

`claude-code-learner` is a pack-aware Harness. It runs the seven-phase pipeline (per `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`) end-to-end — the pipeline (orient → strategize → plan → execute → debrief → improve → memory-consolidation) is **the Harness's flow, not the Pack's**. The pack-loader registers the operator's installed Packs' tools and skills so the pipeline's agents can use them, and exposes the Pack's schemas for Task/Solution validation.

Without a matching Pack, the learner runs vanilla — the seven-phase pipeline still executes, just without Type-specific tools / skills / schema validation.

The improve phase mutates `implStateDir/`. The mutation surfaces are:
- **`implStateDir/skills/<name>/SKILL.md`** — operator-learned skills. Loaded alongside pack-shipped skills; on name collision, operator-learned wins (override semantics below).
- **`implStateDir/agents/<name>.md`** — operator-learned agents. Same override semantics.
- **`implStateDir/tunables/<tunable>.json`** — operator-learned values for *Harness-declared* tunables (the learner declares its own knobs — calibration aggressiveness, ensemble size for its own ensemble step, corpus-lookup top-k, etc.). Tunables are a Harness contract, not a Pack contract; alternative Harnesses define different tunables relevant to their own pipelines.
- **`implStateDir/configs/<name>.json`** — operator-learned config overrides.

**Override semantics:** at session-start the pack-loader registers pack-shipped skills first, then operator-learned skills; on name collision (`forecasting-techniques` shipped by the Pack vs. `forecasting-techniques` written by the operator's promoter into `implStateDir/skills/`), the operator-learned skill wins. The pack-shipped skill remains on disk for inspection / `git diff` purposes; it is just not loaded into the runtime when an override exists. Clean separation: "from the Pack" (read-only, inspectable) vs. "operator-learned" (loaded, mutable).

### 7.6 The pack-loader (implementation detail)

A pack-loader is a per-Harness module that reads a Pack at session-start and emits whatever the Harness needs. Not a top-level architectural primitive — it's the code each pack-aware Harness ships internally to consume the (harness-agnostic) Pack format.

Contract:

```ts
export interface PackLoader {
  /** The Harness package this loader targets. */
  readonly harness: string;

  /** Compatibility against Pack manifest schema versions. */
  readonly packSchemaRange: string;

  /**
   * Read a Pack and emit the harness-specific runtime artifacts.
   * Called once per session-start per (Harness, Pack) pair.
   */
  loadPack(input: {
    pack: PackManifest;
    packDir: string;
    implStateDir: string;
  }): Promise<HarnessRuntimeArtifacts>;
}
```

`HarnessRuntimeArtifacts` is harness-shaped. For `claude-code-learner`:

```ts
export interface ClaudeCodeLearnerArtifacts {
  registeredSkills: Array<{ name: string; path: string }>;       // mounted into the harness's skill registry
  mcpServerSpawns: Array<{ name: string; entry: string }>;
  schemas: { task?: object; solution?: object; verdict?: object }; // for input/output validation
}
```

V1 ships exactly one pack-loader: `claude-code-learner`'s. It lives in `client/src/harnesses/claude-code-learner/pack-loader.ts`. The loader:

1. Reads the Pack's standard plugin fields (`mcpServers`, `skills`).
2. Spawns each `mcpServers[]` entry and registers its tools with the Harness's MCP client.
3. Mounts each `skills[]` entry into the Harness's skill registry so the seven-phase pipeline's agents can `Skill` into them.
4. Reads `jinn.schemas` (if present); validates Tasks on dispatch and Solutions before envelope assembly.
5. Does **not** synthesize phase agents from a flow declaration — the Harness owns its flow. Pack content is consumed as substrate the Harness chooses to use, not as a pipeline override.

Alternative-Harness pack-loaders (Pi.dev / Codex / Gemini-CLI ports) are out of scope for v1 — they appear when those Harnesses do.

---

## 8. Trust boundaries

The reframe gives three named surfaces with clear ownership:

| Surface | Owner | Mutability | How signed |
|---|---|---|---|
| Pack content (manifest + tools + skills + schemas) | Pack author | Read-only at runtime | Plugin-marketplace publish / npm publish + (Phase B) signed manifest per `spec/2026-05-executor-trust-boundary.md` |
| Harness code (and its declared tunables list) | Harness author | Read-only at runtime | npm publish + Path 2 manifest signing per existing trust-boundary spec |
| Operator state (`implStateDir/`, including tunable *values*) | Operator | Mutable by Harness's improve phase | Git-history within the operator's local implStateDir; no external attestation |

This resolves the `jinn-mono-dwqm` contradiction directly: there is no "signed code that learns at runtime." Signed code (Harness, Pack) doesn't mutate. Operator state mutates. The improve phase's action surface is bounded to operator state.

A Path 2 specialist that doesn't want to use Packs continues to be signed-and-immutable. A Path 2 specialist that wants learning either templates the learner or implements its own learning loop — its choice. Neither path requires the network to relax the signature on its code.

---

## 9. Three layers of compounding (restated against the model)

Per #59 §1, "two layers of compounding: corpus-level and harness-level." Under this model the picture is:

1. **Per-operator (harness-level)** — operator's implStateDir mutates run over run. The improve phase is bounded to operator-state surfaces (§7.5). Compounds within one operator's deployment.
2. **Network (corpus-level)** — trajectories land in the corpus library (Phase A.1). All Harnesses can read the corpus during orient/debrief. Compounds across operators.
3. **Author-mediated (pack-level)** — Pack authors observe trajectories, ship new Pack versions. Operators upgrade via `yarn upgrade @jinn-network/prediction-pack`. Compounds across the SolverNet.

The 26-week reversion threshold from #57 §5 reads (1)+(2)+(3) together: if Brier-spread doesn't trend positive, *one of these three layers is failing to compound*. The dashboard tells us which.

---

## 10. The Prediction SolverNet (v1 worked example)

| Component | Concrete |
|---|---|
| Name | `Prediction` |
| Type | `prediction.v0` |
| Pack | `@jinn-network/prediction-pack`, lives at `client/plugins/jinn-prediction-pack/` |
| Objective | Brier-spread vs. Polymarket consensus, rolling 84-day window, lower-is-better (#57 §5) |
| Task generator | Polymarket-derived auto-poster (Phase A.3 — separate plan) |
| Recommended Harness | `claude-code-learner` (the bundled default) |
| Public dashboard | `https://jinn.network/solvernets/prediction` (separate plan) |

**Out-of-the-box state for a default operator:**

The daemon installs the Prediction Pack, the learner becomes the Harness for `prediction.v0`, the creator loop posts Polymarket-derived Tasks, the loop runs end-to-end. No additional configuration needed.

**v1 contents of `jinn-prediction-pack`:**

- `schemas/{task,solution,verdict}.json` published (Type-defining Pack).
- `mcp-servers/polymarket-api/` ships and tests pass against the live Polymarket API on testnet. Provides `market_state`, `resolution`, `recent_volume`, `resolution_rule` tools.
- `skills/` populated with at least: `forecasting-techniques` (Tetlock-style superforecasting principles), `calibration-approaches` (how to use historical Brier feedback), `base-rates` (known base rates for common event types), `common-biases` (overconfidence / anchoring / recency warnings), `polymarket-specifics` (re-listing, cancellation, ambiguous-resolution edge cases). Each skill is a markdown file with frontmatter — domain knowledge embedded as instruction, consumable by any Claude Code-shaped Harness.
- `jinn.supportsTypes: ["prediction.v0"]` and `jinn.schemas` populated.
- The learner's pack-loader registers all skills and spawns all MCP servers at session-start with no errors against this Pack.
- An end-to-end e2e test posts a fake `prediction.v0` Task on Anvil and asserts the learner produces a `Solution.solutionPayload` validated against the Pack's solution schema.

**What is NOT in the v1 Pack** (lives elsewhere):

- The seven-phase flow → owned by `claude-code-learner` (its existing pipeline; uses Pack tools and skills as resources).
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

### 11.2 RestorerImpl → Harness rename

- Move `client/src/restorer/types.ts` → `client/src/harnesses/types.ts`. Type rename.
- Rename `client/src/restorer/` → `client/src/harnesses/`. Update all imports (~ a few dozen call sites; mechanical).
- Rename `JinnConfig.restorers` → `JinnConfig.harnesses` (config-file migration helper writes a one-time conversion).
- Rename `@jinn-network/restorer-sdk` → `@jinn-network/harness-sdk`. Dual-publish for 12 weeks; the old package re-exports from the new with a deprecation `console.warn`.
- Closes `jinn-mono-juw` / GH#43.

### 11.3 Output / context renames

- `RestorationOutput → Solution`.
- `restorationPayload → solutionPayload`.
- `RestorationContext → HarnessContext`.
- All field-level usages updated. Field renames in tests + e2e accordingly.

### 11.4 Task / spec field renames

- `RestorationJob → Task` (the on-chain object's TypeScript name).
- `intentCid → specCid` on the Task struct + ABIs.
- `spec.kind → spec.type` in the IPFS-stored spec format.
- `spec.type: 'restoration' | 'evaluation'` → `spec.role: 'restoration' | 'evaluation'`. Avoids collision with the renamed Type field.
- `byKind → byType` in operator config.
- `supportedKinds → supportedTypes` in Pack manifests + Path 2 Harness manifests.
- `client/src/intents/kinds/` → `client/src/types/` (the Type-definition modules; not to be confused with the existing `client/src/types/` for envelopes — see §13 open question 8).

The schema-versioning grammar in `spec/2026-05-schema-versioning.md` continues to apply — only the field name changes; values like `'prediction.v0'` are unchanged.

### 11.5 Pack mechanism

- New module: `client/src/packs/`.
  - `resolvers/` — multi-format resolvers: `npm.ts`, `cc-marketplace.ts`, `git.ts`, `local.ts`, (Phase B+) `ipfs.ts`. Each resolver takes a spec string, fetches the package, and returns a normalized `PackManifest` regardless of which host-format (Claude Code plugin / Gemini extension / standalone) the package uses.
  - `loader.ts` — reads `config.packs[]`, calls the appropriate resolver, validates the `jinn.*` extension, builds an in-memory `PackRegistry`.
  - `loader-registry.ts` — registry of installed pack-loaders keyed by Harness name.
  - `types.ts` — `PackManifest`, `PackLoader`, `HarnessRuntimeArtifacts`.
  - `cli.ts` — `jinn packs list / add / remove / show`.
- Daemon `main.ts` initialises the Pack registry before constructing the Harness registry; pack-aware Harnesses receive their pack-loader handle in their constructor env.
- `jinn-prediction-pack` ships at `client/plugins/jinn-prediction-pack/` as the first concrete Pack — a Claude Code plugin with the `jinn` extension populated per §5.1.
- The `claude-code-learner` pack-loader ships at `client/src/harnesses/claude-code-learner/pack-loader.ts`. It registers the Pack's standard plugin `mcpServers` and `skills` into the learner's runtime, exposes `jinn.schemas` for input/output validation, and does *not* synthesize phase agents — the learner owns its flow.

### 11.6 Path 1 retirement

The slot taxonomy from `spec/2026-04-30-plug-in-surface.md` §4.2 (phase-agent-override / topic-explorer / mcp-tool / skill-bundle / memory-backend / hook / bundle) is **retired**. Recruits who would have shipped Path 1 plug-ins now pick one of:

- **Ship a Pack** — for substrate that is genuinely Type-specific and harness-agnostic (calibration-data tables, MCP tool servers, domain knowledge, flow declarations).
- **Fork the learner** — for harness-specific extensions (a custom planner agent, a specialised step-worker). The learner is open-source; forking is a recruit-friendly path for skill / agent / memory-backend authors who want to ship something claude-code-learner-shaped without the network needing a per-harness slot taxonomy.
- **Ship a Harness** (Path 2 — unchanged) — for builders with a working monolith.

The cost of retirement is real: phase-agent-overrides and skill-bundles were the lowest-friction recruit shape in the prior spec. The benefit is that the substrate is now portable across Harnesses, which is what the Phase A.2 ambition required all along.

`spec/2026-04-30-plug-in-surface.md` §4 (Path 1) is marked superseded by this spec. The §3 Path 2 commitments (SDK, scaffolding, worked examples) hold under the renames.

### 11.7 Specialists currently in-tree

| Today | Disposition |
|---|---|
| `claude-code-learner` (with wrapper) | Wrapper deleted; learner is now a peer Harness, default in registry. |
| `prediction-v0-baseline` | Moves to `examples/external-harnesses/prediction-v0-baseline/`. Becomes the worked-example "Harness without Packs" — a Path 2 monolith that ignores Packs. Operators who want it register via `byType`. Remains compiled in CI as an example. |
| `prediction-apy-v0-baseline` | Same disposition as `prediction-v0-baseline`. |
| `claude-mcp-hyperliquid` | Stays in-tree as a default-disabled Path 2 specialist (existing behaviour); not pack-aware; portfolio.v0 Pack is a future bead. |
| `claude-mcp-prediction` / `claude-mcp-prediction-apy` | Stay in-tree for now; revisit once `jinn-prediction-pack` is producing comparable or better results. Candidates for the same disposition as the baselines. |
| `legacy-claude` | Stays as an unrelated Harness; not pack-aware; not affected by this spec. |
| `*-evaluator` impls | All evaluator Harnesses stay in-tree. Evaluation is deterministic per Type; Packs do not currently provide evaluator substrate. (Evaluator Packs are a future-bead question.) |

### 11.8 Default config for new operators

```jsonc
{
  "harnesses": {
    "byType": {},
    "disabled": []
  },
  "packs": [
    "@jinn-network/prediction-pack"
  ],
  "solverNets": [
    {
      "name": "Prediction",
      "type": "prediction.v0",
      "pack": "@jinn-network/prediction-pack",
      "objective": {
        "scalar": "brier-spread-vs-polymarket",
        "polarity": "lower-is-better",
        "rollingWindowDays": 84
      },
      "taskGenerator": "polymarket-derived-auto-poster",
      "recommendedHarness": "claude-code-learner"
    }
  ]
}
```

Existing operators on testnet receive a one-time config-migration prompt at daemon start (`jinn migrate-config`) that produces the above shape.

---

## 12. What we're explicitly deferring

- **Tight Task-Pack association on-chain.** A Task does not currently reference a recommended Pack. v1 is loose-association: operator config maps Types to Packs. Tight association (e.g., a `recommendedPackCid` field on the Task) is Phase B+.
- **An on-chain Pack registry.** Distribution is npm in v1. A curated marketplace and on-chain pinning are Phase 2+.
- **Cross-pack dependencies.** A Pack does not declare it depends on another Pack. If a future Pack genuinely needs another's MCP tools, the recommendation is to vendor or to ship a `bundle`-shape Pack.
- **Hot reload.** Packs and Harnesses load once per process, consistent with Path 2's existing once-per-process lifecycle.
- **Pack content signing.** v1 trusts npm publish + operator vouch-by-install. Path 2-shaped manifest signing extended to Packs is a follow-up bead.
- **Tunable-mutation policy.** v1 lets the Harness's improve phase write any declared tunable. Per-tunable policy (rate limits, validation, attestation) is Phase B+.
- **Author-mediated improvement velocity.** This spec assumes Pack authors observe trajectories and ship new versions on their own cadence. Tooling for "publish a new Pack version from operator-trajectory data" is out of scope.
- **Evaluator Packs.** Today evaluators are deterministic and don't need substrate. If a future evaluator wants knowledge or tools (e.g., a probabilistic verifier), the same Pack mechanism applies — no architecture change needed.

---

## 13. Open questions

1. **Should the default config silently install `@jinn-network/prediction-pack`, or surface a one-line consent prompt at first boot?** Lean: silent install for new operators; one-line prompt on `jinn migrate-config` for existing operators.
2. **Should there be a separate SolverType registry independent of Packs?** v0.4 leaves Type-schemas to Type-defining Packs; the in-repo daemon ships pre-installed with the prediction Pack so the schema is always available out-of-the-box. Permissionless new Types travel via Pack publication. Open question: does this work for Tasks where the SolverType is widely known but no Pack is installed (e.g., an evaluator-only operator who wants to score Tasks without running the substrate)? Lean: ship a "schemas-only" sub-package convention (Pack with `jinn.supportsTypes` + `jinn.schemas`, no MCP servers, no skills) for these cases. Cheap to add; doesn't alter the architecture.
3. **Where do Harness-declared tunables live?** Each Harness declares its own tunables (calibration aggressiveness, ensemble size, corpus-lookup top-k for the learner). Format: in the Harness's `package.json` `jinn` field? In a separate `harness.tunables.json`? Lean: in the Harness's `package.json` `jinn.tunables[]` array, mirroring the shape that was previously on Pack manifests. Keeps the declaration close to the code that reads them.
4. **Should the `claude-code-learner` pack-loader cache its registration work by `(packVersion, packContentHash)`?** Lean: yes for performance; with a `--no-cache` daemon flag for debugging.
5. **Path 2 builders losing the slot ergonomics — is "fork the learner" actually a viable recruit path?** This is the most genuine concern of the Path 1 retirement. Mitigation: the learner repo includes a `learner-template/` directory with a stripped-down skeleton; the recruit story becomes "fork the template, swap your specialist code in, optionally re-use the same `@jinn-network/harness-sdk` SDK." If recruits report this is too high-friction, Phase A.4 retro re-opens the slot taxonomy as a follow-up.
6. **Should evaluator Harnesses also be pack-aware?** Today evaluators are deterministic and don't need substrate. If a future evaluator wants knowledge or tools, the same Pack mechanism applies — no architecture change needed.
7. **Should `solverNets[]` config be operator-side declarative as shown in §11.8, or should SolverNet definitions ship as their own npm packages (e.g., `@jinn-network/prediction-solvernet`) that bundle Pack + Type schema + objective definition together?** Lean: operator-side config in v1 (simpler); promote to dedicated SolverNet packages if multiple SolverNets ship and the bundling reduces operator burden.
8. **Naming collision: `client/src/types/` vs. the renamed Type-definitions directory.** The existing `client/src/types/` holds envelope/desired-state TypeScript types; the rename of `client/src/intents/kinds/` collides if also called `types/`. Lean: keep the existing `types/` for envelope types, rename the kind modules to `client/src/solver-types/` or similar — naming bikeshed for the migration PR.
9. **Solver as a noun in code.** The vocabulary uses "Solver" informally for an operator running a Harness. Should this surface in code (e.g., a `Solver` class composing `Harness` + identity), or stay purely a prose-level term? Lean: prose-only in v1; the operator entity is already represented by the Safe + Harness pair, no need for a new class.
10. **Cross-host plugin-format mapping.** Claude Code uses `.claude-plugin/plugin.json`; Gemini uses `gemini-extension.json`; Codex has its own. The shapes are similar but field names differ (e.g., Claude Code's `mcpServers` vs. Gemini's similarly-named but slightly-different field). The Pack should accept any of these as host-shape and read its `jinn` extension uniformly. v1 commits to: a Pack ships *one* canonical host-shape (Claude Code plugin in v1, since that's what Jinn's daemon spawns); other hosts can read the same package via field-mapping shims. A formal multi-host manifest spec (single Pack manifest renderable into N host shapes) is a follow-up bead if we ship a Gemini-CLI Harness and discover the shim is too lossy.

---

## 14. Acceptance criteria

This spec is accepted when:

1. **Merged under `spec/`.**
2. **Cross-references added** to the sibling specs (§ lineage list) and to `spec/2026-04-30-plug-in-surface.md` marking §4 (Path 1) superseded.
3. **`@jinn-network/harness-sdk` v1.0.0 published** (renamed from `restorer-sdk`); 12-week dual-publish window declared.
4. **Wrapper code deleted** per §11.1.
5. **Rename PR merged** per §11.2 + §11.3 + §11.4; `jinn-mono-juw` / GH#43 closed.
6. **`client/src/packs/` module shipped** with loader, loader-registry, CLI, and unit tests.
7. **`claude-code-learner` pack-loader shipped** under `client/src/harnesses/claude-code-learner/pack-loader.ts`.
8. **`@jinn-network/prediction-pack` v0.1.0 shipped** at `client/plugins/jinn-prediction-pack/` with the §10 contents and passing CI.
9. **e2e validation** — the existing `yarn e2e` script extended to assert: Prediction Pack loads, pack-loader generates skills/agents, the learner produces a schema-valid `solutionPayload` against an Anvil-posted `prediction.v0` Task.
10. **Specialists re-disposed** per §11.7; `examples/external-harnesses/` directory created.
11. **Default config updated** per §11.8; `jinn migrate-config` verb shipped.

The campaign-launch gate (#57 §1) is *not* acceptance for this spec — it is acceptance for Phase A.4. This spec ships the architecture that makes the campaign run.

---

*End of v0.2.*
