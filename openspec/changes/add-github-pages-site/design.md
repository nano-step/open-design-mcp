## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  push to master (any file)                                       │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  .github/workflows/pages.yml                                     │
│   1. checkout                                                    │
│   2. setup-node (20)                                             │
│   3. npm ci                                                      │
│   4. npm run build:site         ← scripts/build-site.mjs         │
│   5. upload-pages-artifact      ← dist/site/                     │
│   6. deploy-pages                                                │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  https://nano-step.github.io/open-design-mcp/                    │
│  ├─ /            (site/index.html, static)                       │
│  ├─ /changelog   (changelog.html, content from CHANGELOG.md)     │
│  └─ /404         (404.html, static)                              │
└──────────────────────────────────────────────────────────────────┘
```

The build is deterministic: same `CHANGELOG.md` + same templates → byte-identical output. The workflow is the only writer to GitHub Pages. CHANGELOG.md is the single source of truth for release-history content; the site never has its own copy.

## Why static + build-time render (vs Jekyll / client-side fetch / runtime)

Three options were considered. Build-time render won decisively.

| Option | Complexity | Page weight | Source of truth | Verdict |
|---|---|---|---|---|
| **Jekyll** | Ruby toolchain + Liquid templates + theme | ~80 KB (with default theme) | CHANGELOG must be copied or symlinked into the Jekyll source tree | Rejected — introduces Ruby into a TypeScript repo; Liquid is a third templating language to maintain |
| **Client-side fetch** | Trivial JS | ~10 KB but flash-of-empty-content | CHANGELOG.md raw URL on raw.githubusercontent.com | Rejected — depends on `raw.githubusercontent.com` reachability, CORS, and rate limits; flash-of-empty-content hurts SEO; breaks with JS disabled |
| **Build-time render (chosen)** | Node + `marked` (one dep) | ~30 KB total | `CHANGELOG.md` at repo root — read once at build | **Chosen.** Single dep, instant page, works with JS off, single source of truth |

## Build script (`scripts/build-site.mjs`)

```text
read CHANGELOG.md
  → marked() with custom heading renderer:
      h2 "[0.17.0] — 2026-05-20"  →  <h2 id="0-17-0">[0.17.0] — 2026-05-20</h2>
read site/changelog.html.template
  → substitute {{CHANGELOG_CONTENT}}, {{BUILD_DATE}}, {{COMMIT_SHA}}
  → write dist/site/changelog.html

read site/index.html
  → write dist/site/index.html (no substitution — pure static)

read site/styles.css, site/favicon.svg, site/robots.txt
  → copy verbatim to dist/site/

read site/404.html (if present, otherwise generate minimal)
  → write dist/site/404.html
```

**Heading-ID slug rule:** `## [0.17.0] — 2026-05-20` → `id="0-17-0"`. Algorithm: take the bracketed version, replace `.` with `-`, lowercase. If the heading also contains the word `Unreleased` (case-insensitive) anywhere after the bracket, append `-unreleased` to disambiguate from the released slug — so `## [0.17.0] — Unreleased` becomes `id="0-17-0-unreleased"`. This is implemented by inspecting the raw heading text in the `marked` token renderer, not by post-processing the rendered HTML.

**Why we anchor on `## [` not just `##`:** the changelog has section headers like `### Added`, `### Fixed`, `### Changed`. Only `## [version]` headings get anchor IDs to keep the URL fragments meaningful and prevent collisions.

**Duplicate-slug detection:** The build script maintains a `Set<string>` of slugs already emitted in the current run. If a slug appears twice (e.g. two `## [0.17.0] — 2026-05-20` blocks), the script throws with an error listing both heading texts and the colliding slug, exiting non-zero. This catches CHANGELOG edits that would silently produce invalid HTML (duplicate `id` attributes) before they reach production.

