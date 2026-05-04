# Plan: AI/Crypto Thesis Wiki + Autonomous Jobs

**Date:** 2026-04-22
**Implementation window:** today 14:00–15:30 (switching block, 90 min cap)
**Scope discipline:** one topic only (AI/crypto thesis). Not genomics, not yield. Those are day 30+.

---

## 1. Architecture

Location: `/personal-data-store/wiki/ai-crypto-thesis/` (here). Lives inside PDS so it can reuse Postgres + pgvector for search later. Obsidian vault points at this directory.

```
ai-crypto-thesis/
  raw/                    # source material, untouched by LLM
    articles/             # web clips (Obsidian Web Clipper output)
    tweets/               # thread snapshots
    papers/               # PDFs / preprints
    images/               # referenced figures
  wiki/                   # compiled, LLM-maintained
    concepts/             # one .md per concept
    people/               # one .md per notable person/entity
    memes/                # thesis-specific: Dark Talent, value capture vs distribution, autonomous agents, personal data sovereignty
    index.md              # entry point, auto-maintained
    ROADMAP.md            # orphan concepts, open questions, lint findings
  drafts/                 # LLM output awaiting human review before filing into wiki/
  queries/                # standing questions + pre-computed answers
  scripts/
    compile.ts            # raw → wiki
    lint.ts               # integrity check
    query.ts              # ask the wiki
  CLAUDE.md               # conventions for the wiki compiler
  plan.md                 # this file
```

**Rule:** LLM writes `wiki/` and `drafts/`. Oak moves items from `drafts/` into `wiki/` after review. `raw/` is append-only.

---

## 2. Autonomous jobs (three, staggered)

All three produce output into `drafts/` or `ROADMAP.md`. None commit directly to `wiki/`. Review gate stays human.

None run during deep block (10:00 Ritsu call, 11:00 Jinn only). Schedule avoids 10:00–12:00 and 20:00–07:00.

### Job A — Compile
- **What:** scan `raw/` for new files since last run. Summarise each, extract named concepts, create or update concept pages in `wiki/concepts/`, add backlinks, update `index.md`.
- **Trigger:** daily 06:00 if new files in `raw/`. Also manually invokable.
- **Output:** new/updated pages in `drafts/`, diff report in `ROADMAP.md`.

### Job B — Lint
- **What:** walk `wiki/`. Find contradictions across pages, orphan concepts, dead backlinks, pages missing a source, claims without citations. Append findings to `ROADMAP.md`.
- **Trigger:** daily 05:30.
- **Output:** `ROADMAP.md` updated. No page edits.

### Job C — Research
- **What:** pick one top item from `ROADMAP.md` (orphan concept, missing evidence, open question). Targeted web search. Draft a new article or extend an existing one into `drafts/`.
- **Trigger:** Tue/Thu 05:00.
- **Output:** new file in `drafts/`.

All three built on the `scheduled-tasks` MCP (already available). Prompts live in `scripts/` as markdown templates.

---

## 3. Day-one implementation order (14:00, 90 min strict)

No deviation. If you finish early, stop — do not over-extend.

| Minute | Step |
|---|---|
| 0–5 | `mkdir -p raw/{articles,tweets,papers,images} wiki/{concepts,people,memes} drafts queries scripts` |
| 5–20 | Write `CLAUDE.md` for the wiki directory: compile rules, naming conventions, citation format, what goes in `raw` vs `wiki` vs `drafts` |
| 20–25 | Drop 3–5 seed sources into `raw/` (prep these before 14:00 — see §5) |
| 25–45 | Run compile by hand: ask Claude to ingest `raw/` and produce first-pass pages in `drafts/`. Review. Move 1–2 pages to `wiki/` |
| 45–50 | Open in Obsidian. Confirm backlinks render. If not, fix in CLAUDE.md |
| 50–65 | Register Job B (lint) via `scheduled-tasks`. Leave A and C for day two — lint first because it runs on what's already there |
| 65–80 | Write one anchor query into `queries/`. Run it. File the answer back |
| 80–90 | Update `ROADMAP.md` with what's left. Close. |

---

## 4. Stop conditions (dig watch)

Close the session immediately if any of these happen:

- Minute 60 and still scaffolding. Cut scope: scaffold only today, jobs tomorrow.
- You catch yourself designing the ontology (taxonomy of concept types, hierarchy schemes). The structure emerges from compilation. Don't pre-design.
- You open a second wiki (genomics, yield). No.
- You add a fourth autonomous job. Three is the cap until the first three run clean for a week.
- The work feels pleasurable rather than hard. That's dig.

---

## 5. Prep before 14:00

Do this in the morning block or over lunch — not inside the 90 min.

**Seed sources (pick 3–5):**
- One piece on autonomous agents (pick from recent reading)
- One on value capture vs distribution (the core thesis tension)
- One tweet thread — your own or someone else's you've been chewing on
- Optional: one paper, one image

Install Obsidian Web Clipper if not already. Configure output to `wiki/ai-crypto-thesis/raw/articles/`.

**Anchor question:**
Draft one standing query. Suggested: *"Across ingested sources, which argue for value accruing to model owners and which argue for value accruing to data contributors / end users? Where is the evidence strongest on each side?"*

That's day one's Q&A test.

---

## 6. What's explicitly out of scope today

- Vector search / RAG. Not until wiki > 30 articles.
- Synthetic data generation / fine-tuning. Not until wiki > 100 articles.
- A second wiki topic. Not for 30 days minimum.
- A custom search UI. Not until you've felt the pain of Obsidian search falling short.
- Typefully integration (auto-file threads into `raw/`). Day 14+.
- A live artifact dashboard showing wiki growth. Day 14+.

---

## 7. Success criteria for week one

By 2026-04-29:
- At least 10 items in `raw/`
- At least 5 concept pages in `wiki/`
- Lint job has run 6 times, produced actionable findings at least twice
- One query answered from the wiki that you couldn't have answered from memory

If any of these are missing, the system isn't working — diagnose before adding.
