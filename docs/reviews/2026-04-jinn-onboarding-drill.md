# Jinn operator onboarding drill — Base Sepolia

**Date:** 2026-04-17
**Reviewer:** Claude (operator drill, npx install, Base Sepolia)
**Target surface:** `@jinn-network/client@latest` (0.1.0 on npm) and the current worktree `main`/`ale/jinn-operator-onboarding-drill`
**Working dir:** `/tmp/jinn-onboarding-drill` (fresh, clean `$HOME`)

## How this drill was run

Simulated a brand-new operator following `client/README.md`. All invocations
used `npx --yes -p @jinn-network/client@latest jinn <verb>` against a fresh
`$HOME=/tmp/jinn-onboarding-drill/home`. Transcripts are preserved under
`/tmp/jinn-onboarding-drill/logs/*.log` on the drill host. No contracts were
funded; every command was exercised as far as the unfunded path allowed, plus
behavioural probes (help, `--human`, dry runs, state introspection).

## Summary

| Severity | Count |
|---------|-------|
| Blocker | 3 |
| Major   | 6 |
| Minor   | 5 |
| Nit     | 4 |

The headline issue is that the three documented lifecycle commands — `jinn
init`, `jinn fund-requirements`, `jinn bootstrap` — silently disagree about
which master wallet exists. An operator who follows the README end-to-end
ends up being asked to fund an address that is *not* the one `jinn init`
printed, and on each subsequent invocation the keystore gets overwritten with
a new HD mnemonic (published 0.1.0). The partial fix on HEAD
(`client/src/earning/bootstrap.ts:338-352`) hydrates from the existing
keystore but is not yet in any published release, and does not repair the
core lifecycle contract between `init` and `bootstrap`.

## Findings

### Blocker-1 — `jinn init` and `jinn bootstrap` generate different master wallets in published 0.1.0

**Where:** `client/src/earning/bootstrap.ts:186-195` (published 0.1.0 dist)
vs `client/src/cli/commands/init.ts:62-70`, `client/src/earning/store.ts:15`.

**What I observed:**
1. `JINN_PASSWORD=... jinn init` → master `0x2034…a9` (writes
   `master_keystore.json`, does **not** write `earning_state.json`).
2. `JINN_PASSWORD=... jinn fund-requirements` → master `0xEd9f…92`
   (stderr: `[fleet-bootstrap] Generating new HD wallet...`, keystore
   overwritten, new `earning_state.json` created).
3. `JINN_PASSWORD=... jinn bootstrap` (on the same `$HOME`) →
   master `0x0869…94` (keystore overwritten yet again).

Every `fund-requirements` / `bootstrap` invocation calls `ensureMasterWallet`,
which in the published build takes the `generateMnemonic()` branch whenever
`earning_state.json` is missing *or* `state.master_address` is empty —
unconditionally overwriting any mnemonic `jinn init` left behind. The
operator's funded wallet from a previous session can therefore be destroyed
by a second run of `jinn bootstrap`.

**Proposed fix:**
* Short term: publish the HEAD hydration branch
  (`client/src/earning/bootstrap.ts:342-352`) as a patch release and cover it
  with a test that asserts `init` → `bootstrap` yields the same address.
* Long term: make `jinn init` write `earning_state.json` too so the state
  machine starts with a coherent record; or drop `jinn init` altogether and
  treat `jinn bootstrap --init-only` as canonical. The README quick start
  currently implies `init` is load-bearing, and it is not.

---

### Blocker-2 — README quick start contradicts `jinn init` runtime contract

**Where:** `client/README.md:19-28` vs `client/src/cli/commands/init.ts:40-52`.

The quick start block is:

```
jinn init
jinn doctor
JINN_PASSWORD=your-keystore-password jinn run
```

`jinn init` without `JINN_PASSWORD` exits **11** with
`invalid_invocation` — verified on 0.1.0 (see
`/tmp/jinn-onboarding-drill/logs/16-init-no-pw-*.log`). A new operator
copy-pastes the README and gets the error as their first experience.

**Proposed fix:** update the README block to
`JINN_PASSWORD=... jinn init` (matching the `jinn init` helpText example in
`client/src/cli/commands/init.ts:105-107`) and add a one-line explanation
that the password encrypts the mnemonic and is required.

---

### Blocker-3 — `jinn submit-intent --dry-run` renders a plan with an empty `creatorMultisig`

**Where:** `client/src/cli/commands/submit-intent.ts:73-80`.

When there is no service at step `complete`, the dry-run fallback is
literally the string `'0x'`. Output:

