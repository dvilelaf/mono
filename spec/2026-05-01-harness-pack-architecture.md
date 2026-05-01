# Harness + Pack architecture — first-principles redesign of the executor + plug-in surface

- **Date:** 2026-05-01
- **Author:** opus (drafted on jinn-mono-dwqm; Captain ritsukai)
- **Status:** Proposal
- **Version:** 0.1
- **Tracks:** Phase A.2 reframe — supersedes the wrapper-with-specialist construct introduced in PR #63; replaces `spec/2026-04-30-plug-in-surface.md` Path 1 with a harness-agnostic pack mechanism.

**Sibling specs (load-bearing pre-reads):**

- `spec/2026-04-28-restorer-architecture.md` — ADR: specialists-first; `claude-code-learner` is one impl among many. This spec re-aligns the implementation with the ADR after a drift in PR #63.
- `spec/2026-04-30-plug-in-surface.md` — the spec this one supersedes for Path 1. Path 2 commitments hold.
- `spec/2026-05-external-restorer-impls.md` / `spec/2026-05-executor-trust-boundary.md` / `spec/2026-05-registry-discovery.md` / `spec/2026-05-schema-versioning.md` — Path 2 substrate. All five hold under the rename `RestorerImpl → Harness`.
- `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md` — the seven-phase pipeline. Stays as the bundled learner's internal architecture; the wrapper layer is removed.

**Discussion lineage:**

