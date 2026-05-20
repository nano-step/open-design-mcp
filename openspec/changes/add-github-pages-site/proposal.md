Tracking: #67

## Why

`open-design-mcp` has no public-facing website. Users discover the project through GitHub or npm and read the README inline, which works but ships none of the metadata that signals an actively maintained tool — no obvious "what is this", no quick-look at the 13 tools, and no easy way to scan release history without scrolling a 500-line `CHANGELOG.md`. Sister projects under the `nano-step` org (e.g. `nano-step.github.io` itself) already follow a "small static site per repo" convention, and this repo is the only flagship one without it.

The user's explicit constraint is that the changelog **must not be hand-maintained on the site** — it must render from the canonical `CHANGELOG.md` at the repo root. Any approach that requires copy-pasting release notes is rejected by definition.

## What Changes

- **NEW** `site/` directory containing two hand-written templates (`index.html`, `changelog.html.template`) and shared assets (`styles.css`, `favicon.svg`). The templates use a deep-ink editorial-luxury aesthetic consistent with the `nano-step.github.io` source palette (`#08090a` canvas, `#10B981` emerald accent, Inter body) but adapted for documentation (system stack only — no Google Fonts dependency, no Cormorant — keep the page weight under 50 KB).
- **NEW** `scripts/build-site.mjs` — a Node script (~80 lines, ESM, dev-dependency: `marked`) that:
  1. Reads `CHANGELOG.md`
  2. Renders it to HTML via `marked` with a token renderer that adds anchor IDs to every `## [version]` heading
  3. Reads `site/changelog.html.template`, substitutes `{{CHANGELOG_CONTENT}}`, `{{BUILD_DATE}}`, `{{COMMIT_SHA}}`
  4. Reads `site/index.html` verbatim (no substitution needed — landing page is static)
  5. Copies `site/styles.css` and `site/favicon.svg` to `dist/site/`
  6. Writes `dist/site/index.html`, `dist/site/changelog.html`, `dist/site/404.html`
- **NEW** `.github/workflows/pages.yml` — runs on push to `master` and on manual dispatch:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (Node 20 per `.nvmrc`)
  3. `npm ci`
  4. `npm run build:site`
  5. `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3` (path: `dist/site/`) → `actions/deploy-pages@v4`
  - Concurrency group `pages` with `cancel-in-progress: false` (per GitHub Pages best practice — never cancel a deploy mid-flight)
  - Required permissions: `contents: read`, `pages: write`, `id-token: write`
- **NEW** `package.json` script `build:site` invoking `node scripts/build-site.mjs`. New dev-dependency `marked@^14` (stable, **zero runtime dependencies** — verified). The existing top-level `npm run build` is NOT modified — site builds are independent of the MCP server build. The `files` array gains a `"!dist/site"` exclusion entry so site assets never ship in the published npm tarball (existing entry `"dist"` would otherwise pull them in).
- **NO `.gitignore` change needed** — the existing `dist/` entry on line 2 already covers `dist/site/`.
- **MODIFIED** `README.md` — add a new "Documentation" / "Links" row near the top of the file (the README currently has **no badges block**, so T13 *creates* one) linking to `https://nano-step.github.io/open-design-mcp/` ("Website") plus the existing GitHub / npm references. No other README changes.

## Capabilities

### New Capabilities
- `pages-site`: a GitHub-Pages-deployed static site at `https://nano-step.github.io/open-design-mcp/` consisting of a landing page (`/`) and a changelog page (`/changelog`) whose content is mechanically derived from `CHANGELOG.md` at build time. Includes the build pipeline, the deploy workflow, and the convention that `CHANGELOG.md` is the single source of truth for release-history content.

### Modified Capabilities
- None. The MCP server, its 13 tools, vendor contracts, and CHANGELOG content are all untouched. This change is purely additive in the docs/distribution layer.

## Impact

- **Code (new):**
  - `site/index.html`, `site/changelog.html.template`, `site/styles.css`, `site/favicon.svg`, `site/robots.txt`
  - `scripts/build-site.mjs`
  - `.github/workflows/pages.yml`
- **Code (modified):**
  - `package.json` (one script, one devDep)
  - `.gitignore` (one line: `dist/site/`)
  - `README.md` (one badge link)
- **Vendor:** untouched.
- **Tests:** unit test `src/__tests__/build-site.test.ts` (location matters — `vitest.config.ts` includes `src/**/__tests__/**/*.test.ts` only; a `tests/` location would be silently skipped) verifies the script produces the six expected output files, that `{{CHANGELOG_CONTENT}}` substitution actually happens (no template leakage), that the rendered changelog contains an `id="0-17-0"` anchor (proof that heading-IDs are wired), that duplicate slug detection throws when present, that the rendered changelog contains exactly one `<h1>`, and that the total `dist/site/` weight is under 100 KB raw on-disk. The build script is exercised in CI via the new workflow.
- **No new runtime dependency** in the published npm package — `marked` is a **dev**-dependency only. Anyone running `npm install open-design-mcp` does not pull `marked`.
- **No vendor sync work.** `vendor/od-contracts/` is not touched.
- **Release:** unreleased / out-of-band — the site goes live on first successful workflow run; no MCP version bump needed because no shipped package contents change.

## Acceptance Criteria

1. Pushing a commit to `master` that modifies `CHANGELOG.md` (and nothing else) causes the published changelog page at `https://nano-step.github.io/open-design-mcp/changelog` to reflect the new content within one workflow run (~2 min). No human edits the site.
2. Local development reproduces the deployed output: running `npm run build:site && open dist/site/index.html` shows the landing page identical to production.
3. The published `/changelog` page renders all 47 existing version sections from `CHANGELOG.md`, each linkable by URL fragment (`#0-17-0`, `#0-16-0`, etc.).
4. The published landing page (`/`) renders the project tagline, links to GitHub + npm + the new changelog, and lists the 13 MCP tools.
5. `npm test` (existing suite) passes unchanged, and the new test `tests/build-site.test.ts` passes.
6. The site totals **≤ 100 KB raw on-disk** (HTML + CSS + favicon + 404 + robots) — measured by `fs.statSync` in the new test. Budget chosen to accommodate ~18 months of CHANGELOG growth (~2 versions/month) before re-evaluation.
7. Workflow runs only on push to `master` and on `workflow_dispatch`. Pull-request runs do NOT deploy (security: PRs from forks cannot trigger Pages deploys).
8. README badge links to the live site URL.

## Non-Goals

- **No docs page** (`/docs`) — README remains the documentation entry point for this iteration. Deferred to a follow-up.
- **No API reference generator.** No TypeDoc, no auto-generated type docs.
- **No search.** Static site, browse-and-Cmd-F.
- **No versioned changelog pages** (one page per release tag) — single `/changelog` reflecting current `master`.
- **No light-mode toggle.** Single dark theme matching the nano-step house style.
- **No custom domain.** The site is served at `nano-step.github.io/open-design-mcp/` only; CNAME work is out of scope.
- **No analytics, no cookie banner, no consent UI.** Zero tracking by design.
- **No external JavaScript and no module scripts.** A single inline `<script>` block of ≤ 30 non-blank lines is permitted (for smooth-scroll polyfill / anchor handling) with the constraint that it contains no `fetch`, `XMLHttpRequest`, `import()`, or `eval`. Build-time render means the page is fully usable and navigable with JS disabled.
- **No deploys from non-`master` branches.** Pages always reflects `master`. PR previews are out of scope.
- **No automatic README → site sync.** Landing-page content is hand-written; only the changelog is mechanically rendered.