```json
{"dryRun":true,"description":"Would post intent 'health-check' from 0x",
 "plan":[{"id":"health-check","creatorMultisig":"0x","asset":"native","txCount":1}]}
```

This is a silent lie to the operator: the plan says "one tx, asset native"
but there is nobody to send from. It should short-circuit to a structured
`funding_required` / `bootstrap_required` envelope that tells the operator
to run `jinn bootstrap` first. As-is, a scripted caller would cache the
empty multisig in the intent cache key (`client/src/cli/commands/submit-intent.ts:11-13`
uses `getAddress(safe)`, which will actually throw on `'0x'` in a real call
— so the `--yes` path is a silent time-bomb).

**Proposed fix:** in `submit-intent.ts`, if no `service.step === 'complete'`
is found, emit an envelope with code `bootstrap_required` (or a funding
envelope if applicable) and exit non-zero, instead of rendering a placeholder
plan.

---

### Major-1 — `jinn doctor` keystore check targets the wrong filename

**Where:** `client/src/cli/commands/doctor.ts:31-45` vs
`client/src/earning/store.ts:15`.

Doctor reads `join(earningDir, 'mnemonic.keystore.json')` but the real
keystore path is `master_keystore.json`. Consequence: after `jinn init`, the
`keystore_readable` check still reports `detail: "no keystore yet (expected
on a fresh install)"` — so the operator can never confirm from `doctor`
that `init` succeeded.

**Proposed fix:** reuse the constant / helper from `FleetStateStore` instead
of hard-coding the filename. Add a regression test that snaps doctor output
after `init`.

---

### Major-2 — `jinn logs` violates the output contract (empty stdout)

**Where:** `client/src/cli/commands/logs.ts:41-58`.

`jinn logs` on a fresh install writes **zero bytes to stdout** (exit 0,
verified `wc -c = 0` on drill log `15-logs-detail.log`). Per
`client/README.md:111-114` the output contract is "JSON by default" with a
structured envelope. Empty stdout breaks scripted consumers and gives no
signal to humans either.

**Proposed fix:** emit a minimal envelope even when empty, e.g.
`{"schemaVersion":1,"generatedAt":"…","events":[],"cursor":{"next":null}}`,
matching `jinn history`. `--human` should print a one-line "no events yet"
hint. Add a test for the empty case.

---

### Major-3 — `--human` is wired only for a subset of verbs; `version` and `doctor` ignore it

**Where:** `client/src/cli/commands/version.ts`, `client/src/cli/commands/doctor.ts`.

README operator contract (`client/README.md:111-116`) says "Add `--human`
for readable terminal output". Observed today:
* `jinn version --human` → raw JSON with keys like `deployments.digest:
  "unknown"` and `tokens.bond.address`. No English-language description of
  the phase, chain, or addresses. (`logs/02-version.log`)
* `jinn doctor --human` → pretty-printed JSON only. No English remedy list.
  (`--human` invocation shown in drill transcript.)
* `jinn fund-requirements --human` *does* produce a human formatter
  (`client/src/cli/commands/fund-requirements.ts:27-41`) but it emits raw
  wei (`5000000000000000 wei, have 0 wei`) instead of ETH — hostile to the
  ops persona the flag is supposedly for.

**Proposed fix:** add human formatters for `version` (`"Jinn client 0.1.0
(phase-1b, testnet/base-sepolia). Commit: unknown."`) and `doctor`
(checklist-style with ✓ / ✗). Humanise the units in
`fund-requirements` using `formatUnits` with the resolved decimals / symbol
already present on the row.

---

### Major-4 — Operator quickstart never covers actually starting the fleet on Base Sepolia

**Where:** `client/README.md:17-28`, `client/README.md:40-70`,
`docs/phase1a-operator-runbook.md:1-215`.

The README's "Quick start" goes `init` → `doctor` → `run`. But `run`
requires a bootstrapped, funded fleet; the block never mentions
`fund-requirements`, `bootstrap`, testnet faucets, or that the daemon pauses
at `awaiting_funding`. Meanwhile `docs/phase1a-operator-runbook.md` is
written for someone *deploying* the stack themselves — it demands
Sepolia/Base Sepolia private keys, contract deploys, artifacts under
`contracts/deployment-phase1a-*.json`, etc. — which is not what a Phase 1b
operator who `npm i -g`-es the package should need (deployments are bundled
under `client/deployments/`, verified present in the installed tarball).

Result: a new operator reaches the quick start, hits the funding gate, opens
the runbook, and is told to deploy contracts. There is no "npm operator"
path in either doc. This is the largest documentation gap.