**Single-h1 rule:** `CHANGELOG.md` starts with `# Changelog` (line 1), which `marked` renders as `<h1>Changelog</h1>`. The page chrome in `changelog.html.template` already provides its own page-title `<h1>`. To keep exactly one `<h1>` on the rendered page (a11y + SEO requirement), the build script's renderer remaps any level-1 heading from CHANGELOG.md to a level-2 heading and any level-2 to a level-3, etc. — a uniform depth shift. The `## [version]` blocks therefore become `<h3 id="0-17-0">` in the output. This is implemented in the `marked` heading renderer, not via post-processing.

**Leading blank lines:** CHANGELOG.md currently has ~48 blank lines between the title and the first version section (likely a workflow-bot leaving release-slots open). `marked` collapses these by default — no special handling required. The build script does not pre-strip them.

## Template substitution contract

Three substitution tokens in `changelog.html.template`:

| Token | Replaced with | Example |
|---|---|---|
| `{{CHANGELOG_CONTENT}}` | Rendered HTML from CHANGELOG.md (no wrapping `<article>` — template provides that) | `<h2 id="0-17-0">...</h2>...` |
| `{{BUILD_DATE}}` | ISO date of the build, UTC, format `2026-05-20` | `2026-05-20` |
| `{{COMMIT_SHA}}` | First 7 chars of `GITHUB_SHA` env var (or `local` if unset) | `a1b2c3d` |

Substitution is **literal string replace**. No template engine. No partial-token leakage check — the tokens are unambiguous and don't collide with valid Markdown output.

**Failure mode:** if any of the three tokens remain in `dist/site/changelog.html` after build, the script throws — caught by `tests/build-site.test.ts`.

## CI workflow shape

