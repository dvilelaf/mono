---
title: Canonical docs site
date: 2026-05-16
author: oak (with Claude)
status: implementing
---

# Canonical docs site

## What

A small static site that renders each of Jinn's canonical docs at root —
`SPEC.md`, `THESIS.md`, `BRAND.md`, `GROWTH.md`, `GLOSSARY.md` — as one
page each, plus an index. The site lives at `sites/canonical-docs/` and
deploys to Railway.

## Why

The canonical docs are the protocol's stable sources of truth. They are
read frequently by both humans and agents but they live in a code repo,
without anchor links, without typography, without the Jinn visual
identity, and without a stable URL to cite. A public site removes that
friction and gives the docs a permanent visible home that obeys the
design system rather than GitHub's chrome.

## Scope

In:

- One page per canonical doc currently on `main`: SPEC, THESIS, BRAND,
  GROWTH, GLOSSARY.
- Landing page with a short Jinn intro and a card per doc.
- Strict obedience to `docs/design/jinn-design-system/project/` —
  tokens lifted verbatim, no new colors/type/radii invented.
- Heading anchors on rendered docs.
- Code highlighting (Shiki, Jinn-friendly theme — dark default).
- Railway deploy config.

Out:

- Search.
- Edit-on-GitHub links (cheap to add later — easy fast-follow).
- Versioning / multiple revisions.
- Auth, comments, analytics.
- Auto-deploy CI (Railway will pull from the branch directly).
- DESIGN.md as a rendered page (not in the CLAUDE.md canonical list).

## Stack

- **Astro 5** (static output) — best-in-class markdown, content collections,
  Shiki built in, zero JS by default. Restraint matches the brand.
- **`serve`** — small static-file server for the Railway runtime.
- **Yarn 4** — matches the rest of the repo (`client/` uses yarn 4.13.0).
- **Node 22** — matches the repo's pinned runtime.

## Layout

```
sites/canonical-docs/
  package.json              yarn 4, scripts: dev, build, preview, start
  astro.config.mjs          remark-gfm, rehype-slug, rehype-autolink-headings, Shiki
  tsconfig.json
  .gitignore                src/content/canonical/ (synced), dist, .astro
  railway.json              { build: yarn install && yarn build, start: yarn start }
  README.md
  scripts/
    sync-docs.mjs           copies ../../{SPEC,…}.md → src/content/canonical/*.md
                            adds frontmatter (title, slug, order, summary)
  public/
    favicon.svg             = logo-sigil.svg from design system
    sigil.svg
    wordmark.svg
  src/
    content.config.ts       canonical collection schema
    content/
      canonical/
        .gitkeep            (populated at build by sync-docs)
    styles/
      colors_and_type.css   lifted verbatim
      foundations.css       lifted verbatim
      prose.css             markdown body styles (Jinn type ramp)
    layouts/
      BaseLayout.astro      shell, nav, footer
    components/
      SiteNav.astro
      Footer.astro
      Sigil.astro
    pages/
      index.astro           landing
      [slug].astro          dynamic per-doc page
```

## How the build works

1. `prebuild` runs `node scripts/sync-docs.mjs`.
2. The script reads each canonical doc from `../../<NAME>.md`, derives a
   title (first H1 line, else the filename), strips that H1 from the body
   (the page will render the title in display type), and writes the file
   to `src/content/canonical/<slug>.md` with frontmatter:

   ```yaml
   ---
   title: <derived>
   slug: <lowercase name>
   order: <1..N>
   summary: <one-line description, from a hardcoded map>
   ---
   ```

3. Astro's `getCollection('canonical')` returns them sorted by `order`.
4. `[slug].astro` calls `getStaticPaths` over the collection and renders
   each through Astro's MD pipeline.
5. `astro build` produces `dist/`.
6. `start` runs `serve dist -l tcp://0.0.0.0:$PORT --no-clipboard`.

## Visual design — the non-negotiables

Direct from `docs/design/jinn-design-system/project/README.md` and
`SKILL.md`:

- No emoji.
- No decorative gradients (protection gradients over imagery are the
  only exception; not used on this site).
- Two type families only: Instrument Serif (display, H1, H2),
  JetBrains Mono (everything else).
- Softened-brutalism radii: 4/6/10px. No squares, no extra-large rounds.
- Hairline borders, hard offset shadows when used at all (this site
  uses none — only hairlines).
- Dark-first; light theme available via `[data-theme="light"]` (a small
  toggle in the nav).
- Selection colors honored.
- Focus: visible, sharp, no glow.

The prose stylesheet maps markdown elements to the Jinn type ramp:

- `h1` → `--text-6xl` Instrument Serif
- `h2` → `--text-4xl` Instrument Serif, with a top hairline divider
- `h3` → `--text-lg` JetBrains Mono, weight 500
- `h4` → `--text-base` JetBrains Mono, weight 600
- `p` → `--text-base` JetBrains Mono, line-height `--lh-loose`
- `code` (inline) → `--text-sm`, bg `--bg-sunken`, radius `--radius-1`
- `pre` → padded panel: `--bg-sunken`, `--radius-3`, Shiki tokens
  themed to the palette
- `blockquote` → italic Instrument Serif, accent left border
- `table` → hairline borders, monospaced cells, zebra via `--bg-elevated`
- `hr` → repurpose the design system's `hr` (already in the stylesheet)
- `a` → underline + accent, matching the baseline `a` style
- Max prose width: 72ch; centered with the nav and footer aligned to
  the same max-width.

## Railway

- Create a new Railway service pointed at the GitHub repo, branch
  `canonical-doc-site` initially (later `main`), root directory
  `sites/canonical-docs/`.
- `railway.json` declares the build and start commands so the service
  works whether Railway picks Nixpacks or honors the JSON.
- The service listens on `0.0.0.0:$PORT` — `serve` accepts both.
- No env vars required.

## Risks / known gotchas

- Astro's content collection wants files inside `src/content/`. Since
  the synced files are gitignored, fresh checkouts must run `yarn build`
  (which runs `prebuild`) before `yarn dev`. We add an explicit
  `dev: yarn sync && astro dev` so local dev does it too.
- `serve` adds a clipboard message in dev that doesn't surface on
  Railway; `--no-clipboard` is set anyway for cleanliness.
- The design system CSS is lifted, not imported. If the source changes,
  the site must be re-synced. A short follow-up bead can automate this.

## Out of scope but worth noting

- A future iteration can pull canonical docs at deploy time from `main`
  via `git archive`, eliminating drift between PR branches and the live
  site. For now, the site rebuilds each push, so the docs are always
  whatever is on the deployed branch.
- Edit-on-GitHub footer link is one PR away.
- An `og:image` per doc rendered from the wordmark + title is a nice
  cheap polish for a follow-up.