**Proposed fix:** add a short "Full onboarding on Base Sepolia (published
client)" section to `client/README.md` that lists
`init → doctor → fund-requirements → fund via faucet → bootstrap →
run → submit-intent → status`, with a pointer to
`docs/phase1a-operator-runbook.md` only for operators who want to stand up
their own stack.

---

### Major-5 — `jinn version` hard-codes `"unknown"` for commit and deployment digest on the published tarball

**Where:** drill transcript `logs/02-version.log`, build step in
`client/package.json:build` (`node scripts/write-dist-build-meta.mjs`).

Published 0.1.0 reports:

```json
"client": {"version": "0.1.0", "commit": "unknown"},
"deployments": {"digest": "unknown", "artifacts": []},
```

The artifacts list is empty even though `client/deployments/` is bundled,
and `commit` is `"unknown"` even though the package was published from a
specific git SHA. Operators cannot correlate support questions with a code
revision.

**Proposed fix:** have `scripts/write-dist-build-meta.mjs` (or the prepublish
hook) populate `commit` from `git rev-parse HEAD`, and resolve the
deployments manifest into `artifacts` at publish time. Surface them in
`jinn version`.

---

### Major-6 — README lists commands that are not in the published CLI

**Where:** `client/README.md:97-107` vs `jinn --help` on 0.1.0
(`logs/01-help.log`).

The "Actions" table lists `jinn fleet scale --to N`, `jinn fleet retire <index>`,
and `jinn withdraw --to <addr>`. On 0.1.0, `jinn --help` advertises
`fleet scale --to N` and `fleet retire <index>` — fine — but *also* quietly
omits the newly added `quickstart`, `plugin install`, `update` verbs that
exist in the HEAD source (`client/src/cli/commands/{quickstart,plugin-install,update}.ts`).
The README similarly makes no mention of the Docker quickstart path shipping
its own onboarding wrapper. A new operator searching the README for the
command they see mentioned in commits (`jinn quickstart`) will not find it.

**Proposed fix:** regenerate the command table from the `Command` registry
at build time (e.g. a `scripts/generate-cli-reference.ts`) and include it in
the README and in `jinn --help`'s footer. At minimum, update the README
table to list *every* verb the published binary accepts.

---

### Minor-1 — `jinn init` output does not mention next steps or mnemonic safety

**Where:** `client/src/cli/commands/init.ts:72-90`.

JSON result is `{"master": "0x…", "keystoreDir": "/…"}`. No hint to run
`jinn fund-requirements`, `jinn keys backup`, or warning that the password
cannot be recovered. A first-time operator has to read help for every
subsequent verb to discover the happy path.

**Proposed fix:** extend the payload with a `nextStep: { cli: "jinn
fund-requirements", purpose: "List addresses that need funding" }` (this
mirrors the envelope contract) and have the human formatter print a brief
backup warning.

---

### Minor-2 — `jinn doctor` reports `ok: true` for a missing keystore

**Where:** `client/src/cli/commands/doctor.ts:40-45`.

Because the file check uses the wrong filename (Major-1), the check can only
ever report `ok: true`. Even when the filename bug is fixed, conflating
"keystore absent" with "keystore valid" makes the `ok: true / blockingCount:
0` summary misleading. A cautious operator won't know from `doctor` alone
whether `run` will succeed.

**Proposed fix:** split the check into two — `keystore_present` (informational,
`ok` reflects existence) and `keystore_readable` (only runs if present;
attempts to decrypt with a provided password-fd, else reports `skipped`).

---

### Minor-3 — npm install spews deprecation warnings on every `npx` invocation

**Where:** client dependency tree (`ipfs-http-client`, `ipfs-core-utils`,
`ipfs-core-types`, `multicodec`, `multibase`, `cids`, `prebuild-install`).

Every documented command in the drill emitted 7 warnings as the first thing
the operator sees. This drowns the actual CLI output and makes the tool
feel abandoned.

**Proposed fix:** migrate from js-IPFS → Helia (the upstream replacement
called out in the warning) or drop the js-IPFS dependency entirely. If the
migration is large, at least prune the transitive `multicodec`/`multibase`/
`cids` pins with resolutions so the user-visible warning list drops to 2–3
lines.

---

### Minor-4 — `jinn keys backup` silently writes a plaintext mnemonic

**Where:** `client/src/cli/commands/keys-backup.ts` (file created at
`./backup.json` during drill; content was literal 12-word mnemonic with
mode 0600).

The JSON stdout only reports `{"output": "./backup.json", "words": 12}` —
there is no warning that the file contents are plaintext. The 0600 mode is
good, but the README entry (`client/README.md:107`) says
"Export mnemonic" with no caveat. An operator syncing `~/backup.json` to
Dropbox will not realise they have just uploaded their seed phrase.