- [#57](https://github.com/Jinn-Network/mono/discussions/57) — Prediction SolverNet GTM. The "client as meta-harness" framing in §3 is *implemented as registry-default-harness + pack-aware loading*, not as an every-kind wrapper.
- [#59](https://github.com/Jinn-Network/mono/discussions/59) — knowledge-market roadmap. The "harness-level compounding" claim in §1 is what the learner does end-to-end inside its own implStateDir; this spec resolves how that fits with peer harnesses that don't learn.

**Bead lineage:**

- `jinn-mono-dwqm` — "Learning loop excludes Path 2 specialist behaviour." This spec resolves that bead by *removing the construct that created the problem* (the universal wrapper) rather than patching around it.
- `jinn-mono-juw` / GH#43 — `RestorerImpl → Harness` rename. Lands as part of this spec.

---

## 1. Purpose and scope

### 1.1 What this spec commits

A coordinated set of architectural moves that re-align the implementation with what the Phase A.2 spec already said and what the original learner design intended:

1. **Delete the universal wrapper.** `claude-code-learner` becomes a peer harness in the registry, not a substrate that wraps every kind. Its `supports()` returns `true` for any non-evaluation restoration; it is the registry's *default* when no other harness claims a kind. It owns its `run()` end-to-end.
2. **Rename `RestorerImpl → Harness`.** The thing-an-operator-runs is a Harness. The Restorer remains a protocol role; the rename disambiguates role from implementation.
3. **Introduce Packs.** A Pack is a harness-agnostic bundle that supplies kind-specific substrate: schemas, MCP-tool servers, knowledge files, a flow declaration, and (optionally) declared tunables. Packs are distributed as npm packages, manifested via `jinn.pack.json`, and consumed by any pack-aware harness.
4. **Introduce Adapters.** An Adapter is a per-harness module that reads a Pack at session-start and emits whatever the harness needs (skills + agents for `claude-code-learner`; equivalents for alternative harnesses).
5. **Ship the Prediction campaign as the first instance.** `jinn-prediction-pack` ships in-repo, on by default for new operators. The default-learner + prediction-pack combination is what the GTM in #57 calls the "client as meta-harness" running against the Polymarket-derived intent stream.

### 1.2 In scope

- The Pack manifest schema and content layout.
- The Harness interface (renamed from `RestorerImpl`).
- The Adapter contract (per-harness pack consumer).
- Registry resolution rules (`byKind` + default; Path 2 trumps default).
- The `jinn-prediction-pack` content for v1 of the campaign.
- Migration of `prediction-v0-baseline` and the wrapper code paths.
- Trust-boundary disposition (pack content vs. harness code vs. operator state).
- The "Campaign" composition pattern (kind + pack + intent-generator + scalar + recommended harness).

### 1.3 Out of scope

- Implementation of the rename PR itself (the rename is *committed* here; mechanical execution lives in a follow-up bead).
- Per-component royalty / pricing / DRM (continues to be off the roadmap per DR-2026-04-30).
- Multi-evaluator consensus mechanics (Phase B).
- Hot-reload of packs or harnesses inside a running daemon (Phase 2+; consistent with `2026-05-external-restorer-impls.md` §3.4).
- An on-chain pack registry (Phase 2+; analogous to the impl-registry deferral).
- Tight coupling of intent-on-chain to a recommended pack CID (loose-association in v1; tight is Phase B+).
- Path 1 in its previous form. The phase-agent-override / topic-explorer / hook / memory-backend slot taxonomy from `spec/2026-04-30-plug-in-surface.md` §4.2 is *retired* in favour of the pack mechanism. Path 1's recruit story becomes "ship a Pack" (harness-agnostic) or "fork the learner template" (harness-specific). See §10.4.

### 1.4 Non-goals

- This spec does not commit a marketplace.
- This spec does not redefine the protocol layer. JinnRouter, IdentityRegistry, ValidationRegistry, ReputationRegistry, ClaimRegistry, x402, ERC-8004 — all unchanged.
- This spec does not define a new harness alongside `claude-code-learner`. Alternative harnesses (Pi.dev / Codex / Gemini-CLI ports) are recruit targets — they ship their own adapters when they appear.

---

## 2. Glossary

| Term | Definition |
|---|---|
| **Intent** | An on-chain object (today: `JinnRouter.createRestorationJob`) declaring a desired state. Carries a `kind` and an `intentCid` referencing the IPFS-stored spec. |
| **Kind** | The schema-versioned shape an intent's spec conforms to. Examples today: `prediction.v0`, `prediction.apy.v0`, `portfolio.v0`. Grammar per `spec/2026-05-schema-versioning.md`. |
| **Pack** | A harness-agnostic npm package supplying kind-specific substrate. Manifest at `jinn.pack.json`. Read-only at runtime. Distributed via npm; loaded into operator config. |
| **Harness** | The runtime an operator chooses to run for restoring intents. The thing today called `RestorerImpl`. Implements the Restorer protocol role. May or may not be pack-aware; may or may not learn. |
| **Adapter** | A per-harness module that translates a Pack into whatever the harness needs at session-start. The bundled `claude-code-learner` ships its own Adapter; alternative harnesses ship theirs. Harnesses without an Adapter ignore packs and run vanilla. |
| **Campaign** | A composition: (kind + pack + intent-generator + public scalar + recommended harness). The Prediction SolverNet is the first concrete instance. The composition is informational, not a protocol object. |
| **Tunable** | A pack-declared mutable surface that an operator's harness is allowed to update during the improve phase. Pack signs the *list* of tunables; pack does not sign their values. |
| **Restorer** | A protocol role (Creator / Restorer / Evaluator). Unchanged. A Restorer runs *a Harness*. |

---

## 3. First-principles model

Five things, distinct concerns, clean composition:

```
  Intent (on-chain)            Kind (schema)
        \                          /
         \                        /
          v                      v
         Pack (kind-specific substrate; harness-agnostic)
              |
              v
          Adapter (per-harness pack consumer)
              |
              v
         Harness (runtime; implements Restorer role)
              |
              v
       Output envelope (delivered via Mech Marketplace + JinnRouter)
```

- **Intents and kinds** live in the protocol layer. Unchanged.
- **Packs** are operator-installed npm packages. They are the unit of *kind-specific substrate*. A pack ships everything a harness needs to handle a kind well: schemas, tool servers, domain knowledge, and a declarative flow.
- **Harnesses** are operator-installed npm packages. They are the unit of *execution runtime*. A harness implements the `Harness` interface (renamed from `RestorerImpl`). Some harnesses are pack-aware (ship an Adapter); some aren't (ignore packs, run their own way).
- **Adapters** are the bridge. Bundled with the harness package or shipped separately by harness-builders.

The clean separation is: **packs supply *what to know* and *what to do*; harnesses supply *how to run it*.**

---

## 4. The Pack

### 4.1 Manifest — `jinn.pack.json`

```jsonc
{
  "schemaVersion": "1.0.0",
  "name": "@jinn-network/prediction-pack",
  "version": "0.1.0",
  "description": "Substrate for prediction.v0 — Polymarket-style binary forecasts.",

  "supportedKinds": ["prediction.v0"],

  "schemas": {
    "intent": "schemas/intent.json",
    "restoration": "schemas/restoration.json",
    "verdict": "schemas/verdict.json"
  },

  "mcpServers": [
    {
      "name": "polymarket",
      "entry": "mcp-servers/polymarket-api/server.js",
      "tools": ["market_state", "resolution", "recent_volume"]
    }
  ],

  "knowledge": [
    "knowledge/forecasting-techniques.md",
    "knowledge/calibration-approaches.md",
    "knowledge/base-rates.md"
  ],

  "flow": "flow.yaml",

  "tunables": [
    { "name": "calibration.temperature", "type": "number", "default": 1.0 },
    { "name": "ensemble.weights", "type": "json", "default": null }
  ],

  "recommendedHarness": "claude-code-learner",
  "testedAdapters": ["claude-code-learner@>=0.2.0"],

  "author": { "name": "Jinn Network", "url": "https://jinn.network" },
  "license": "MIT",
  "homepage": "https://github.com/Jinn-Network/mono/tree/main/client/plugins/jinn-prediction-pack"
}
```

**Field semantics:**

| Field | Purpose |
|---|---|
| `schemaVersion` | The pack manifest's own schema. v1 ships `1.0.0`. Breaking changes follow a 12-week deprecation window (parity with the SDK; #57 §5.1). |
| `name`, `version` | npm identity. Must match `package.json`. Mismatch → install-time refusal. |
| `supportedKinds` | Per `spec/2026-05-schema-versioning.md` grammar. Which kinds this pack provides substrate for. |
| `schemas.*` | JSON-Schema files validating intent, restoration payload, verdict payload. The harness uses these to validate inputs/outputs. |
| `mcpServers[]` | Process-based tool servers. The harness's adapter spawns these at session-start and registers their tools with the harness's MCP client. Harness-agnostic by construction. |
| `knowledge[]` | Markdown files containing kind-specific domain knowledge. The harness's adapter embeds these into its agents' prompt context. Files are markdown so any harness can render them. |
| `flow` | A structured pipeline declaration (see §4.3). The adapter consumes this to generate harness-native phase artifacts. |
| `tunables[]` | Declared mutable surfaces. Each entry names a tunable, its type, and a default. Operators' harnesses may write values via the improve phase; pack signs the list, not the values. |
| `recommendedHarness` | Informational. The harness package the pack author tested against. Operators may pick another. |
| `testedAdapters[]` | Informational. Adapter package + version ranges the pack has been validated against. |

The manifest is JSON-Schema validated at install time and at session start. Unknown top-level keys fail loud.

### 4.2 What's NOT in a Pack

A pack does not contain harness-shaped artifacts. Specifically:

- **No markdown skills** (claude-code-learner-specific format).
- **No markdown agents with frontmatter** (claude-code-learner-specific format).
- **No shell-script hooks** (claude-code-learner / Claude Code-specific format).
- **No phase-specific TypeScript modules** (signature would couple the pack to one harness).

A pack-aware harness's *adapter* generates these at session-start from the pack's flow + knowledge. If a pack-author wants to ship harness-specific extensions, they ship a sibling Adapter package (e.g., `@some-author/claude-code-learner-prediction-overrides`) that declares an enhancement of an existing pack.

### 4.3 Flow declaration — `flow.yaml`

```yaml
flow:
  phases:
    - name: gather-context
      goal: Fetch market state and recent volume from Polymarket.
      inputs: [intent]
      outputs: [market-state, recent-volume]
      tools: [polymarket.market_state, polymarket.recent_volume]
      knowledge: []

    - name: frame-question
      goal: Convert the intent into a forecasting question with explicit resolution criteria.
      inputs: [intent, market-state]
      outputs: [forecast-question]
      tools: []
      knowledge: [base-rates.md]

    - name: ensemble-forecast
      goal: Generate N independent probability estimates using diverse forecasting techniques.
      inputs: [forecast-question, market-state]
      outputs: [forecast-estimates]
      tools: []
      knowledge: [forecasting-techniques.md]

    - name: calibrate
      goal: Combine estimates and apply calibration adjustment.
      inputs: [forecast-estimates]
      outputs: [calibrated-probability]
      tools: []
      knowledge: [calibration-approaches.md]
      tunables: [calibration.temperature, ensemble.weights]

    - name: package-output
      goal: Format the calibrated probability into the prediction.v0 restoration payload.
      inputs: [calibrated-probability, intent]
      outputs: [restoration-payload]
      tools: []
      schemas: [restoration]
```

**The flow is declarative, not executable.** It tells the adapter *what steps the harness should run for this kind, and what each step needs*. The adapter's job is to translate this into the harness's runtime artifacts. For `claude-code-learner`, that means: each phase becomes a generated skill or agent that the coordinator includes in its phase routing; tools become MCP-tool dependencies; knowledge files become embedded prompt context; tunables become reads against `implStateDir/tunables/<pack>/`.

A harness without a pack runs its own internal pipeline (e.g., the seven-phase coordinator) without flow-derived steps — the flow is *additive substrate*, not a mandatory contract.

### 4.4 Distribution and install

```bash
yarn add @jinn-network/prediction-pack
jinn packs add @jinn-network/prediction-pack
```

The `jinn packs add` step:

1. Resolves the package, reads `jinn.pack.json`.
2. Validates `name` and `version` match `package.json`.
3. Validates `supportedKinds` against the kind grammar.
4. Validates `schemas.*` paths exist and parse as JSON Schema.
5. Validates `flow` parses and conforms to the flow schema.
6. Appends to `~/.jinn-client/config.json` under `packs[]`.

**Default operator config installs `@jinn-network/prediction-pack` automatically for new daemons** so the prediction campaign works out of the box. Migration handling for existing operators: §10.

### 4.5 Versioning + compatibility

- **Pack manifest schema** (`jinn.pack.json` shape) follows semver with a 12-week deprecation window.
- **Pack content** (`@jinn-network/prediction-pack` itself) follows semver. Breaking changes to schemas, flow shape, or tunables list bump the major.
- **Adapter compatibility** is declared informationally via `testedAdapters[]`. Adapters declare their own compatibility against pack `schemaVersion` and refuse to load packs outside their range with a clear error.

---

## 5. The Harness

### 5.1 Rename

`RestorerImpl` → `Harness`. The interface in `client/src/restorer/types.ts` is renamed; the directory `client/src/restorer/` is renamed to `client/src/harnesses/`; `RestorationContext` becomes `HarnessContext`; `RestorationOutput` stays (it's the protocol-level envelope payload). The Path 2 `@jinn-network/restorer-sdk` package is renamed to `@jinn-network/harness-sdk` with a 12-week dual-publish window.

### 5.2 Interface (post-rename, no other changes)

```ts
export interface Harness {
  readonly name: string;
  readonly version: string;
  supports(spec: { kind: string; type?: 'restoration' | 'evaluation' }): boolean;
  isReady(spec?: { kind: string; type?: 'restoration' | 'evaluation' }): Promise<ReadyStatus>;
  canAttempt?(intent: RestorationJob): Promise<{ ok: true } | { ok: false; reason: string }>;
  onEnable?(args: Record<string, string | undefined>, spec?: { kind: string; type?: 'restoration' | 'evaluation' }): Promise<EnableResult>;
  onDisable?(spec?: { kind: string; type?: 'restoration' | 'evaluation' }): Promise<void>;
  run(ctx: HarnessContext): Promise<RestorationOutput>;
}
```

### 5.3 Selection (registry resolution)

The registry resolves a harness for an intent by:

1. **`config.harnesses.byKind[intent.kind]`** — explicit per-kind binding wins. Used by operators who want a Path 2 specialist for a specific kind.
2. **Default harness** — `claude-code-learner`. Claims any non-evaluation kind that wasn't routed to a specialist.
3. **Disabled list** — `config.harnesses.disabled[]` excludes a harness from selection regardless.

**The wrapper is gone.** `wrapWith` config and `DEFAULT_WRAP_WITH` are removed. The first-match-wrapper-with-specialist construct in `wrapper.ts` is deleted.

### 5.4 Pack-awareness

A harness declares pack-awareness in its package metadata:

```jsonc
{
  "name": "@jinn-network/claude-code-learner",
  "jinn": {
    "kind": "harness",
    "packAware": true,
    "adapter": "./dist/adapter.js"
  }
}
```

A pack-aware harness loads the operator's installed packs at session-start via its declared adapter. A pack-unaware harness ignores packs entirely — the substrate is invisible to it. Both shapes are first-class.

### 5.5 The default learner under this model

`claude-code-learner` is a pack-aware harness. It runs the seven-phase pipeline (per `docs/superpowers/specs/2026-04-23-default-learning-restorer-design.md`) end-to-end. It consults the bundled adapter at session-start to load any pack matching the intent's kind. Without a matching pack, it runs vanilla — the pipeline still executes, just without kind-specific knowledge or tools.

The improve phase mutates `implStateDir/`. The mutation surfaces are:
- **`implStateDir/skills/<name>/SKILL.md`** — operator-learned skills. Override pack-derived skills at load time.
- **`implStateDir/agents/<name>.md`** — operator-learned agents. Override pack-derived agents at load time.
- **`implStateDir/tunables/<pack-name>/<tunable>.json`** — operator-learned values for pack-declared tunables. Read by adapter-generated phase agents at runtime.
- **`implStateDir/configs/<name>.json`** — operator-learned config overrides.

Pack-derived artifacts live under `implStateDir/packs/<pack>/` and are *regenerated on pack version change* by the adapter. They are not edited by the promoter — operator-derived overrides go to the parent `implStateDir/skills|agents|configs/` namespaces.

**Override semantics:** at session-start the adapter loads pack-derived artifacts first, then operator-derived artifacts; on filename collision (`implStateDir/skills/forecasting-techniques/SKILL.md` vs. `implStateDir/packs/<pack>/skills/forecasting-techniques/SKILL.md`), the operator-derived file wins. The pack-derived file remains on disk for inspection / `git diff` purposes; it is just not loaded into the runtime when an override exists. Clean separation: "from the pack" (regenerated, inspectable) vs. "operator-learned" (loaded, preserved).

---

## 6. The Adapter

### 6.1 Contract

```ts
export interface PackAdapter {
  /** The harness package this adapter targets. */
  readonly harness: string;

  /** Compatibility against pack manifest schema versions. */
  readonly packSchemaRange: string;

  /**
   * Read a Pack and emit the harness-specific runtime artifacts.
   * Called once per session-start per (harness, pack) pair.
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
  generatedSkills: Array<{ path: string; content: string }>; // written under implStateDir/packs/<pack>/skills/
  generatedAgents: Array<{ path: string; content: string }>; // written under implStateDir/packs/<pack>/agents/
  mcpServerSpawns: Array<{ name: string; entry: string }>;
  knowledgeFiles: Array<{ name: string; markdown: string }>; // embedded into agent prompt contexts
  schemas: { intent?: object; restoration?: object; verdict?: object };
  tunablesPath: string; // implStateDir/tunables/<pack-name>/
}
```

### 6.2 v1 scope

V1 ships exactly one adapter: `claude-code-learner`'s. It lives in `client/src/harnesses/claude-code-learner/adapter.ts`. The adapter:

1. Reads `pack.flow` and generates one skill per phase under `implStateDir/packs/<pack>/skills/<phase-name>/SKILL.md`.
2. Spawns each `pack.mcpServers[]` entry and registers its tools with the harness's MCP client.
3. Embeds `pack.knowledge[]` markdown into the appropriate phase agents as prompt context.
4. Validates `RestorationOutput.restorationPayload` against `pack.schemas.restoration` before returning.
5. Initialises `implStateDir/tunables/<pack-name>/` with the pack's declared defaults if not present; reads operator-learned values if present.

Alternative-harness adapters (Pi.dev / Codex / Gemini-CLI ports) are out of scope for v1 — they appear when those harnesses do.

---

## 7. The Campaign

### 7.1 Definition

A **Campaign** is a composition pattern, not a protocol object:

- **Kind** — schema declared in-repo (`client/src/intents/kinds/`).
- **Pack** — npm package providing kind-specific substrate.
- **Intent generator** — auto-poster that creates intents on a cadence (today: `creator.ts` + `getTestnetAutoConfig`).
- **Public scalar** — the dashboard number the campaign rallies around (#57 §2).
- **Recommended harness** — informational; the harness most operators are expected to use.

### 7.2 The Prediction SolverNet (first instance)

| Component | Concrete |
|---|---|
| Kind | `prediction.v0` |
| Pack | `@jinn-network/prediction-pack`, lives at `client/plugins/jinn-prediction-pack/` |
| Intent generator | Polymarket-derived auto-poster (Phase A.3 — separate plan) |
| Public scalar | Brier-spread vs. Polymarket consensus (#57 §5) |
| Recommended harness | `claude-code-learner` (the bundled default) |

For an operator running default config: the daemon installs the prediction pack, the learner becomes the harness for `prediction.v0`, the creator loop posts Polymarket-derived intents, the loop runs end-to-end. No additional configuration needed.

### 7.3 What "campaign-ready" means concretely

For `jinn-prediction-pack` v1:

- `schemas/{intent,restoration,verdict}.json` published.
- `mcp-servers/polymarket-api/` ships and tests pass against the live Polymarket API on testnet.
- `knowledge/{forecasting-techniques,calibration-approaches,base-rates}.md` populated.
- `flow.yaml` with at least the §4.3 example phases.
- `tunables` list declared (defaults safe for cold-start operators).
- The learner's adapter generates all artifacts at session-start with no errors against this pack.
- An end-to-end e2e test posts a fake `prediction.v0` intent on Anvil and asserts the learner produces a `RestorationOutput.restorationPayload` validated against the pack's restoration schema.

---

## 8. Trust boundaries

The reframe gives three named surfaces with clear ownership:

| Surface | Owner | Mutability | How signed |
|---|---|---|---|
| Pack content (`jinn.pack.json` + everything it references except `tunables` values) | Pack author | Read-only at runtime | npm publish + (Phase B) signed manifest per `spec/2026-05-executor-trust-boundary.md` |
| Harness code | Harness author | Read-only at runtime | npm publish + Path 2 manifest signing per existing trust-boundary spec |
| Operator state (`implStateDir/`) | Operator | Mutable by harness's improve phase | Git-history within the operator's local implStateDir; no external attestation |

This resolves the bd-issue-dwqm contradiction directly: there is no "signed code that learns at runtime." Signed code (harness, pack) doesn't mutate. Operator state mutates. The improve phase's action surface is bounded to operator state.

A Path 2 specialist that doesn't want to use packs continues to be signed-and-immutable. A Path 2 specialist that wants learning either templates the learner or implements its own learning loop — its choice. Neither path requires the network to relax the signature on its code.

---

## 9. Three layers of compounding (restated against the model)

Per #59 §1, "two layers of compounding: corpus-level and harness-level." Under this model the picture is:

1. **Per-operator (harness-level)** — operator's implStateDir mutates run over run. The improve phase is bounded to operator-state surfaces (§5.5). Compounds within one operator's deployment.
2. **Network (corpus-level)** — trajectories land in the corpus library (Phase A.1). All harnesses can read the corpus during orient/debrief. Compounds across operators.
3. **Author-mediated (pack-level)** — pack authors observe trajectories, ship new pack versions. Operators upgrade via `yarn upgrade @jinn-network/prediction-pack`. Compounds across the campaign.

The 26-week reversion threshold from #57 §5 reads (1)+(2)+(3) together: if Brier-spread doesn't trend positive, *one of these three layers is failing to compound*. The dashboard tells us which.

---

## 10. Migration from current state

### 10.1 Wrapper deletion

- Delete `client/src/restorer/impls/claude-code-learner/wrapper.ts`.
- Delete `synthesizeExecuteSummaryFromSpecialist` (no longer needed — specialists run alone, write their own outputs directly).
- Remove `DEFAULT_WRAP_WITH = 'claude-code-learner'` from `intent-registry-access.ts`.
- Remove `wrapWith` from `JinnConfig.restorers`.
- Remove `resolveEffectiveWrapWith` and call sites.
- Remove the `wrapWith` registry construction option in `RestorerImplRegistry`.

### 10.2 RestorerImpl → Harness rename

- Move `client/src/restorer/types.ts` → `client/src/harnesses/types.ts`. Type rename.
- Rename `client/src/restorer/` → `client/src/harnesses/`. Update all imports (~ a few dozen call sites; mechanical).
- Rename `JinnConfig.restorers` → `JinnConfig.harnesses` (config-file migration helper writes a one-time conversion).
- Rename `@jinn-network/restorer-sdk` → `@jinn-network/harness-sdk`. Dual-publish for 12 weeks; the old package re-exports from the new with a deprecation `console.warn`.
- Closes `jinn-mono-juw` / GH#43.

### 10.3 Pack mechanism

- New module: `client/src/packs/`.
  - `loader.ts` — reads `config.packs[]`, resolves npm packages, validates manifests, builds an in-memory `PackRegistry`.
  - `adapter-registry.ts` — registry of installed `PackAdapter` instances keyed by harness name.
  - `types.ts` — `PackManifest`, `PackAdapter`, `HarnessRuntimeArtifacts`.
  - `cli.ts` — `jinn packs list / add / remove / show`.
- Daemon `main.ts` initialises the pack registry before constructing the harness registry; pack-aware harnesses receive their adapter handle in their constructor env.
- `jinn-prediction-pack` ships at `client/plugins/jinn-prediction-pack/` with the v1 content per §7.3.
- The `claude-code-learner` adapter ships at `client/src/harnesses/claude-code-learner/adapter.ts`.

### 10.4 Path 1 retirement

The slot taxonomy from `spec/2026-04-30-plug-in-surface.md` §4.2 (phase-agent-override / topic-explorer / mcp-tool / skill-bundle / memory-backend / hook / bundle) is **retired**. Recruits who would have shipped Path 1 plug-ins now pick one of:

- **Ship a Pack** — for substrate that is genuinely kind-specific and harness-agnostic (calibration-data tables, MCP tool servers, domain knowledge, flow declarations).
- **Fork the learner** — for harness-specific extensions (a custom planner agent, a specialised step-worker). The learner is open-source; forking is a recruit-friendly path for skill / agent / memory-backend authors who want to ship something claude-code-learner-shaped without the network needing a per-harness slot taxonomy.
- **Ship a Harness** (Path 2 — unchanged) — for builders with a working monolith.

The cost of retirement is real: phase-agent-overrides and skill-bundles were the lowest-friction recruit shape in the prior spec. The benefit is that the substrate is now portable across harnesses, which is what the Phase A.2 ambition required all along.

`spec/2026-04-30-plug-in-surface.md` §4 (Path 1) is marked superseded by this spec. The §3 Path 2 commitments (SDK, scaffolding, worked examples) hold under the rename.

### 10.5 Specialists currently in-tree

| Today | Disposition |
|---|---|
| `claude-code-learner` (with wrapper) | Wrapper deleted; learner is now a peer harness, default in registry. |
| `prediction-v0-baseline` | Moves to `examples/external-harnesses/prediction-v0-baseline/`. Becomes the worked-example "harness without packs" — a Path 2 monolith that ignores packs. Operators who want it register via `byKind`. Remains compiled in CI as an example. |
| `prediction-apy-v0-baseline` | Same disposition as `prediction-v0-baseline`. |
| `claude-mcp-hyperliquid` | Stays in-tree as a default-disabled Path 2 specialist (existing behaviour); not pack-aware; portfolio.v0 pack is a future bead. |
| `claude-mcp-prediction` / `claude-mcp-prediction-apy` | Stay in-tree for now; revisit once `jinn-prediction-pack` is producing comparable or better results. Candidates for the same disposition as the baselines. |
| `legacy-claude` | Stays as an unrelated harness; not pack-aware; not affected by this spec. |
| `*-evaluator` impls | All evaluator impls stay in-tree. Evaluation is deterministic per kind; packs do not currently provide evaluator substrate. (Evaluator packs are a future-bead question.) |

### 10.6 Default config for new operators

```jsonc
{
  "harnesses": {
    "byKind": {},
    "disabled": []
  },
  "packs": [
    "@jinn-network/prediction-pack"
  ]
}
```

The default config installs the prediction pack and lets the registry route `prediction.v0` to the default harness (the learner) with the pack loaded. Existing operators on testnet receive a one-time config-migration prompt at daemon start (`jinn migrate-config`) that produces the above shape.

---

## 11. What we're explicitly deferring

- **Tight intent-pack association.** An on-chain intent does not currently reference a recommended pack. v1 is loose-association: operator config maps kinds to packs. Tight association (e.g., a `recommendedPackCid` field on the intent) is Phase B+.
- **An on-chain pack registry.** Distribution is npm in v1. A curated marketplace and on-chain pinning are Phase 2+.
- **Cross-pack dependencies.** A pack does not declare it depends on another pack. If a future pack genuinely needs another's MCP tools, the recommendation is to vendor or to ship a `bundle`-shape pack. Real cross-package dependency mechanism is a follow-up.
- **Hot reload.** Packs and harnesses load once per process, consistent with Path 2's existing once-per-process lifecycle.
- **Pack content signing.** v1 trusts npm publish + operator vouch-by-install. Path 2-shaped manifest signing extended to packs is a follow-up bead — clearly named in `spec/2026-05-executor-trust-boundary.md`'s scope.
- **Tunable-mutation policy.** v1 lets the harness's improve phase write any declared tunable. Per-tunable policy (rate limits, validation, attestation) is Phase B+.
- **Author-mediated improvement velocity.** This spec assumes pack authors observe trajectories and ship new versions on their own cadence. Tooling for "publish a new pack version from operator-trajectory data" is out of scope; if it materialises it lives in a separate spec.

---

## 12. Open questions

1. **Should the default config silently install `@jinn-network/prediction-pack`, or surface a one-line consent prompt at first boot?** Lean: silent install for new operators; one-line prompt on `jinn migrate-config` for existing operators. Operator-friendliness vs. principle-of-least-surprise.
2. **Where should the flow declaration live within a pack — `flow.yaml`, `flow.json`, or inline in the manifest?** Lean: separate `flow.yaml` so it's diffable and versionable, but the manifest schema accepts inline as well for tiny packs.
3. **Should `tunables` carry a JSON Schema for value validation?** Lean: yes, in v1.1; v1 starts with `type` + `default` only and a simple validator.
4. **Should the `claude-code-learner` adapter generate skills/agents on every session-start, or cache by `(packVersion, packContentHash)` and reuse?** Lean: cache, with a `--no-cache` daemon flag for debugging.
5. **Naming bikeshed: `Pack` or `Bundle` or `Substrate`?** This spec commits to `Pack` for now — short, evocative, doesn't collide with existing protocol vocabulary. Open to revision before merge.
6. **Should evaluator harnesses also be pack-aware?** Today evaluators are deterministic and don't need substrate. If a future evaluator wants knowledge or tools (e.g., a probabilistic verifier), the same pack mechanism applies — no architecture change needed.
7. **Path 2 builders losing the slot ergonomics — is "fork the learner" actually a viable recruit path?** This is the most genuine concern of the Path 1 retirement. Mitigation: the learner repo includes a `learner-template/` directory with a stripped-down skeleton; the recruit story becomes "fork the template, swap your specialist code in, optionally re-use the same `@jinn-network/harness-sdk` SDK." If recruits report this is too high-friction, Phase A.4 retro re-opens the slot taxonomy as a follow-up.

---

## 13. Acceptance criteria

This spec is accepted when:

1. **Merged under `spec/`.**
2. **Cross-references added** to the sibling specs (§1 lineage list) and to `spec/2026-04-30-plug-in-surface.md` marking §4 (Path 1) superseded.
3. **`@jinn-network/harness-sdk` v1.0.0 published** (renamed from `restorer-sdk`); 12-week dual-publish window declared.
4. **Wrapper code deleted** per §10.1.
5. **Rename PR merged** per §10.2; `jinn-mono-juw` / GH#43 closed.
6. **`client/src/packs/` module shipped** with loader, adapter registry, CLI, and unit tests.
7. **`@jinn-network/claude-code-learner` adapter shipped** under `client/src/harnesses/claude-code-learner/adapter.ts`.
8. **`@jinn-network/prediction-pack` v0.1.0 shipped** at `client/plugins/jinn-prediction-pack/` with the §7.3 contents and passing CI.
9. **e2e validation** — the existing `yarn e2e` script extended to assert: prediction pack loads, adapter generates skills/agents, the learner produces a schema-valid `restorationPayload` against an Anvil-posted `prediction.v0` intent.
10. **Specialists re-disposed** per §10.5; `examples/external-harnesses/` directory created.
11. **Default config updated** per §10.6; `jinn migrate-config` verb shipped.

The campaign-launch gate (#57 §1) is *not* acceptance for this spec — it is acceptance for Phase A.4. This spec ships the architecture that makes the campaign run.

---

*End of v0.1.*
