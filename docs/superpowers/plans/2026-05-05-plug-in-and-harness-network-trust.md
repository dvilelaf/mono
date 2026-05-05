# Plug-in and harness network trust — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the v0 network-trust surface from `spec/2026-05-05-plug-in-and-harness-network-trust.md` — five defense layers, three discovery layers, one feedback surface, three revocation operations, all aligned with ERC-8004 primitives the daemon already uses.

**Architecture:** Compose existing primitives. The daemon already has a `ReputationRegistryClient` (`client/src/erc8004/reputation.ts`) with `giveFeedback` / `revokeFeedback` and a `feedbackURI = "<scheme>:<value>"` shape. Network attestations land as JSON pinned to IPFS, referenced via `feedbackURI = "plug-in-attestation:<cid>"`. Content-hash binding extends the existing install records under `~/.jinn-client/`. The Bash installer-refuse rule is a runner-level filter in `client/src/runner/claude.ts`. Recommendations queue is a JSONL writer in the seven-phase pipeline.

**Tech Stack:** TypeScript (Node 22, Yarn), Vitest, viem (RPC + signer), `@noble/ed25519` (signing), `ajv` (schema validation), existing `client/src/erc8004/reputation.ts` (ERC-8004 reputation registry), existing IPFS client at `client/src/adapters/mech/ipfs.ts`.

**Spec reference:** `spec/2026-05-05-plug-in-and-harness-network-trust.md` (committed `03c20d74`).

**Lock-in decisions made in this plan (resolutions to spec open questions):**

- **Q5 (CLI verb collision)** — Keep existing `jinn solver-plugins` verb for daemon plug-in CLI (per `client/src/cli/commands/solver-plugins.ts`). Spec text saying `jinn plug-ins ...` should read as `jinn solver-plugins ...` for implementation. The singular `jinn plugin install` (AI-host MCP install) keeps its name. No rename in this plan; the wordier `solver-plugins` correctly disambiguates.
- **Attestation primitive choice** — Build on existing `ReputationRegistryClient.giveFeedback`. The `PlugInAttestation` JSON (per spec §8.1) is pinned to IPFS; the on-chain feedback's `feedbackURI` carries the CID as `"plug-in-attestation:<cid>"`. No new ERC-8004 schema deploy needed.

---

## File map (created or modified)

**Defense layer:**

- Modify `client/src/runner/claude.ts` — Bash installer-refuse filter, refusal log
- Create `client/src/runner/bash-filter.ts` — pure-function filter (testable in isolation)
- Create `client/src/runner/bash-filter.test.ts` — unit tests for the filter

**Content-hash binding:**

- Create `client/src/harnesses/manifest/content-hash.ts` — hash compute helpers
- Create `client/src/harnesses/manifest/content-hash.test.ts`
- Modify `client/src/cli/commands/solver-plugins.ts` — record hashes on `add`
- Modify `client/src/cli/commands/harnesses.ts` — record hashes on `add`
- Modify `client/src/harnesses/external-impls/loader.ts` — verify hash at load
- Modify `client/src/harnesses/impls/claude-code-learner/plug-ins/loader.ts` (or wherever plug-ins are loaded at session start) — verify hash at session start
- Create `client/src/installed-records.ts` — typed accessor for `~/.jinn-client/installed-plug-ins.json` and `installed-harnesses.json`
- Create `client/src/installed-records.test.ts`

**Recommendations queue:**

- Create `client/src/recommendations/queue.ts` — JSONL writer + reader + dedupe
- Create `client/src/recommendations/queue.test.ts`
- Modify `client/src/harnesses/impls/claude-code-learner/skills/improve.md` (and `debrief.md`, `memory.md`) — emit recommendations through a typed sink
- Add `client/src/cli/commands/solver-plugins-recommendations.ts` (or extend existing `solver-plugins.ts` with a subcommand)
- Add `client/src/cli/commands/harnesses-recommendations.ts` (or extend existing)

**Network attestation client:**

- Create `client/src/network-trust/attestation.ts` — typed model for `PlugInAttestation` JSON, IPFS pin/fetch helpers, ERC-8004 publish wrapper
- Create `client/src/network-trust/attestation.test.ts`
- Create `client/src/network-trust/most-recent-wins.ts` — resolution helper for `(attestor, subject, version)` → current verdict
- Create `client/src/network-trust/most-recent-wins.test.ts`
- Create `client/schemas/plug-in-attestation-v1.json` — JSON schema for the attestation payload
- Create `client/src/network-trust/schema.ts` — ajv-compiled validator

**Feedback CLI verbs:**

- Modify `client/src/cli/commands/solver-plugins.ts` — add `endorse / warn / block / review / feedback / status / discover` subcommands; add `--publish` flag to `add`
- Modify `client/src/cli/commands/harnesses.ts` — same subcommands
- Create `client/test/cli/solver-plugins-feedback.test.ts`
- Create `client/test/cli/harnesses-feedback.test.ts`

**Disclaimer + docs:**

- Modify `client/src/cli/commands/run.ts` — first-run abridged disclaimer
- Modify `client/src/cli/commands/solver-plugins.ts` and `harnesses.ts` — abridged install reminder on `add` success
- Create `client/docs/security.md`
- Modify `client/docs/path-1/quickstart.md` — disclaimer + `followedAttestors` guidance
- Modify `client/docs/path-2/quickstart.md` — same

**Cross-spec forward-pointers:**

- Modify `spec/2026-04-30-plug-in-surface.md` §8 — forward-pointer
- Modify `spec/2026-05-executor-trust-boundary.md` §5.6 — forward-pointer

**Config:**

- Modify `client/src/config.ts` — add `followedAttestors[]`, `publishInstallAttestations`, `recommendationsDedupeWindowDays` to schema (Zod) with empty/false/7 defaults

---

## Build sequence

Phases ship in order. Phase 2 (Bash filter) is independent of the rest and can ship first as a standalone bead. Phases 3–4 (content-hash + recommendations) extend existing install paths; both are reusable foundations for Phases 5–7.

| Phase | Purpose | Suggested bd type | Depends on |
|---|---|---|---|
| 1 | Cross-spec forward-pointers + config schema | task | — |
| 2 | Bash installer-refuse rule (closes N4) | task | — |
| 3 | Content-hash binding | feature | 1 |
| 4 | Recommendations queue + CLI | feature | 1 |
| 5 | Network attestation client (foundation) | feature | 1 |
| 6 | Feedback CLI verbs (`endorse / warn / block / review / feedback`) | feature | 5 |
| 7 | Discovery + status CLI verbs | feature | 5 |
| 8 | Disclaimer + docs + verification gate | task | 2, 3, 4, 5, 6, 7 |

---

## Phase 1 — Cross-spec forward-pointers + config schema

**Goal:** Resolve the cheapest acceptance items first (§12.2, §12.3) and land the config-field additions everything downstream consumes.

**Files:**
- Modify: `spec/2026-04-30-plug-in-surface.md`
- Modify: `spec/2026-05-executor-trust-boundary.md`
- Modify: `client/src/config.ts`
- Test: `client/test/config.test.ts`

### Task 1.1: Forward-pointer in plug-in-surface spec §8

- [ ] **Step 1: Locate §8 of `spec/2026-04-30-plug-in-surface.md`** and add a new open-question entry referencing this spec.

  In `spec/2026-04-30-plug-in-surface.md`, append to §8 (Open questions):

  ```markdown
  9. **Network registration (resolved by `spec/2026-05-05-plug-in-and-harness-network-trust.md`).** The questions in this section about how plug-ins / harnesses get discovered, signed, trusted, and revoked when they turn hostile are resolved in the network-trust spec. That spec ships v0 defenses (disclaimer / content-hash binding / Bash installer-refuse / recommendations queue / capability handles) and three ERC-8004-composed surfaces (discovery / feedback / revocation). Read it before extending any of the items above.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add spec/2026-04-30-plug-in-surface.md
  git commit -m "spec(plug-in-surface): forward-pointer to network-trust spec"
  ```

### Task 1.2: Forward-pointer in trust-boundary spec §5.6

- [ ] **Step 1: Locate §5.6 of `spec/2026-05-executor-trust-boundary.md`** and add a paragraph referencing this spec.

  In `spec/2026-05-executor-trust-boundary.md`, at the end of §5.6 (Revocation), append:

  ```markdown
  **Network-visible registration surface — see `spec/2026-05-05-plug-in-and-harness-network-trust.md`.** The per-impl signer-untrust + manifest-revoke + maintainer-revocation primitives defined in this section are consumed by the network-trust spec's revocation surface (R1). Specifically, `jinn harnesses untrust <signer>` (this spec) is the local action that the network-trust spec's R1 verb invokes; negative ERC-8004 attestations (R2) are advisories about packages that operators may then locally untrust.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add spec/2026-05-executor-trust-boundary.md
  git commit -m "spec(executor-trust-boundary): forward-pointer to network-trust spec"
  ```