**Proposed fix:** echo a stderr warning ("Mnemonic written in plaintext,
mode 0600. Treat `./backup.json` as seed material."), and/or support a
`--encrypt-with-password` flag that reuses `encryptMnemonic`.

---

### Minor-5 — `jinn bootstrap --help` shows a failure example but `jinn run` does not

**Where:** `client/src/cli/commands/bootstrap.ts:helpText`,
`client/src/cli/commands/run.ts:helpText`.

`bootstrap --help` nicely shows the `funding_required` envelope. `run`
does not — but `run` is what the README tells the operator to invoke first.
If `run` fails with a funding gate, the help text should illustrate that
path the same way.

**Proposed fix:** mirror the failure-example block into `run` (and
`submit-intent`, which can also fail with funding/bootstrap gates).

---

### Nit-1 — `jinn` help omits `quickstart`, `plugin install`, `update` even when the binary ships them

**Where:** `client/src/cli/help.ts` or wherever verbs are enumerated.

The help page lists curated verbs; the source tree has more. Either the help
text should enumerate everything (preferred — use the same command registry
the dispatcher uses) or out-of-band verbs should be marked "experimental"
so operators know they exist.

---

### Nit-2 — `version.tokens.bond.symbol` and `.reward.symbol` are both `stOLAS`, but README still references OLAS/JINN

**Where:** `version` output on 0.1.0 (`logs/02-version.log`) vs
`docs/phase1a-operator-runbook.md:263-268` and `CLAUDE.md:80-86`.

The operator reads that the bond is "OLAS, 2× bond amount" and sees the
client say "stOLAS 0xAB9a01cd…" on Base Sepolia. Correct for the stOLAS
standard-staking path, but inconsistent with the legacy OLAS references
further up. At minimum the runbook should lead with `stOLAS` for Phase 1b.

---

### Nit-3 — `jinn fund-requirements` JSON envelope contains `blocks: "bootstrap"` but no `blocks: "run"` / `"submit-intent"` rows are emitted pre-bootstrap

**Where:** `client/src/cli/commands/fund-requirements.ts:124-136`.

The row only contains the master-ETH requirement. The downstream roles
(Safe bond, reward liquidity, gas for agents) never show up until those
wallets exist. That is technically correct, but operators reading the
schema see a `blocks` enum with 4 values and cannot discover — from this
command alone — what the complete funding set looks like. A `--forecast`
mode that projects all gates based on `targetServices` and the bundled
deployment would cut hours out of the onboarding.

---

### Nit-4 — Drill's fresh `$HOME` discovery: `~/.jinn-client` is documented but not surfaced on first run

**Where:** `client/README.md:121-140` (config table) and
`client/src/cli/commands/init.ts:77` (emits `keystoreDir`).

`init` prints `keystoreDir`, which is useful. But `doctor`, `status`,
`fleet`, `balance` never mention the state directory in their output. An
operator who deletes `/tmp/jinn-onboarding-drill/home` in testing cannot
tell from any inspection verb where the state lives (short of reading the
README or the env-var table). Add a `paths: {earningDir, dbPath}` stanza to
`status` / `doctor`.

---

## Minimal reproduction script

```bash
rm -rf /tmp/drill && mkdir -p /tmp/drill
HOME=/tmp/drill/home
JINN_PASSWORD=test
npx --yes -p @jinn-network/client@latest jinn init                   # master A
npx --yes -p @jinn-network/client@latest jinn fund-requirements      # master B  (different!)
npx --yes -p @jinn-network/client@latest jinn bootstrap              # master C  (different again!)
npx --yes -p @jinn-network/client@latest jinn doctor                 # reports "no keystore yet"
npx --yes -p @jinn-network/client@latest jinn logs                   # empty stdout
npx --yes -p @jinn-network/client@latest jinn submit-intent \
    --id t --description t --dry-run                                 # "Would post intent 't' from 0x"
```

## Suggested follow-up work (not done in this session)

1. Patch-release Blocker-1 from HEAD to stop the "mnemonic rotates on every
   bootstrap" behaviour in the published tarball.
2. Fix the README quick-start `JINN_PASSWORD` inconsistency (Blocker-2).
3. Land the doctor filename fix (Major-1) and empty `jinn logs` envelope
   (Major-2) together — both are one-line changes with immediate operator
   wins.
4. Carve the "Phase 1b npm-operator path" out of
   `docs/phase1a-operator-runbook.md` into a shorter `client/README.md`
   section (Major-4).
5. Publish a non-`"unknown"` commit digest in `jinn version` (Major-5) so
   support can triage reports.
