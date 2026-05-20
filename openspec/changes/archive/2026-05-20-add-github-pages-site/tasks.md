# Tasks — add-github-pages-site

Tracking: #67
Branch: `feat/67-github-pages-changelog`
Lane: normal
Change type: user-feature

## Implementation

- [ ] **T1.** Add `marked@^14` to `devDependencies` in `package.json`; add `"build:site": "node scripts/build-site.mjs"` to scripts; add `"!dist/site"` to the `files` array (immediately after the existing `"dist"` entry) to prevent site assets from leaking into the npm tarball. Run `npm install` to update `package-lock.json`.
- [ ] **T2.** *(removed — `.gitignore` line 2 already covers `dist/site/` via `dist/`. Skip.)*
- [ ] **T3.** Write `site/styles.css` (≤ 4 KB) with the deep-ink editorial palette (`--bg`, `--surface`, `--fg`, `--muted`, `--accent`, `--border`) per design.md.
- [ ] **T4.** Write `site/favicon.svg` (≤ 1 KB) — single mark, nano-step "step" symbol or "od" wordmark, accent emerald on ink.
- [ ] **T5.** Write `site/robots.txt` allowing all crawlers (`User-agent: *` / `Allow: /`).
- [ ] **T6.** Write `site/404.html` — minimal page with same chrome, single line "Not found — head back home ↗".
- [ ] **T7.** Write `site/index.html` — landing page: hero, short paragraph, install snippet, 13-tool list, footer. Include `<meta name="description">` and minimal Open Graph tags (`og:title`, `og:description`, `og:url`). Single inline `<script>` block ≤ 30 non-blank lines (smooth-scroll only).
- [ ] **T8.** Write `site/changelog.html.template` — page chrome with `{{CHANGELOG_CONTENT}}`, `{{BUILD_DATE}}`, `{{COMMIT_SHA}}` placeholders; shared nav/header/footer with `index.html`. The chrome contains exactly one `<h1>` element (the page title); the rendered changelog content goes inside a child container that contains no `<h1>` after the build script's depth-shift.
- [ ] **T9.** Write `scripts/build-site.mjs` — ESM Node script per design.md. Must:
  - Read `CHANGELOG.md`
  - Render via `marked` with a custom renderer that:
    - Depth-shifts every heading by +1 (`h1 → h2`, `h2 → h3`, …) to keep a single `<h1>` on the page
    - Adds `id="<slug>"` to (depth-shifted) `## [version]` headings only
    - Tracks emitted slugs in a `Set<string>`; throws on duplicate
  - Substitute three template tokens; throw if any token remains in output
  - Copy static assets verbatim
  - Write all output under `dist/site/`
- [ ] **T10.** Write `src/__tests__/build-site.test.ts` (**not** `tests/` — vitest config only discovers `src/**/__tests__/**/*.test.ts`). Eight assertions:
  - All 6 expected files exist in `dist/site/`
  - `dist/site/changelog.html` contains `id="0-17-0"`
  - `dist/site/changelog.html` does NOT contain any of `{{CHANGELOG_CONTENT}}`, `{{BUILD_DATE}}`, `{{COMMIT_SHA}}`
  - Total `dist/site/` size ≤ 100 × 1024 bytes (raw on-disk)
  - `dist/site/index.html` contains the live site URL `https://nano-step.github.io/open-design-mcp/`
  - `dist/site/changelog.html` contains exactly one `<h1>` element
  - The build script throws when given a CHANGELOG with two duplicate version headings (sub-test using a temp fixture string)
  - `npm pack --dry-run` output does NOT list any `dist/site/*` path (uses `execSync` to invoke npm)
- [ ] **T11.** Verify locally: run `npm run build:site`, open `dist/site/index.html` and `dist/site/changelog.html` in a browser, confirm rendering matches design intent. Confirm `npm test` discovers + passes the new suite (sanity-check vitest globbing).
- [ ] **T12.** Write `.github/workflows/pages.yml` per the design.md shape (two jobs, minimum permissions, concurrency, no PR trigger, `npm ci --ignore-scripts`).
- [ ] **T13.** Add a new "Links" / badges row near the top of `README.md` (the README has no existing badges block — this *creates* one). Single row of three text-links: GitHub (existing), npm (existing), and `https://nano-step.github.io/open-design-mcp/` (new "Website" link).
- [ ] **T14.** **Manual prerequisite** — enable GitHub Pages in repo settings (Settings → Pages → Source: GitHub Actions). Document this in the PR body. Without this step the workflow's first run will fail at `actions/deploy-pages@v4`.

## Validation Ladder (lane:normal)

- [ ] **V1.** `npm run lint` — exit 0, zero warnings
- [ ] **V2.** `npm run typecheck` — exit 0
- [ ] **V3.** `npm test` — all suites pass **including** `src/__tests__/build-site.test.ts` (verify it's listed in the test output, not silently skipped)
- [ ] **V4.** `npm run test:integration` — passes (no changes to MCP server logic)
- [ ] **V5.** `npm run vendor:check` — passes (vendor not modified)
- [ ] **V6.** `openspec validate add-github-pages-site --strict` — exit 0

## User-Flow Test

This is a `user-feature` change (not infra/refactor/docs), so a user-flow test is required.

- [ ] **U1.** After merge to master, manually verify:
  - `https://nano-step.github.io/open-design-mcp/` loads and renders the landing page
  - `https://nano-step.github.io/open-design-mcp/changelog` loads and shows all version sections
  - Clicking a version anchor scrolls to that section
  - URL `https://nano-step.github.io/open-design-mcp/changelog#0-17-0` opens directly to v0.17.0
  - View-source confirms zero `<script src=...>` tags and exactly one `<h1>` per page
  - README link goes to the live site
- [ ] **U2.** Modify `CHANGELOG.md` (e.g. add a sentence under `[0.17.0]`), push to master, confirm the change appears on the deployed site within ~2 min.

## Review Gate

Required for `change-type: user-feature` (not exempted). Spawn fresh reviewer (≠ implementer). Reviewer verifies each acceptance criterion against evidence.

- [ ] **R1.** All AC items from `proposal.md` § Acceptance Criteria verified with cited file/line/output
- [ ] **R2.** Zero high-severity findings on final review iteration

## PR + Bot Review

- [ ] **P1.** `npm run harness:check -- add-github-pages-site --pre-merge` returns 0
- [ ] **P2.** `gh pr create --base master --title "feat(pages): add GitHub Pages site with auto-rendered changelog" --body "Closes #67 ..."`
- [ ] **P3.** Address PR bot review comments to PASS
- [ ] **P4.** Merge with `gh pr merge --squash --delete-branch`

## Close

- [ ] **C1.** Verify issue #67 auto-closed by `Closes #67`
- [ ] **C2.** Verify Pages deployed against merge commit; site is live
- [ ] **C3.** `openspec archive add-github-pages-site`
- [ ] **C4.** Update `docs/TEST_MATRIX.md` with the new test
- [ ] **C5.** Update `docs/stories/add-github-pages-site.md` evidence section
