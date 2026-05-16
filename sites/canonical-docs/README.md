# canonical-docs

Public site that renders Jinn's canonical docs — `SPEC`, `THESIS`,
`BRAND`, `GROWTH`, `GLOSSARY` — one page each, on the Jinn design
system.

## Local dev

```bash
cd sites/canonical-docs
corepack enable      # Yarn 4
yarn install
yarn dev             # http://localhost:4321 (syncs docs from repo root first)
```

`yarn dev` and `yarn build` both run `scripts/sync-docs.mjs` as a
prebuild step. The script reads the canonical `.md` files from the repo
root and writes normalised copies (with frontmatter) into
`src/content/canonical/`. The copies are gitignored.

## Production build

```bash
yarn build           # → dist/
yarn start           # serves dist/ on $PORT (defaults to 4321)
```

## Railway

Deploy via Railway pointed at this repo, root directory
`sites/canonical-docs/`. `railway.json` declares the build and start
commands; `nixpacks.toml` pins Node 22 and enables Corepack so Yarn 4
resolves. No env vars required.

## Design system

The site lifts `colors_and_type.css` and `foundations.css` from
`docs/design/jinn-design-system/project/` verbatim and adds
`prose.css` for markdown body styles. No new tokens are invented —
type, color, radii, motion all come from the system.

If the design system source changes, re-run the copy:

```bash
cp ../../docs/design/jinn-design-system/project/colors_and_type.css src/styles/
cp ../../docs/design/jinn-design-system/project/foundations.css     src/styles/
```

## Adding a doc

1. Add a row to `DOCS` in `scripts/sync-docs.mjs` (`slug`, `file`,
   `order`, `summary`).
2. Run `yarn dev` — the new page appears at `/<slug>` and in the nav.