```yaml
name: pages
on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci --ignore-scripts
      - run: npm run build:site
        env:
          GITHUB_SHA: ${{ github.sha }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist/site }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Why this exact shape:**

- Two-job split (`build` + `deploy`) follows GitHub's own [official Pages workflow template](https://github.com/actions/starter-workflows/blob/main/pages/static.yml) — diverging from it tends to fail mysteriously in the deploy step's OIDC handshake.
- `concurrency: pages, cancel-in-progress: false` — never cancel a deploy mid-flight; let the previous one finish and queue the next. Cancelling Pages deploys mid-stream is a known footgun.
- `id-token: write` is required by `actions/deploy-pages@v4` to claim the OIDC token Pages uses to verify the artifact came from this exact workflow.
- No PR trigger — Pages deploys from forks would be a security hole (a fork PR could rewrite the live site).
- `npm ci --ignore-scripts` — matches the existing `ci.yml:27` pattern. The repo's `prepare` script invokes `tsc` (the full MCP server build), which is not needed for building the static site. Skipping it saves ~10s per workflow run with no correctness impact (the site build only consumes `marked` from `node_modules`).

## Page weight budget

Raw on-disk bytes, measured by `fs.statSync` on each file in `dist/site/` and summed.

| Asset | Budget | Rationale |
|---|---|---|
| `index.html` | ≤ 12 KB | Hand-written, ≤ 30 lines inline JS, ~80 lines markup |
| `changelog.html` | ≤ 80 KB | Currently-rendered CHANGELOG.md is ~25 KB; at ~2 versions/month for 18 months → ~45 KB content + chrome |
| `styles.css` | ≤ 4 KB | Single shared stylesheet, no resets, native CSS, no preprocessing |
| `favicon.svg` | ≤ 1 KB | Inline-friendly SVG, single shape |
| `404.html`, `robots.txt` | ≤ 3 KB combined | Static |
| **Total** | **≤ 100 KB** | Re-evaluate when CHANGELOG exceeds 60 versions. |

The unit test `src/__tests__/build-site.test.ts` enforces the totals via `fs.statSync` on the build output. Budget chosen larger than the original 50 KB target after Oracle's growth-projection finding — at ~2 versions/month the original budget would breach within 12–18 months and force a rushed widening under time pressure.

## Aesthetic decisions

**Palette** (matching the canonical nano-step.github.io extract — see `brand-spec.md`):

```css
:root {
  --bg: #08090a;
  --surface: #111214;
  --fg: #f5f3ee;
  --muted: #b6b1a4;
  --accent: #10B981;
  --border: #222428;
}
```

We use the **un-translated** nano-step palette here, not the perfume-translation in `brand-spec.md`, because this is `nano-step`'s own dev tool — the source palette is correct.

**Type stack** (system-only, no Google Fonts to keep page weight down):

```css
--font-body: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
--font-mono: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
```

Display headings are styled via larger `--font-body` weight + tight letter-spacing — no separate display face. This is a docs page, not perfume.

**Component conventions:**

- Container max-width `980px`, centered, padding `0 24px`
- Section spacing `64px`
- Hairline dividers (1px `--border`), no card boxes
- No drop-shadows
- Accent used only on links and the changelog version-heading underline
- Code blocks (`<pre><code>`) on `--surface` background, mono font, 1px border, no syntax highlighting (saves ~30 KB)

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| CHANGELOG.md format changes break the heading-ID slug logic | Slug logic is tolerant: any `## [...]` heading gets some ID; only the bracketed substring is parsed. Test covers both standard `[0.17.0] — 2026-05-20` and unreleased `[0.17.0] — Unreleased` shapes. Build script throws on duplicate slugs (correctness guard, not just a test). |
| `marked` ships an XSS vector | `marked@^14` has zero runtime dependencies; no known CVEs in the v14 line. CHANGELOG.md is trusted first-party content (the agent and humans editing it have commit access to this repo), so `marked`'s default HTML passthrough is acceptable. We do not invoke `marked.use(markedXss())` or any sanitizer because the input trust model makes it unnecessary; we do also not feed user-controlled input through this build. |
| GitHub Pages deploy fails silently | `actions/deploy-pages@v4` exits non-zero on any failure; workflow status surfaces in the PR / commit checks. The Review Gate verifies the workflow ran green at least once. |
| Two pushes in quick succession cause out-of-order deploys | `concurrency: pages, cancel-in-progress: false` serializes them; latest-wins by completion order, which matches `master` HEAD by the time the last build finishes. |
| `dist/site/` accidentally ships in npm tarball | `package.json` `files` field includes `"dist"` which would pull in `dist/site/*`. Mitigation: add the literal entry `"!dist/site"` to the `files` array. Verified locally with `npm pack --dry-run` (the test asserts the negative). |
| Removing `dist/site/` from `.gitignore` accidentally commits build output | Not a real risk — `.gitignore` already has `dist/` on line 2, which covers `dist/site/`. No new gitignore entry needed. |
| `npm ci` in CI fails because someone forgot to commit `package-lock.json` updates after adding `marked` | Existing `ci.yml` runs `npm ci` on every push and would fail first; we don't add a new failure mode. |

## Why we don't need OpenSpec spec deltas under `specs/`

`specs/` is for capability deltas to **shipped product behavior** — e.g. "modify the `tools` capability". This change adds a new, isolated capability (`pages-site`) that no existing spec references. We create exactly one spec under `specs/pages-site/spec.md` describing the contract: "site exists at this URL, changelog reflects CHANGELOG.md, build is mechanical." Nothing else needs touching.

## Implementation Order (preview of tasks.md)

1. Add `marked` devDep + `build:site` script to `package.json`
2. Write `site/styles.css`, `site/index.html`, `site/favicon.svg`, `site/robots.txt`, `site/404.html`
3. Write `site/changelog.html.template`
4. Write `scripts/build-site.mjs`
5. Add `dist/site/` to `.gitignore`
6. Write `tests/build-site.test.ts`
7. Local validation: `npm run build:site` → eyeball `dist/site/index.html` and `dist/site/changelog.html`
8. Write `.github/workflows/pages.yml`
9. Add Website badge to `README.md`
10. `npm run lint && npm run typecheck && npm test && npm run build` all green
11. Push branch, open PR, watch first workflow run on the merge commit (Pages deploys only from master), verify https://nano-step.github.io/open-design-mcp/ renders.
