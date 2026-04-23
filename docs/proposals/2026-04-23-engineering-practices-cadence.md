# Engineering practices, standards & cadence — design draft

> Version: 0.1 (brainstorm)
> Date: 2026-04-23
> Status: **Draft for review** — not adopted
> Purpose: align the team on how we build, review, ship, and learn — including an **AI-heavy** workflow (agents, MCP, beads).

---

## 1. Goals

- Predictable quality: every merge raises the bar, not the risk.
- Predictable rhythm: humans and agents know when things ship and what “done” means.
- AI-native: practices that **use** automation without pretending humans are optional on sensitive paths.

Non-goals in this draft: picking tools we already use (bd, Yarn, Vitest, etc.) — this doc assumes them and focuses on **how** we use them.

---

## 2. Conventional pillars (industry baseline)

### 2.1 Trunk-based habits

- Short-lived branches; default integration target is `main`.
- Prefer small PRs over long-lived feature branches (reduces merge pain and agent drift).
- Rebase or merge — pick one team default and document it (avoid mixed history without reason).

### 2.2 Definition of Done (per PR)

- [ ] `yarn typecheck` (client + contracts as applicable)
- [ ] `yarn test` (unit/integration)
- [ ] No new linter errors on touched paths
- [ ] User-visible behaviour: `CHANGELOG.md` entry (or “skip” with reason)
- [ ] Issue link: bd id in PR description; issue closed or updated when merged

### 2.3 CI as source of truth

- Required checks on `main`: typecheck, test, (optional) e2e on schedule or nightly if too slow for every push.
- Flaky test policy: quarantine with issue + deadline, never silent `it.skip` without bd reference.

### 2.4 Security & supply chain

- Lockfiles committed; `yarn install --immutable` in CI.
- Dependabot or equivalent on a cadence; critical CVEs patched out of band.
- Secrets: never in repo; agents instructed via `AGENTS.md` / rules not to echo keys.

### 2.5 Documentation ladder

- **Spec** (`spec/YYYY-MM-DD-*.md`) — normative contracts (CLI surface, protocol).
- **Proposal** (`docs/proposals/`) — options, tradeoffs, pending decisions.
- **Runbook** (`docs/runbooks/`) — operator / engineer procedures.
- **ADR** (optional `docs/adr/`) — one decision, immutable log.

---

## 3. AI-heavy workflow — practices that fit this repo

### 3.1 Human-in-the-loop gates

| Area | Agent may draft | Human (or second agent + human) |
|------|-------------------|----------------------------------|
| Refactors, tests, docs | Yes | Light review |
| Auth, keys, signing, payouts | Assist only | Required review |
| Contract changes / deploy addresses | Assist only | Required review + checklist |
| Dependency major bumps | Proposal | Review |

### 3.2 PR hygiene for agent-authored changes

- PR title + description written for **the next human in 30 seconds**: intent, scope, risks, how to verify.
- “Agent context” appendix optional: model, key prompts, beads issue id — helps auditability without cluttering the main narrative.
- Prefer **one logical change per PR**; agents tend to bundle — enforce split at review.

### 3.3 Beads (bd) as the task system of record

- No parallel TODO markdown in repo for work tracking; `bd` owns lifecycle.
- PR ↔ bd: every non-trivial PR references `jinn-mono-xxx`; close or update on merge.
- Session end protocol from `AGENTS.md`: quality gates + push — treat as team norm, not suggestion.

### 3.4 Prompt and context hygiene

- `CLAUDE.md` / `AGENTS.md` stay accurate after structural changes (agents read these first).
- Large refactors: add a short “map” in the PR or proposal so the next agent doesn’t re-derive architecture.
- Prefer **schemas and types** over prose for contracts agents must follow (Zod, OpenAPI-style JSON for CLI).

### 3.5 Testing strategy when agents write tests

- Require **one negative test** where it matters (auth failure, invalid config, malformed manifest).
- E2E (`yarn e2e`) before releases or contract changes; not necessarily every PR if cost is high — document when mandatory.

### 3.6 Cadence suggestions (pick one set in review)

**Option A — weekly ship window**

- Cut point: weekly (e.g. Thu) for anything that touches operators / contracts.
- Mid-week: merge internal refactors freely behind green CI.

**Option B — continuous**

- Merge to `main` anytime CI is green; “release” = tag or npm publish on demand.

**Option C — milestone-based**

- Align merges with beads milestones / epics (good for larger coordinated renames or protocol shifts).

---

## 4. Cadence beyond merge (team rituals)

- **Async first**: decisions in proposals + bd comments; meetings for deadlock only.
- **Retro** (monthly or per milestone): what broke in agent workflow (wrong context, bad tests, doc drift)?
- **Tech debt budget**: e.g. 10–20% of capacity per cycle for `jinn-mono-7ee`-class consolidation.

---

## 5. Open questions for Oak / team

1. **PR size**: hard cap (e.g. 400 LOC) vs guideline only?
2. **Review policy**: one approval for client-only? two for contracts + client?
3. **E2E**: required on every PR touching `adapters/mech` / daemon loops, or nightly only?
4. **Release numbering**: semver for CLI package only, or also “protocol version” in docs?
5. **Agent access**: who may merge agent-only PRs without human review (if anyone)?
6. **Incident response**: single owner rotation or best-effort for now?

---

## 6. Next steps after review

1. Mark sections as **Adopted / Rejected / Deferred** with dates.
2. Promote adopted items into `AGENTS.md` + optional `docs/engineering/README.md`.
3. Add CI checklist job or PR template in GitHub (if applicable) mirroring §2.2.

---

## References (internal)

- `AGENTS.md` / `CLAUDE.md` — agent session rules
- `spec/2026-04-14-client-surface.md` — stable CLI contract direction
- `docs/reviews/2026-04-22-architecture-audit-j75.md` — architecture follow-ups