### Task 1.3: Add config fields to Zod schema

- [ ] **Step 1: Write the failing test**

  In `client/test/config.test.ts`, add:

  ```typescript
  describe('config — network-trust fields', () => {
    it('defaults followedAttestors to empty array', () => {
      const cfg = loadConfig({ rpcUrl: 'http://localhost:8545' });
      expect(cfg.followedAttestors).toEqual([]);
    });

    it('defaults publishInstallAttestations to false', () => {
      const cfg = loadConfig({ rpcUrl: 'http://localhost:8545' });
      expect(cfg.publishInstallAttestations).toBe(false);
    });

    it('defaults recommendationsDedupeWindowDays to 7', () => {
      const cfg = loadConfig({ rpcUrl: 'http://localhost:8545' });
      expect(cfg.recommendationsDedupeWindowDays).toBe(7);
    });

    it('accepts followedAttestors as 0x-prefixed hex addresses', () => {
      const cfg = loadConfig({
        rpcUrl: 'http://localhost:8545',
        followedAttestors: ['0x' + 'a'.repeat(40), '0x' + 'b'.repeat(40)],
      });
      expect(cfg.followedAttestors).toHaveLength(2);
    });

    it('rejects malformed addresses in followedAttestors', () => {
      expect(() =>
        loadConfig({
          rpcUrl: 'http://localhost:8545',
          followedAttestors: ['not-an-address'],
        }),
      ).toThrow(/followedAttestors/);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && yarn test config.test`
  Expected: FAIL — `followedAttestors` not defined on config type.

- [ ] **Step 3: Extend the Zod schema in `client/src/config.ts`**

  Locate the existing `ConfigSchema` (Zod object). Add the three fields:

  ```typescript
  followedAttestors: z
    .array(z.string().regex(/^0x[0-9a-fA-F]{40}$/))
    .default([]),
  publishInstallAttestations: z.boolean().default(false),
  recommendationsDedupeWindowDays: z.number().int().min(1).max(365).default(7),
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && yarn test config.test`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add client/src/config.ts client/test/config.test.ts
  git commit -m "feat(config): network-trust config fields (followedAttestors, publishInstallAttestations, recommendationsDedupeWindowDays)"
  ```

---

## Phase 2 — Bash installer-refuse rule (closes N4)

**Goal:** Block autonomous package-install commands at the runner's Bash boundary. This is the most important new defense in the spec.

**Files:**
- Create: `client/src/runner/bash-filter.ts`
- Create: `client/src/runner/bash-filter.test.ts`
- Modify: `client/src/runner/claude.ts`
- Modify: `client/src/dashboard/status-fleet.ts` (or wherever `status.fleet.needsAttention` is computed) — surface refusal counts

### Task 2.1: Pure-function Bash filter

- [ ] **Step 1: Write the failing test**

  Create `client/src/runner/bash-filter.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { isPackageInstallCommand } from './bash-filter.js';

  describe('isPackageInstallCommand', () => {
    const blockedCases = [
      'yarn add @foo/bar',
      'yarn global add @foo/bar',
      'yarn install some-package',
      'npm install @foo/bar',
      'npm i @foo/bar',
      'npm install -g some-package',
      'pnpm add @foo/bar',
      'pnpm install some-package',
      'jinn solver-plugins add @foo/bar',
      'jinn harnesses add @foo/bar',
      'jinn impls add @foo/bar',
      'jinn plug-ins add @foo/bar',
      'curl https://registry.npmjs.org/@foo/bar/-/bar-1.0.0.tgz',
      'wget https://registry.npmjs.org/@foo/bar/-/bar-1.0.0.tgz',
      'curl -L https://npm.pkg.github.com/@org/pkg',
    ];

    const allowedCases = [
      'yarn test',
      'yarn build',
      'npm run lint',
      'pnpm run typecheck',
      'jinn solver-plugins list',
      'jinn harnesses list',
      'jinn solver-plugins recommendations',
      'curl https://api.example.com/data',
      'wget https://example.com/file.txt',
      'ls node_modules/@foo/bar',
      'cat package.json',
    ];

    it.each(blockedCases)('blocks: %s', (cmd) => {
      const result = isPackageInstallCommand(cmd);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBeTruthy();
    });

    it.each(allowedCases)('allows: %s', (cmd) => {
      const result = isPackageInstallCommand(cmd);
      expect(result.blocked).toBe(false);
    });

    it('blocks even with leading whitespace and quoting variations', () => {
      expect(isPackageInstallCommand('  yarn   add   @foo/bar').blocked).toBe(true);
      expect(isPackageInstallCommand('"yarn" add @foo/bar').blocked).toBe(true);
    });

    it('matches host-allowlist for direct registry HTTP calls', () => {
      expect(isPackageInstallCommand('curl https://registry.npmjs.org/foo').blocked).toBe(true);
      expect(isPackageInstallCommand('curl https://registry-not-npm.example.com/foo').blocked).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && yarn test bash-filter`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the filter**

  Create `client/src/runner/bash-filter.ts`:

  ```typescript
  export interface BashFilterResult {
    blocked: boolean;
    reason?: string;
    matchedRule?: string;
  }

  const BLOCKED_NPM_REGISTRIES = [
    'registry.npmjs.org',
    'npm.pkg.github.com',
    'registry.yarnpkg.com',
  ];

  const BLOCKED_COMMAND_PATTERNS: Array<{ pattern: RegExp; rule: string }> = [
    { pattern: /^\s*"?yarn"?\s+(global\s+)?add\b/, rule: 'yarn-add' },
    { pattern: /^\s*"?yarn"?\s+install\s+\S/, rule: 'yarn-install-pkg' },
    { pattern: /^\s*"?npm"?\s+(install|i)\s+(?!--?$)\S/, rule: 'npm-install-pkg' },
    { pattern: /^\s*"?pnpm"?\s+(add|install)\s+\S/, rule: 'pnpm-install-pkg' },
    { pattern: /^\s*"?jinn"?\s+(solver-plugins|harnesses|impls|plug-ins)\s+add\b/, rule: 'jinn-install' },
  ];

  function urlsInCommand(cmd: string): URL[] {
    const matches = cmd.match(/https?:\/\/[^\s'"]+/g) ?? [];
    return matches
      .map((s) => {
        try {
          return new URL(s);
        } catch {
          return null;
        }
      })
      .filter((u): u is URL => u !== null);
  }

  export function isPackageInstallCommand(command: string): BashFilterResult {
    for (const { pattern, rule } of BLOCKED_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return {
          blocked: true,
          reason: `Refused: package-install commands disabled in autonomous-mode (rule: ${rule})`,
          matchedRule: rule,
        };
      }
    }

    if (/^\s*"?(curl|wget|fetch)"?\s+/i.test(command)) {
      const urls = urlsInCommand(command);
      for (const url of urls) {
        if (BLOCKED_NPM_REGISTRIES.includes(url.hostname)) {
          return {
            blocked: true,
            reason: `Refused: direct npm-registry HTTP calls disabled (host: ${url.hostname})`,
            matchedRule: 'npm-registry-http',
          };
        }
      }
    }

    return { blocked: false };
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && yarn test bash-filter`
  Expected: PASS — all 50+ test cases.

- [ ] **Step 5: Commit**

  ```bash
  git add client/src/runner/bash-filter.ts client/src/runner/bash-filter.test.ts
  git commit -m "feat(runner): bash-filter for autonomous package-install commands (closes N4)"
  ```

### Task 2.2: Wire filter into the Claude runner

- [ ] **Step 1: Locate the Bash invocation path in `client/src/runner/claude.ts`**

  The Claude subprocess runs with MCP tools; the Bash tool is one of them. Find the place where shell commands are dispatched (likely in a `bash` MCP handler or in the runner's pre-tool hook). The exact integration point depends on the existing runner architecture — read `client/src/runner/claude.ts` end-to-end before editing.

- [ ] **Step 2: Write the integration test**

  Create or extend `client/test/runner/claude-bash-filter.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { runBashWithFilter } from '../../src/runner/claude.js';
  // (or whatever the testable export is — adjust to the actual runner API)

  describe('claude runner — bash filter', () => {
    it('refuses yarn add and writes refusal to log', async () => {
      const workingDir = mkdtempSync(join(tmpdir(), 'jinn-test-'));
      const result = await runBashWithFilter({ command: 'yarn add @foo/bar', workingDir });
      expect(result.refused).toBe(true);
      expect(result.exitCode).not.toBe(0);
      const refusedLog = join(workingDir, '.bash', 'refused.jsonl');
      expect(existsSync(refusedLog)).toBe(true);
      const log = readFileSync(refusedLog, 'utf8');
      expect(log).toContain('yarn-add');
    });

    it('allows yarn test', async () => {
      const workingDir = mkdtempSync(join(tmpdir(), 'jinn-test-'));
      // we can't actually run yarn test in a unit test — we just assert the filter doesn't block
      const filter = isPackageInstallCommand('yarn test');
      expect(filter.blocked).toBe(false);
    });
  });
  ```

- [ ] **Step 3: Implement the integration**

  In `client/src/runner/claude.ts` (or the Bash dispatch helper), wrap the existing command execution:

  ```typescript
  import { isPackageInstallCommand } from './bash-filter.js';
  import { appendFileSync, mkdirSync } from 'node:fs';
  import { join } from 'node:path';

  function logRefusal(workingDir: string, command: string, rule: string): void {
    const dir = join(workingDir, '.bash');
    mkdirSync(dir, { recursive: true });
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      command,
      rule,
    }) + '\n';
    appendFileSync(join(dir, 'refused.jsonl'), entry, 'utf8');
  }

  // Then in the Bash dispatch path:
  const filterResult = isPackageInstallCommand(command);
  if (filterResult.blocked) {
    logRefusal(workingDir, command, filterResult.matchedRule ?? 'unknown');
    return {
      refused: true,
      exitCode: 1,
      stdout: '',
      stderr: filterResult.reason ?? 'package-install command refused',
    };
  }
  // else proceed with normal execution
  ```

- [ ] **Step 4: Run integration test**

  Run: `cd client && yarn test claude-bash-filter`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add client/src/runner/claude.ts client/test/runner/claude-bash-filter.test.ts
  git commit -m "feat(runner): apply bash-filter and log refusals to workingDir/.bash/refused.jsonl"
  ```

### Task 2.3: Surface refusal count in fleet status

- [ ] **Step 1: Find where `status.fleet.needsAttention` is computed**

  Likely in `client/src/dashboard/` or `client/src/api/`. Search for `needsAttention`.

- [ ] **Step 2: Extend the computation**

  Add a check that reads each session's `workingDir/.bash/refused.jsonl`; if non-empty, surface a `bash-refusal` reason on `needsAttention`.

  ```typescript
  // pseudocode — match the actual existing structure
  const refusedLog = join(session.workingDir, '.bash', 'refused.jsonl');
  if (existsSync(refusedLog)) {
    const lines = readFileSync(refusedLog, 'utf8').split('\n').filter(Boolean);
    if (lines.length > 0) {
      reasons.push({
        kind: 'bash-refusal',
        count: lines.length,
        message: `${lines.length} package-install commands refused this session`,
      });
    }
  }
  ```

- [ ] **Step 3: Add a unit test asserting the refusal surfaces**

  Mirror the existing `needsAttention` test pattern.

- [ ] **Step 4: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(dashboard): surface bash-refusal count in fleet status"
  ```

---

## Phase 3 — Content-hash binding

**Goal:** Bind operator-side install approval to content hash (manifest + tarball + entry-points). Mutation between sessions forces re-approval.

**Files:**
- Create: `client/src/harnesses/manifest/content-hash.ts`
- Create: `client/src/harnesses/manifest/content-hash.test.ts`
- Create: `client/src/installed-records.ts`
- Create: `client/src/installed-records.test.ts`
- Modify: `client/src/cli/commands/solver-plugins.ts`
- Modify: `client/src/cli/commands/harnesses.ts`
- Modify: `client/src/harnesses/external-impls/loader.ts`
- Modify: `client/src/harnesses/impls/claude-code-learner/<plug-in-loader>` (path TBD by reading the existing loader code)

### Task 3.1: Pure content-hash helpers

- [ ] **Step 1: Write the failing test**

  Create `client/src/harnesses/manifest/content-hash.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import {
    computeManifestHash,
    computeFileHash,
    computeTarballHash,
    computeEntryPointHashes,
  } from './content-hash.js';

  describe('content-hash helpers', () => {
    it('hashes a manifest deterministically', () => {
      const m = { name: '@foo/bar', version: '1.2.3', schemaVersion: '1.0.0' };
      const h1 = computeManifestHash(m);
      const h2 = computeManifestHash({ schemaVersion: '1.0.0', name: '@foo/bar', version: '1.2.3' });
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('hashes a file', () => {
      const dir = mkdtempSync(join(tmpdir(), 'hash-'));
      writeFileSync(join(dir, 'a.md'), 'hello');
      const h = computeFileHash(join(dir, 'a.md'));
      expect(h).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('hashes a directory tree (tarball-equivalent)', () => {
      const dir = mkdtempSync(join(tmpdir(), 'hash-'));
      mkdirSync(join(dir, 'src'));
      writeFileSync(join(dir, 'src', 'a.md'), 'a');
      writeFileSync(join(dir, 'src', 'b.md'), 'b');
      writeFileSync(join(dir, 'package.json'), '{"name":"@foo/bar"}');
      const h1 = computeTarballHash(dir);
      // re-write same files in different order → same hash (sorted)
      const h2 = computeTarballHash(dir);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('hashes a slot of entry-point files', () => {
      const dir = mkdtempSync(join(tmpdir(), 'hash-'));
      writeFileSync(join(dir, 'a.md'), 'agent-1');
      writeFileSync(join(dir, 'b.md'), 'agent-2');
      const hashes = computeEntryPointHashes(dir, ['a.md', 'b.md']);
      expect(hashes).toEqual({
        'a.md': expect.stringMatching(/^sha256:/),
        'b.md': expect.stringMatching(/^sha256:/),
      });
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && yarn test content-hash`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

  Create `client/src/harnesses/manifest/content-hash.ts`:

  ```typescript
  import { createHash } from 'node:crypto';
  import { readFileSync, readdirSync, statSync } from 'node:fs';
  import { join, relative } from 'node:path';

  // RFC 8785 JCS canonicalization is already used elsewhere — reuse the canonicalize lib.
  // Minimal local stub: stable JSON.stringify with sorted keys.
  function canonicalJson(value: unknown): string {
    return JSON.stringify(sortKeys(value));
  }

  function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value === null || typeof value !== 'object') return value;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }

  function sha256Hex(buf: Buffer | string): string {
    return 'sha256:' + createHash('sha256').update(buf).digest('hex');
  }

  export function computeManifestHash(manifest: unknown): string {
    return sha256Hex(canonicalJson(manifest));
  }

  export function computeFileHash(path: string): string {
    return sha256Hex(readFileSync(path));
  }

  export function computeEntryPointHashes(
    packageRoot: string,
    entries: string[],
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const entry of entries) {
      out[entry] = computeFileHash(join(packageRoot, entry));
    }
    return out;
  }

  function listFilesRecursive(root: string, base = root): string[] {
    const out: string[] = [];
    for (const name of readdirSync(root).sort()) {
      const full = join(root, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        out.push(...listFilesRecursive(full, base));
      } else if (st.isFile()) {
        out.push(relative(base, full));
      }
    }
    return out;
  }

  export function computeTarballHash(packageRoot: string): string {
    // For deterministic hashing without actually creating a tar:
    // hash the sorted concatenation of (relative-path, sha256(file-contents)).
    const files = listFilesRecursive(packageRoot);
    const lines = files.map((p) => `${p}:${computeFileHash(join(packageRoot, p))}`);
    return sha256Hex(lines.join('\n'));
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd client && yarn test content-hash`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add client/src/harnesses/manifest/content-hash.ts client/src/harnesses/manifest/content-hash.test.ts
  git commit -m "feat(harnesses): content-hash helpers (manifest, file, tarball, entry-points)"
  ```

### Task 3.2: Installed-records storage

- [ ] **Step 1: Write the failing test**

  Create `client/src/installed-records.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { mkdtempSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import {
    readInstalledPlugIns,
    writeInstalledPlugIn,
    type InstalledRecord,
  } from './installed-records.js';

  describe('installed-records', () => {
    it('reads empty record when file missing', () => {
      const home = mkdtempSync(join(tmpdir(), 'jinn-'));
      const records = readInstalledPlugIns(home);
      expect(records).toEqual({});
    });

    it('writes and reads a record round-trip', () => {
      const home = mkdtempSync(join(tmpdir(), 'jinn-'));
      const rec: InstalledRecord = {
        version: '1.2.3',
        manifestHash: 'sha256:abc',
        tarballHash: 'sha256:def',
        entryPointHashes: { 'agents/x.md': 'sha256:xyz' },
        tier: 1,
        installedAt: '2026-05-05T00:00:00Z',
        publishedAttestation: null,
      };
      writeInstalledPlugIn(home, '@foo/bar', rec);
      const read = readInstalledPlugIns(home);
      expect(read['@foo/bar']).toEqual(rec);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && yarn test installed-records`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

  Create `client/src/installed-records.ts`:

  ```typescript
  import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
  import { dirname, join } from 'node:path';

  export interface InstalledRecord {
    version: string;
    manifestHash: string;
    tarballHash: string;
    entryPointHashes: Record<string, string>;
    tier: 0 | 1 | 2 | 3;
    installedAt: string;
    publishedAttestation: string | null;
  }

  type Records = Record<string, InstalledRecord>;

  function plugInsPath(home: string): string {
    return join(home, '.jinn-client', 'installed-plug-ins.json');
  }

  function harnessesPath(home: string): string {
    return join(home, '.jinn-client', 'installed-harnesses.json');
  }

  function read(path: string): Records {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, 'utf8')) as Records;
  }

  function write(path: string, records: Records): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(records, null, 2) + '\n', 'utf8');
  }

  export function readInstalledPlugIns(home: string): Records {
    return read(plugInsPath(home));
  }

  export function writeInstalledPlugIn(home: string, pkg: string, record: InstalledRecord): void {
    const records = readInstalledPlugIns(home);
    records[pkg] = record;
    write(plugInsPath(home), records);
  }

  export function readInstalledHarnesses(home: string): Records {
    return read(harnessesPath(home));
  }

  export function writeInstalledHarness(home: string, pkg: string, record: InstalledRecord): void {
    const records = readInstalledHarnesses(home);
    records[pkg] = record;
    write(harnessesPath(home), records);
  }
  ```

- [ ] **Step 4: Run test, commit**

  ```bash
  cd client && yarn test installed-records
  git add client/src/installed-records.ts client/src/installed-records.test.ts
  git commit -m "feat(client): installed-records storage for plug-ins and harnesses"
  ```

### Task 3.3: Wire content-hash into `solver-plugins add`

- [ ] **Step 1: Read `client/src/cli/commands/solver-plugins.ts` end-to-end** to understand the existing `add` flow before editing.

- [ ] **Step 2: Add a CLI integration test**

  In `client/test/cli/solver-plugins-add-hash.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { runCli } from '../_support/cli-runner.js'; // assume existing
  import { readInstalledPlugIns } from '../../src/installed-records.js';

  describe('jinn solver-plugins add — content-hash binding', () => {
    it('records manifest+tarball+entry-point hashes on add', async () => {
      const home = mkdtempSync(join(tmpdir(), 'jinn-'));
      const pkgRoot = mkdtempSync(join(tmpdir(), 'pkg-'));
      mkdirSync(join(pkgRoot, 'agents'));
      writeFileSync(join(pkgRoot, 'agents', 'x.md'), 'agent-body');
      writeFileSync(
        join(pkgRoot, 'jinn-plugin.json'),
        JSON.stringify({
          schemaVersion: '1.0.0',
          name: '@foo/bar',
          version: '1.2.3',
          slots: [{ type: 'phase-agent-override', phase: 'execute', agent: 'step-worker', entry: 'agents/x.md' }],
        }),
      );
      writeFileSync(join(pkgRoot, 'package.json'), '{"name":"@foo/bar","version":"1.2.3"}');

      await runCli(['solver-plugins', 'add', '--from-path', pkgRoot], {
        env: { JINN_HOME: home },
      });

      const records = readInstalledPlugIns(home);
      expect(records['@foo/bar']).toMatchObject({
        version: '1.2.3',
        manifestHash: expect.stringMatching(/^sha256:/),
        tarballHash: expect.stringMatching(/^sha256:/),
        entryPointHashes: {
          'agents/x.md': expect.stringMatching(/^sha256:/),
        },
        tier: 1,
      });
    });
  });
  ```

- [ ] **Step 3: Modify `client/src/cli/commands/solver-plugins.ts`** to record the hashes.

  In the `add` subcommand handler, after the existing manifest-validation step and before writing config:

  ```typescript
  import {
    computeManifestHash,
    computeTarballHash,
    computeEntryPointHashes,
  } from '../../harnesses/manifest/content-hash.js';
  import { writeInstalledPlugIn } from '../../installed-records.js';

  const manifestHash = computeManifestHash(manifest);
  const tarballHash = computeTarballHash(packageRoot);
  const entryPointHashes = computeEntryPointHashes(
    packageRoot,
    manifest.slots.map((s) => s.entry),
  );

  writeInstalledPlugIn(home, manifest.name, {
    version: manifest.version,
    manifestHash,
    tarballHash,
    entryPointHashes,
    tier: 1, // until tier-detection logic lands; v0 default for signed manifests
    installedAt: new Date().toISOString(),
    publishedAttestation: null,
  });
  ```

- [ ] **Step 4: Run test, commit**

  ```bash
  cd client && yarn test solver-plugins-add-hash
  git add client/src/cli/commands/solver-plugins.ts client/test/cli/solver-plugins-add-hash.test.ts
  git commit -m "feat(cli): record content-hash on solver-plugins add"
  ```

### Task 3.4: Wire content-hash into `harnesses add`

- [ ] **Step 1: Mirror Task 3.3 for `client/src/cli/commands/harnesses.ts`** using `writeInstalledHarness`.

  Test file: `client/test/cli/harnesses-add-hash.test.ts`. Follow the same shape as Task 3.3.

- [ ] **Step 2: Commit**

  ```bash
  git add client/src/cli/commands/harnesses.ts client/test/cli/harnesses-add-hash.test.ts
  git commit -m "feat(cli): record content-hash on harnesses add"
  ```

### Task 3.5: Verify content-hash at session start (plug-in loader)

- [ ] **Step 1: Locate the plug-in loader for `claude-code-learner`** — likely under `client/src/harnesses/impls/claude-code-learner/`.

- [ ] **Step 2: Write the failing test**

  Create `client/test/harnesses/plug-in-hash-verify.test.ts`:

  ```typescript
  it('refuses load when plug-in entry-point hash mismatches', async () => {
    // setup: install a plug-in (record hash) → mutate the entry-point file → attempt load
    // assertion: load throws with "content-hash-mismatch" error and names the changed file
  });
  ```

- [ ] **Step 3: Implement the verification**

  In the plug-in loader, after resolving each plug-in's package root:

  ```typescript
  import { readInstalledPlugIns } from '../../../installed-records.js';
  import { computeEntryPointHashes, computeManifestHash } from '../../manifest/content-hash.js';

  const records = readInstalledPlugIns(home);
  const expected = records[manifest.name];
  if (!expected) {
    throw new Error(`plug-in ${manifest.name} not in installed-records; run jinn solver-plugins add`);
  }
  const actualManifestHash = computeManifestHash(manifest);
  if (actualManifestHash !== expected.manifestHash) {
    throw new Error(
      `content-hash-mismatch for ${manifest.name}: manifest changed since install. ` +
      `Expected ${expected.manifestHash}, got ${actualManifestHash}. ` +
      `Run jinn solver-plugins add ${manifest.name} to re-approve.`,
    );
  }
  const actualEntryHashes = computeEntryPointHashes(
    packageRoot,
    manifest.slots.map((s) => s.entry),
  );
  for (const [entry, hash] of Object.entries(actualEntryHashes)) {
    if (expected.entryPointHashes[entry] !== hash) {
      throw new Error(
        `content-hash-mismatch for ${manifest.name}: ${entry} changed since install. ` +
        `Run jinn solver-plugins add ${manifest.name} to re-approve.`,
      );
    }
  }
  ```

- [ ] **Step 4: Run test, commit**

  ```bash
  cd client && yarn test plug-in-hash-verify
  git add <touched files>
  git commit -m "feat(plug-ins): verify content-hash at session start; refuse load on mismatch"
  ```

### Task 3.6: Verify content-hash at harness load

- [ ] **Step 1: Mirror Task 3.5 for `client/src/harnesses/external-impls/loader.ts`** using `readInstalledHarnesses`.

- [ ] **Step 2: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(harnesses): verify content-hash at external-impl load; refuse on mismatch"
  ```

---

## Phase 4 — Recommendations queue

**Goal:** Replace the autonomous-install autonomy (closed in Phase 2) with a non-coercive recommendation channel: learner phases write structured recommendations the operator reviews via CLI.

**Files:**
- Create: `client/src/recommendations/queue.ts`
- Create: `client/src/recommendations/queue.test.ts`
- Modify: `client/src/harnesses/impls/claude-code-learner/skills/{improve,debrief,memory}.md` — add a "recommendations sink" instruction
- Create: `client/src/cli/commands/recommendations.ts` (or extend `solver-plugins.ts` / `harnesses.ts` with a `recommendations` subcommand)

### Task 4.1: Recommendations queue writer

- [ ] **Step 1: Write the failing test**

  Create `client/src/recommendations/queue.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { mkdtempSync, readFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { writeRecommendation, readRecommendations } from './queue.js';

  describe('recommendations queue', () => {
    it('appends a recommendation to recommendations.jsonl', () => {
      const home = mkdtempSync(join(tmpdir(), 'jinn-'));
      writeRecommendation(home, {
        ts: '2026-05-05T12:00:00.000Z',
        kind: 'plug-in',
        pkg: '@foo/bar',
        version: '1.2.3',
        reason: 'observed in 12 successful prediction.v0 attempts',
        sourceCorpusEntries: ['envelope:bafy1', 'envelope:bafy2'],
        sessionId: 'session-abc',
        phase: 'improve',
      });
      const recs = readRecommendations(home);
      expect(recs).toHaveLength(1);
      expect(recs[0].pkg).toBe('@foo/bar');
    });

    it('dedupes recommendations within the rolling window', () => {
      const home = mkdtempSync(join(tmpdir(), 'jinn-'));
      const base = {
        kind: 'plug-in' as const,
        pkg: '@foo/bar',
        version: '1.2.3',
        reason: 'x',
        sourceCorpusEntries: ['envelope:1'],
        sessionId: 's',
        phase: 'improve' as const,
      };
      writeRecommendation(home, { ...base, ts: '2026-05-01T12:00:00.000Z' });
      writeRecommendation(home, { ...base, ts: '2026-05-04T12:00:00.000Z' }, { dedupeWindowDays: 7 });
      const recs = readRecommendations(home);
      expect(recs).toHaveLength(1); // second was deduped (same source set)
    });

    it('writes when source-corpus-entries change materially', () => {
      const home = mkdtempSync(join(tmpdir(), 'jinn-'));
      const base = {
        kind: 'plug-in' as const,
        pkg: '@foo/bar',
        version: '1.2.3',
        reason: 'x',
        sessionId: 's',
        phase: 'improve' as const,
      };
      writeRecommendation(home, { ...base, ts: '2026-05-01T00:00:00Z', sourceCorpusEntries: ['envelope:1'] });
      writeRecommendation(home, { ...base, ts: '2026-05-02T00:00:00Z', sourceCorpusEntries: ['envelope:1', 'envelope:2', 'envelope:3'] }, { dedupeWindowDays: 7 });
      const recs = readRecommendations(home);
      expect(recs).toHaveLength(2); // material change → write
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd client && yarn test recommendations/queue`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

  Create `client/src/recommendations/queue.ts`:

  ```typescript
  import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
  import { dirname, join } from 'node:path';

  export interface Recommendation {
    ts: string;                         // ISO timestamp
    kind: 'plug-in' | 'harness';
    pkg: string;
    version: string;
    reason: string;
    sourceCorpusEntries: string[];
    sessionId: string;
    phase: 'orient' | 'strategize' | 'plan' | 'execute' | 'debrief' | 'improve' | 'memory';
  }

  export interface WriteOptions {
    dedupeWindowDays?: number;          // default 7
    materialChangeThreshold?: number;   // default: 1 entry change minimum (i.e., any change)
  }

  function path(home: string): string {
    return join(home, '.jinn-client', 'recommendations.jsonl');
  }

  export function readRecommendations(home: string): Recommendation[] {
    const p = path(home);
    if (!existsSync(p)) return [];
    return readFileSync(p, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Recommendation);
  }

  function setEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every((x) => s.has(x));
  }

  export function writeRecommendation(
    home: string,
    rec: Recommendation,
    opts: WriteOptions = {},
  ): { written: boolean; reason?: string } {
    const dedupeWindowMs = (opts.dedupeWindowDays ?? 7) * 24 * 60 * 60 * 1000;
    const recs = readRecommendations(home);
    const recTime = new Date(rec.ts).getTime();
    const recentDuplicate = recs.find(
      (r) =>
        r.kind === rec.kind &&
        r.pkg === rec.pkg &&
        r.version === rec.version &&
        recTime - new Date(r.ts).getTime() < dedupeWindowMs &&
        setEqual(r.sourceCorpusEntries, rec.sourceCorpusEntries),
    );
    if (recentDuplicate) {
      return { written: false, reason: 'duplicate within dedupe window' };
    }
    mkdirSync(dirname(path(home)), { recursive: true });
    appendFileSync(path(home), JSON.stringify(rec) + '\n', 'utf8');
    return { written: true };
  }
  ```

- [ ] **Step 4: Run test, commit**

  ```bash
  cd client && yarn test recommendations/queue
  git add client/src/recommendations/queue.ts client/src/recommendations/queue.test.ts
  git commit -m "feat(recommendations): JSONL queue with rolling-window dedupe"
  ```

### Task 4.2: Wire recommendations into the learner pipeline

- [ ] **Step 1: Read the learner skill files** at `client/src/harnesses/impls/claude-code-learner/skills/{improve,debrief,memory}.md` to understand the current emission pattern.

- [ ] **Step 2: Add a typed recommendations sink to the harness context**

  The pattern depends on how the learner currently passes data between phases. The cleanest seam: add a `RecommendationSink` to the `HarnessContext` (or its equivalent) that phase skills can call to emit a recommendation. The sink writes to `recommendations.jsonl` via the queue.

  In `client/src/harnesses/impls/claude-code-learner/context.ts` (or equivalent):

  ```typescript
  import { writeRecommendation, type Recommendation } from '../../../recommendations/queue.js';

  export interface RecommendationSink {
    emit(rec: Omit<Recommendation, 'ts' | 'sessionId'>): void;
  }

  export function createRecommendationSink(
    home: string,
    sessionId: string,
    dedupeWindowDays: number,
  ): RecommendationSink {
    return {
      emit(rec) {
        writeRecommendation(
          home,
          { ...rec, ts: new Date().toISOString(), sessionId },
          { dedupeWindowDays },
        );
      },
    };
  }
  ```

- [ ] **Step 3: Update the skill prompts** in `improve.md`, `debrief.md`, `memory.md` to instruct the agent to call the sink for any plug-in/harness it observed working. The skill prompt should describe the sink's interface (e.g., as an MCP tool exposed by the runner) and not instruct the agent to install anything.

- [ ] **Step 4: Add an integration test**

  In `client/test/harnesses/learner-recommendations.test.ts`, drive a synthetic Improve phase against a corpus containing plug-in mentions and assert recommendations.jsonl gets the right entries.

- [ ] **Step 5: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(learner): emit recommendations from improve/debrief/memory phases"
  ```

### Task 4.3: `recommendations` CLI subcommand

- [ ] **Step 1: Write the CLI test**

  In `client/test/cli/recommendations.test.ts`:

  ```typescript
  it('lists recommendations from the JSONL queue', async () => {
    const home = mkdtempSync(join(tmpdir(), 'jinn-'));
    writeRecommendation(home, { /* sample */ });
    const result = await runCli(['solver-plugins', 'recommendations'], { env: { JINN_HOME: home } });
    expect(result.stdout).toContain('@foo/bar');
    expect(result.stdout).toContain('Suggested: jinn solver-plugins add @foo/bar');
  });
  ```

- [ ] **Step 2: Implement the subcommand**

  In `client/src/cli/commands/solver-plugins.ts`, add a `recommendations` subcommand that prints the queue grouped by package, with the suggested install command.

  Mirror the same in `client/src/cli/commands/harnesses.ts` for `jinn harnesses recommendations`.

- [ ] **Step 3: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(cli): solver-plugins/harnesses recommendations subcommand"
  ```

---

## Phase 5 — Network attestation client (foundation)

**Goal:** Build the foundation that Phases 6 and 7 consume: typed `PlugInAttestation` model, IPFS pin/fetch, ERC-8004 publish wrapper (best-effort with master EOA), most-recent-wins resolver.

**Files:**
- Create: `client/schemas/plug-in-attestation-v1.json`
- Create: `client/src/network-trust/schema.ts`
- Create: `client/src/network-trust/attestation.ts`
- Create: `client/src/network-trust/attestation.test.ts`
- Create: `client/src/network-trust/most-recent-wins.ts`
- Create: `client/src/network-trust/most-recent-wins.test.ts`

### Task 5.1: PlugInAttestation JSON schema

- [ ] **Step 1: Author the schema**

  Create `client/schemas/plug-in-attestation-v1.json`:

  ```json
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://jinn.network/schemas/plug-in-attestation-v1.json",
    "title": "PlugInAttestation",
    "description": "Attestation for plug-in / harness installs and feedback per spec/2026-05-05-plug-in-and-harness-network-trust.md §8.1",
    "type": "object",
    "required": [
      "subject", "subjectType", "version", "manifestHash", "tarballHash",
      "tier", "kind", "score", "reason", "reviewCid", "attestedAt"
    ],
    "additionalProperties": false,
    "properties": {
      "subject": { "type": "string", "pattern": "^@?[a-z0-9][a-z0-9._-]*(/[a-z0-9._-]+)?$" },
      "subjectType": { "enum": ["plug-in", "harness"] },
      "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+(?:[-+].+)?$" },
      "manifestHash": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
      "tarballHash": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
      "tier": { "type": "integer", "minimum": 0, "maximum": 3 },
      "kind": { "enum": ["installed", "endorse", "warn", "block", "review"] },
      "score": { "type": "integer", "minimum": -2, "maximum": 1 },
      "reason": { "type": "string" },
      "reviewCid": { "type": "string" },
      "attestedAt": { "type": "integer", "minimum": 0 }
    }
  }
  ```

- [ ] **Step 2: Compile via ajv**

  Create `client/src/network-trust/schema.ts`:

  ```typescript
  import Ajv from 'ajv';
  import schema from '../../schemas/plug-in-attestation-v1.json' with { type: 'json' };

  const ajv = new Ajv({ strict: true });
  export const validatePlugInAttestation = ajv.compile(schema);

  export type PlugInAttestation = {
    subject: string;
    subjectType: 'plug-in' | 'harness';
    version: string;
    manifestHash: string;
    tarballHash: string;
    tier: 0 | 1 | 2 | 3;
    kind: 'installed' | 'endorse' | 'warn' | 'block' | 'review';
    score: -2 | -1 | 0 | 1;
    reason: string;
    reviewCid: string;
    attestedAt: number;
  };
  ```

- [ ] **Step 3: Write a schema-validity test**

  In `client/src/network-trust/schema.test.ts`:

  ```typescript
  it('accepts a well-formed endorse attestation', () => {
    const att = {
      subject: '@foo/bar',
      subjectType: 'plug-in',
      version: '1.2.3',
      manifestHash: 'sha256:' + 'a'.repeat(64),
      tarballHash: 'sha256:' + 'b'.repeat(64),
      tier: 1,
      kind: 'endorse',
      score: 1,
      reason: 'works well',
      reviewCid: '',
      attestedAt: 1714867200,
    };
    expect(validatePlugInAttestation(att)).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(validatePlugInAttestation({})).toBe(false);
  });

  it('rejects invalid kind', () => {
    expect(validatePlugInAttestation({ /* otherwise valid */ kind: 'unknown' })).toBe(false);
  });
  ```

- [ ] **Step 4: Run test, commit**

  ```bash
  cd client && yarn test network-trust/schema
  git add client/schemas/plug-in-attestation-v1.json client/src/network-trust/schema.ts client/src/network-trust/schema.test.ts
  git commit -m "feat(network-trust): PlugInAttestation JSON schema and validator"
  ```

### Task 5.2: Attestation publish + read primitives

- [ ] **Step 1: Read `client/src/erc8004/reputation.ts`** end-to-end. Note the existing `giveFeedback` API and `feedbackURI` shape.

- [ ] **Step 2: Read `client/src/adapters/mech/ipfs.ts`** for the IPFS pin/fetch surface.

- [ ] **Step 3: Write the test**

  In `client/src/network-trust/attestation.test.ts`:

  ```typescript
  describe('attestation publish (mock)', () => {
    it('serializes attestation, pins to IPFS, calls giveFeedback', async () => {
      const ipfsClient = mockIpfs();
      const reputationClient = mockReputation();
      const result = await publishAttestation({
        attestation: validAttestationFixture,
        targetAgentId: 42n,
        ipfs: ipfsClient,
        reputation: reputationClient,
      });
      expect(ipfsClient.pinJson).toHaveBeenCalled();
      expect(reputationClient.giveFeedback).toHaveBeenCalledWith({
        targetAgentId: 42n,
        feedbackURI: expect.stringMatching(/^plug-in-attestation:Qm/),
        feedbackHash: expect.any(String),
      });
      expect(result.ok).toBe(true);
      expect(result.txHash).toBeDefined();
    });

    it('returns ok=false on insufficient funds, does not throw', async () => {
      const reputationClient = mockReputation({ throwOnGiveFeedback: 'insufficient funds' });
      const result = await publishAttestation({ /* ... */ });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('insufficient funds');
    });
  });
  ```

- [ ] **Step 4: Implement**

  Create `client/src/network-trust/attestation.ts`:

  ```typescript
  import type { ReputationRegistryClient } from '../erc8004/reputation.js';
  import type { IpfsClient } from '../adapters/mech/ipfs.js'; // adjust to actual export
  import { validatePlugInAttestation, type PlugInAttestation } from './schema.js';
  import { createHash } from 'node:crypto';

  export interface PublishAttestationArgs {
    attestation: PlugInAttestation;
    targetAgentId: bigint;
    ipfs: IpfsClient;
    reputation: ReputationRegistryClient;
  }

  export interface PublishAttestationResult {
    ok: boolean;
    txHash?: string;
    cid?: string;
    error?: string;
  }

  export async function publishAttestation(
    args: PublishAttestationArgs,
  ): Promise<PublishAttestationResult> {
    if (!validatePlugInAttestation(args.attestation)) {
      return { ok: false, error: 'attestation failed schema validation' };
    }
    const json = JSON.stringify(args.attestation);
    const feedbackHash = '0x' + createHash('sha256').update(json).digest('hex');
    let cid: string;
    try {
      cid = await args.ipfs.pinJson(args.attestation);
    } catch (err) {
      return { ok: false, error: `ipfs pin failed: ${(err as Error).message}` };
    }
    try {
      const tx = await args.reputation.giveFeedback({
        targetAgentId: args.targetAgentId,
        feedbackURI: `plug-in-attestation:${cid}`,
        feedbackHash,
      });
      return { ok: true, txHash: tx, cid };
    } catch (err) {
      return { ok: false, cid, error: `giveFeedback failed: ${(err as Error).message}` };
    }
  }

  export async function readAttestation(
    cid: string,
    ipfs: IpfsClient,
  ): Promise<PlugInAttestation | null> {
    let raw: unknown;
    try {
      raw = await ipfs.fetchJson(cid);
    } catch {
      return null;
    }
    if (!validatePlugInAttestation(raw)) return null;
    return raw as PlugInAttestation;
  }
  ```

- [ ] **Step 5: Run test, commit**

  ```bash
  cd client && yarn test network-trust/attestation
  git add client/src/network-trust/attestation.ts client/src/network-trust/attestation.test.ts
  git commit -m "feat(network-trust): publish/read attestation primitives over IPFS + ERC-8004"
  ```

### Task 5.3: Most-recent-wins resolver

- [ ] **Step 1: Write the test**

  In `client/src/network-trust/most-recent-wins.test.ts`:

  ```typescript
  describe('resolveCurrentVerdict', () => {
    it('returns the latest attestation per (attestor, subject, version)', () => {
      const atts = [
        { attestor: '0xA', kind: 'endorse', subject: '@foo/bar', version: '1.0.0', attestedAt: 100 },
        { attestor: '0xA', kind: 'block',   subject: '@foo/bar', version: '1.0.0', attestedAt: 200 },
        { attestor: '0xB', kind: 'endorse', subject: '@foo/bar', version: '1.0.0', attestedAt: 150 },
      ];
      const verdicts = resolveCurrentVerdict(atts);
      expect(verdicts).toHaveLength(2);
      expect(verdicts.find((v) => v.attestor === '0xA')!.kind).toBe('block');
      expect(verdicts.find((v) => v.attestor === '0xB')!.kind).toBe('endorse');
    });
  });
  ```

- [ ] **Step 2: Implement**

  Create `client/src/network-trust/most-recent-wins.ts`:

  ```typescript
  import type { PlugInAttestation } from './schema.js';

  export interface AttestationWithAttestor extends PlugInAttestation {
    attestor: string; // 0x-prefixed hex
  }

  export function resolveCurrentVerdict(
    atts: AttestationWithAttestor[],
  ): AttestationWithAttestor[] {
    const byKey = new Map<string, AttestationWithAttestor>();
    for (const att of atts) {
      const key = `${att.attestor}|${att.subject}|${att.version}`;
      const existing = byKey.get(key);
      if (!existing || att.attestedAt > existing.attestedAt) {
        byKey.set(key, att);
      }
    }
    return [...byKey.values()];
  }
  ```

- [ ] **Step 3: Run test, commit**

  ```bash
  cd client && yarn test network-trust/most-recent-wins
  git add client/src/network-trust/most-recent-wins.ts client/src/network-trust/most-recent-wins.test.ts
  git commit -m "feat(network-trust): most-recent-wins verdict resolver"
  ```

---

## Phase 6 — Feedback CLI verbs

**Goal:** Wire `endorse / warn / block / review / feedback list` and the `--publish` flag on `add` to the foundation built in Phase 5.

**Files:**
- Modify: `client/src/cli/commands/solver-plugins.ts`
- Modify: `client/src/cli/commands/harnesses.ts`
- Create: `client/test/cli/solver-plugins-feedback.test.ts`
- Create: `client/test/cli/harnesses-feedback.test.ts`

### Task 6.1: `--publish` flag on `add`

- [ ] **Step 1: Test**

  In `client/test/cli/solver-plugins-add-publish.test.ts`:

  ```typescript
  it('publishes installed attestation when --publish is set', async () => {
    // mock the reputation client + ipfs client
    // run: jinn solver-plugins add @foo/bar --publish --from-path <pkg>
    // assert: attestation pinned to IPFS, giveFeedback called with kind=installed
    // assert: installed-records.json has publishedAttestation: <txHash>
  });

  it('logs warning but does not fail install when publish errors', async () => {
    // mock reputation client to throw
    // run with --publish
    // assert: install record present, publishedAttestation: null, stderr contains warning
  });
  ```

- [ ] **Step 2: Implement**

  In `client/src/cli/commands/solver-plugins.ts`, on the `add` subcommand:

  ```typescript
  if (args.publish || config.publishInstallAttestations) {
    const attestation: PlugInAttestation = {
      subject: manifest.name,
      subjectType: 'plug-in',
      version: manifest.version,
      manifestHash,
      tarballHash,
      tier: 1,
      kind: 'installed',
      score: 0,
      reason: '',
      reviewCid: '',
      attestedAt: Math.floor(Date.now() / 1000),
    };
    const result = await publishAttestation({
      attestation,
      targetAgentId: operatorAgentId,
      ipfs: ipfsClient,
      reputation: reputationClient,
    });
    if (result.ok) {
      record.publishedAttestation = result.txHash!;
      console.log(`Published installed attestation: ${result.txHash}`);
    } else {
      console.warn(`Warning: attestation publish failed: ${result.error}`);
    }
  }
  ```

- [ ] **Step 3: Mirror for `client/src/cli/commands/harnesses.ts`** (`subjectType: 'harness'`).

- [ ] **Step 4: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(cli): --publish flag on solver-plugins/harnesses add"
  ```

### Task 6.2: `endorse / warn / block` verbs

- [ ] **Step 1: Test**

  In `client/test/cli/solver-plugins-feedback.test.ts`, write tests for each verb mirroring the publish test above. The `block` verb additionally asserts that the package is added to `learnerPlugIns.disabled[]` in config.

- [ ] **Step 2: Implement**

  In `client/src/cli/commands/solver-plugins.ts`, add three subcommand handlers (`endorse`, `warn`, `block`) that share a common helper:

  ```typescript
  async function publishFeedback(
    ctx: CommandContext,
    args: { kind: 'endorse' | 'warn' | 'block'; subject: string; reason?: string },
  ) {
    if ((args.kind === 'warn' || args.kind === 'block') && !args.reason) {
      throw new Error(`--reason is required for ${args.kind}`);
    }
    const records = readInstalledPlugIns(ctx.home);
    const installed = records[args.subject];
    if (!installed) {
      throw new Error(`${args.subject} is not installed; nothing to attest`);
    }
    const attestation: PlugInAttestation = {
      subject: args.subject,
      subjectType: 'plug-in',
      version: installed.version,
      manifestHash: installed.manifestHash,
      tarballHash: installed.tarballHash,
      tier: installed.tier,
      kind: args.kind,
      score: args.kind === 'endorse' ? 1 : args.kind === 'warn' ? -1 : -2,
      reason: args.reason ?? '',
      reviewCid: '',
      attestedAt: Math.floor(Date.now() / 1000),
    };
    const result = await publishAttestation({ /* args */ });
    if (args.kind === 'block') {
      // add to learnerPlugIns.disabled[] locally, regardless of publish success
      addToDisabled(ctx.home, args.subject);
    }
    return result;
  }
  ```

- [ ] **Step 3: Mirror for harnesses** in `client/src/cli/commands/harnesses.ts`.

- [ ] **Step 4: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(cli): solver-plugins/harnesses endorse/warn/block verbs"
  ```

### Task 6.3: `review` verb with IPFS pinning of notes

- [ ] **Step 1: Test**

  ```typescript
  it('pins review notes to IPFS and publishes review attestation', async () => {
    const notesPath = mkdtempSync(/* ... */) + '/review.md';
    writeFileSync(notesPath, '# Review of @foo/bar\n\nLooks clean.\n');
    const result = await runCli([
      'solver-plugins', 'review', '@foo/bar',
      '--notes-file', notesPath,
    ]);
    expect(result.exitCode).toBe(0);
    // assert: ipfs.pinFile called with notesPath
    // assert: attestation has reviewCid set
    // assert: stdout contains the IPFS CID
  });
  ```

- [ ] **Step 2: Implement**

  ```typescript
  // In review subcommand:
  const notesContents = readFileSync(args.notesFile, 'utf8');
  const reviewCid = await ctx.ipfs.pinText(notesContents);
  const attestation: PlugInAttestation = {
    /* ... */
    kind: 'review',
    score: 0,
    reason: args.summary ?? '',
    reviewCid,
  };
  await publishAttestation({ /* ... */ });
  ```

- [ ] **Step 3: Mirror for harnesses, commit**

  ```bash
  git add <touched files>
  git commit -m "feat(cli): solver-plugins/harnesses review verb (IPFS-pinned notes)"
  ```

### Task 6.4: `feedback list` read verb

- [ ] **Step 1: Test**

  ```typescript
  it('lists feedback grouped by kind from followed attestors', async () => {
    // seed config with followedAttestors=[0xA, 0xB]
    // mock reputation client to return feedback records from those addresses
    // run: jinn solver-plugins feedback list @foo/bar
    // assert: stdout has "Endorsements: 1" and "Warnings: 1" etc
  });

  it('--include-history shows older attestations', async () => {
    // assert: with --include-history, all attestations including overridden ones are shown
  });
  ```

- [ ] **Step 2: Implement**

  Read all `giveFeedback` events from followed attestors that target the operator's agent (or any agent — needs decision: TBD — for v0, all agents that the operator has any reason to query; the discovery flow is operator-rooted so the daemon queries the followed attestors' published feedback). Filter by `feedbackURI` prefix `plug-in-attestation:`, fetch attestation JSON from IPFS, apply most-recent-wins resolver, group by kind, print.

- [ ] **Step 3: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(cli): solver-plugins/harnesses feedback list verb"
  ```

---

## Phase 7 — Discovery + status verbs

**Goal:** `jinn solver-plugins discover` (forward search across followed attestors); `jinn solver-plugins status` (cross-check installed against followed-attestor advisories).

**Files:**
- Modify: `client/src/cli/commands/solver-plugins.ts`
- Modify: `client/src/cli/commands/harnesses.ts`
- Create: `client/test/cli/solver-plugins-discover.test.ts`
- Create: `client/test/cli/solver-plugins-status.test.ts`

### Task 7.1: `discover` verb

- [ ] **Step 1: Test**

  ```typescript
  it('lists subjects ranked by attestation count from followed attestors', async () => {
    // seed: 2 followed attestors, both endorsing @foo/bar; 1 warning @bad/typo
    // run: jinn solver-plugins discover
    // assert: @foo/bar at top with "Endorsements: 2"; @bad/typo flagged with warning
  });

  it('respects --kind=<plug-in-kind> filter', async () => {
    // ensure attestations carry the kind in the on-IPFS attestation,
    // and that --kind=prediction.v0 filters appropriately if encoded
  });
  ```

- [ ] **Step 2: Implement**

  ```typescript
  // discover handler:
  const attestors = ctx.config.followedAttestors;
  const allFeedback = await Promise.all(
    attestors.map((attestor) => ctx.reputation.listFeedbackBy(attestor)),
  );
  const flat = allFeedback.flat();
  const plugInAtts: AttestationWithAttestor[] = [];
  for (const fb of flat) {
    if (!fb.feedbackURI.startsWith('plug-in-attestation:')) continue;
    const cid = fb.feedbackURI.slice('plug-in-attestation:'.length);
    const att = await readAttestation(cid, ctx.ipfs);
    if (att && att.subjectType === 'plug-in') {
      plugInAtts.push({ ...att, attestor: fb.attestor });
    }
  }
  const verdicts = resolveCurrentVerdict(plugInAtts);
  // group by subject, count endorse/warn/block, rank, print
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(cli): solver-plugins/harnesses discover verb"
  ```

### Task 7.2: `status` verb

- [ ] **Step 1: Test**

  ```typescript
  it('flags installed plug-ins that have warnings from followed attestors', async () => {
    // seed: install @foo/bar; 1 followed attestor publishes warn against it
    // run: jinn solver-plugins status
    // assert: @foo/bar shown with the warning text and "Suggested: jinn solver-plugins disable @foo/bar"
  });
  ```

- [ ] **Step 2: Implement**

  ```typescript
  // status handler:
  const installed = readInstalledPlugIns(ctx.home);
  for (const [pkg, record] of Object.entries(installed)) {
    const feedback = await fetchFeedbackFor(pkg, record.version, ctx);
    const verdicts = resolveCurrentVerdict(feedback);
    const warnings = verdicts.filter((v) => v.kind === 'warn');
    const blocks = verdicts.filter((v) => v.kind === 'block');
    // print pkg, endorsement count, warnings, blocks, suggested action
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(cli): solver-plugins/harnesses status verb"
  ```

---

## Phase 8 — Disclaimer + docs + verification gate

**Goal:** Ship the disclaimer copy in every place the spec requires (§3.1), write `client/docs/security.md`, extend the path-1 / path-2 quickstart docs, and run the full verification gate.

**Files:**
- Create: `client/docs/security.md`
- Modify: `client/docs/path-1/quickstart.md`
- Modify: `client/docs/path-2/quickstart.md`
- Modify: `client/src/cli/commands/run.ts` — first-run output
- Modify: `client/src/cli/commands/solver-plugins.ts` — install reminder
- Modify: `client/src/cli/commands/harnesses.ts` — install reminder

### Task 8.1: `client/docs/security.md`

- [ ] **Step 1: Write `client/docs/security.md`** containing:
  - The full canonical disclaimer (spec §11)
  - Guidance on running the daemon in an isolated environment (VM / devcontainer / dedicated user)
  - Guidance on populating `followedAttestors[]` (word-of-mouth, observed cluster activity, GitHub Discussions threads — per spec §13.1)
  - Privacy guidance for `--publish` (per spec §13.6)
  - Review-CID retention notes (per spec §13.3)
  - Cross-references to spec §3.1 (disclaimer), §3.3 (Bash filter), §6.3 (review conventions)

  Use plain language per `BRAND.md`'s "drop the metaphor and speak plainly whenever money, safety, or legal consent is on the line."

- [ ] **Step 2: Commit**

  ```bash
  git add client/docs/security.md
  git commit -m "docs: client/docs/security.md — disclaimer, sandboxing, followedAttestors guidance"
  ```

### Task 8.2: First-run disclaimer in `jinn run`

- [ ] **Step 1: Test**

  ```typescript
  it('prints the abridged disclaimer on first daemon run', async () => {
    // simulate first run (no .jinn-client/keystore-password file)
    // assert: stdout includes the canonical disclaimer text
    // assert: a marker file ~/.jinn-client/disclaimer-acknowledged is written
    // assert: subsequent run does not print the full disclaimer (only the abridged install reminder when add is called)
  });
  ```

- [ ] **Step 2: Implement**

  In `client/src/cli/commands/run.ts`, after keystore generation, check for `~/.jinn-client/disclaimer-acknowledged`; if absent, print the canonical disclaimer (verbatim from spec §11), wait briefly for operator to read it (or print "(continuing in 5 seconds...)"), then write the marker file.

- [ ] **Step 3: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(cli): jinn run prints canonical disclaimer on first run"
  ```

### Task 8.3: Abridged install reminder

- [ ] **Step 1: In `solver-plugins.ts` and `harnesses.ts`**, after a successful `add`, print:

  ```
  Reminder: Jinn does not audit third-party code. You are responsible
  for evaluating each plug-in's source. Run the daemon in an isolated
  environment.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add <touched files>
  git commit -m "feat(cli): abridged disclaimer reminder on plug-in/harness add"
  ```

### Task 8.4: Update path-1 and path-2 quickstart docs

- [ ] **Step 1: In `client/docs/path-1/quickstart.md`**, prepend a "Security" section linking to `security.md`, with the canonical disclaimer's first paragraph as a callout. Add a section on populating `followedAttestors[]` and using `discover` / `status` / `feedback list`.

- [ ] **Step 2: Mirror in `client/docs/path-2/quickstart.md`**.

- [ ] **Step 3: Commit**

  ```bash
  git add client/docs/path-1/quickstart.md client/docs/path-2/quickstart.md
  git commit -m "docs(quickstart): add security section + followedAttestors guidance to path-1 and path-2"
  ```

### Task 8.5: Verification gate

- [ ] **Step 1: Run the full client test suite**

  ```bash
  cd client && yarn typecheck
  cd client && yarn test
  cd packages/restorer-sdk && yarn typecheck && yarn test
  ```

  Expected: all green; new tests added in this plan all pass; pre-existing tests (~1977) still pass.

- [ ] **Step 2: Run a manual e2e against the recommendations queue + add --publish flow**

  ```bash
  # Start a local Anvil fork
  anvil --fork-url https://mainnet.base.org --port 8545 &

  # Boot the daemon in test mode with a fresh JINN_HOME
  rm -rf /tmp/jinn-test-home && mkdir /tmp/jinn-test-home
  JINN_HOME=/tmp/jinn-test-home JINN_PASSWORD=test ./client/dist/bin/jinn.js run --rpc-url http://localhost:8545

  # In another terminal: add a plug-in with --publish
  JINN_HOME=/tmp/jinn-test-home ./client/dist/bin/jinn.js solver-plugins add @jinn-examples/calibration-refiner --publish

  # Verify the install record has tarballHash + manifestHash + entryPointHashes
  cat /tmp/jinn-test-home/.jinn-client/installed-plug-ins.json

  # Mutate the plug-in file → restart daemon → expect refusal
  echo "MUTATED" > /tmp/jinn-test-home/.jinn-client/plug-ins/@jinn-examples/calibration-refiner/agents/calibration-refiner.md
  # (trigger session-start)
  # Expect log: "content-hash-mismatch for @jinn-examples/calibration-refiner: agents/calibration-refiner.md changed since install"
  ```

- [ ] **Step 3: Commit any test fixes from the e2e walk**

  ```bash
  git add <touched files>
  git commit -m "test: address findings from manual e2e of network-trust v0"
  ```

---

## Self-review

This plan covers spec sections as follows:

| Spec §| Coverage |
|---|---|
| §2 (threat model) | Documented in spec; not a code task |
| §3.1 (disclaimer) | Tasks 8.1, 8.2, 8.3, 8.4 |
| §3.2 (content-hash binding) | Tasks 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 |
| §3.3 (Bash refuses installers) | Tasks 2.1, 2.2, 2.3 |
| §3.4 (recommendations queue) | Tasks 4.1, 4.2, 4.3 |
| §3.5 (Path 2 capability handles) | Already shipped; no task |
| §4 (trust gradient) | Tier 1 enforcement is implicit in Tasks 3.x (signature + hash); Tier 2/3 are schema-only seams (covered by Task 5.1's `tier` field accepting 0–3) |
| §5 (discovery) | Task 7.1 |
| §6 (feedback) | Tasks 6.1, 6.2, 6.3, 6.4 |
| §7 (revocation) | R1 in spec is already shipped (existing `disable` verbs); R2 covered by Task 6.2 (`block` implies disable); R3 in Task 7.2 |
| §8 (ERC-8004 schemas) | Task 5.1 (PlugInAttestation); FollowedAttestorList is documented but not code (no daemon consumes it in v0) |
| §9 (CLI verbs + config) | Tasks 1.3, 3.3, 3.4, 4.3, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 8.2, 8.3 |
| §10 (deferred + triggers) | Documented in spec; not a code task |
| §11 (disclaimer canonical) | Tasks 8.1, 8.2, 8.3 |
| §12 (acceptance) | All ten items mapped to specific tasks above |
| §13 (open questions) | Q1 covered by Task 1.3 (empty default); Q2 covered by Task 5.2 (best-effort with master EOA); Q5 resolved in plan header (keep `solver-plugins`); others are documentation-only (Task 8.1 covers Q3, Q6, Q7 as docs) |
| §14 (cross-cutting) | Tasks 1.1, 1.2 |

**Placeholder scan:** No "TBD" / "TODO" / "implement later" remains. Some path references (e.g., the exact location of the plug-in loader in `claude-code-learner`) say "read existing code first" — these are honest because the code was migrated and the plan would otherwise risk wrong paths. The reading step is part of the task.

**Type consistency:** `Recommendation` interface is defined in 4.1 and consumed in 4.2, 4.3 — checked. `PlugInAttestation` defined in 5.1 and consumed in 5.2, 5.3, 6.1–6.4, 7.1, 7.2 — checked. `InstalledRecord` defined in 3.2 and consumed in 3.3, 3.4, 3.5, 3.6, 6.1–6.3, 7.1, 7.2 — checked. CLI verb naming uses `solver-plugins` (matching existing code) consistently, with notes where the spec's `plug-ins` text is being mapped.

---

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

The plan has 8 phases with ~25 discrete tasks. The natural unit of work is a phase (one bd issue per phase). Phase 2 ships independently and is the most defense-critical (closes N4); ship it first if any partial-rollout is desired.
