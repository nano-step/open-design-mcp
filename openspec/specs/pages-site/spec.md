# pages-site Specification

## Purpose
TBD - created by archiving change add-github-pages-site. Update Purpose after archive.
## Requirements
### Requirement: Site is deployed via GitHub Actions from master

The repository SHALL ship a GitHub Actions workflow at `.github/workflows/pages.yml` that builds and deploys the static site to GitHub Pages on every push to `master` and on `workflow_dispatch`. The workflow SHALL NOT deploy from any other branch, and SHALL NOT deploy on `pull_request` events.

#### Scenario: Push to master triggers deploy

- **GIVEN** the workflow is committed and Pages is enabled in repository settings
- **WHEN** a commit lands on `master`
- **THEN** the workflow runs build + deploy jobs
- **AND** the site at `https://nano-step.github.io/open-design-mcp/` reflects the new commit within a single workflow run

#### Scenario: Pull request does not deploy

- **WHEN** a pull request is opened against `master`
- **THEN** the pages workflow SHALL NOT run any deploy job
- **AND** no artifact SHALL be uploaded to GitHub Pages

#### Scenario: Manual dispatch works

- **WHEN** an authorized user clicks "Run workflow" on the pages workflow in the GitHub UI
- **THEN** the workflow runs against `master` HEAD and produces a deploy

#### Scenario: Concurrency prevents mid-flight cancellation

- **GIVEN** a deploy is in progress
- **WHEN** a second push to `master` lands
- **THEN** the second run is queued
- **AND** the first run completes before the second starts
- **AND** neither run is cancelled

### Requirement: Changelog page is mechanically derived from CHANGELOG.md

The published page at `/changelog` SHALL be produced by reading `CHANGELOG.md` at the repository root and rendering it via the build script. No human SHALL hand-edit changelog content in any file under `site/`. The only `site/` file involved is a template containing layout chrome and a `{{CHANGELOG_CONTENT}}` placeholder.

#### Scenario: Editing CHANGELOG.md updates the site

- **GIVEN** the workflow is wired
- **WHEN** a commit modifies only `CHANGELOG.md` and pushes to `master`
- **THEN** the deployed `/changelog` page reflects the new content after the workflow completes

#### Scenario: site/ contains no copy of changelog content

- **WHEN** any file under `site/` is grep'd for the string "0.17.0" or any other version number from the current CHANGELOG
- **THEN** zero matches are found
- **AND** the template at `site/changelog.html.template` contains exactly one occurrence of the literal `{{CHANGELOG_CONTENT}}`

#### Scenario: Version headings are addressable by URL fragment

- **GIVEN** the CHANGELOG contains a heading `## [0.17.0] — 2026-05-20`
- **WHEN** the changelog page is built
- **THEN** the rendered HTML SHALL contain an `<h3 id="0-17-0">` element wrapping that heading text (level 3, not 2 — the build script depth-shifts all CHANGELOG headings by one to preserve a single page `<h1>`)
- **AND** opening `https://nano-step.github.io/open-design-mcp/changelog#0-17-0` scrolls the corresponding section into view

#### Scenario: Unreleased section gets a stable anchor

- **GIVEN** the CHANGELOG contains a heading `## [0.17.0] — Unreleased`
- **WHEN** the changelog page is built
- **THEN** the rendered HTML SHALL contain an `<h3 id="0-17-0-unreleased">` element (level 3 because the build script depth-shifts all CHANGELOG headings by one)
- **AND** the anchor is stable across builds until the version is released

#### Scenario: Duplicate version slugs cause build failure

- **GIVEN** CHANGELOG.md contains two headings that would produce the same slug (e.g. two `## [0.17.0] — 2026-05-20` blocks)
- **WHEN** `npm run build:site` runs
- **THEN** the script SHALL exit non-zero
- **AND** the error message SHALL name both offending heading texts and the colliding slug value
- **AND** no files SHALL be written to `dist/site/`

#### Scenario: Changelog page contains exactly one `<h1>`

- **GIVEN** `CHANGELOG.md` line 1 is `# Changelog`
- **WHEN** the changelog page is built
- **THEN** `dist/site/changelog.html` SHALL contain exactly one `<h1>` element
- **AND** that `<h1>` SHALL be the page-chrome title from `changelog.html.template`, not a rendering of the CHANGELOG.md title line
- **AND** the CHANGELOG.md `# Changelog` heading SHALL be rendered as `<h2>` (depth-shifted) or omitted entirely from the rendered region

### Requirement: Build is deterministic and reproducible locally

Running `npm run build:site` locally SHALL produce byte-identical output to a CI build of the same git HEAD (modulo the `{{BUILD_DATE}}` and `{{COMMIT_SHA}}` substitutions, which depend on wall-clock and env). The build SHALL NOT require any network access, any tool other than Node 20 + npm, or any environment variable to succeed.

#### Scenario: Local build produces all output files

- **WHEN** a developer with Node 20 runs `npm install && npm run build:site` in a fresh clone
- **THEN** `dist/site/index.html`, `dist/site/changelog.html`, `dist/site/styles.css`, `dist/site/favicon.svg`, `dist/site/404.html`, `dist/site/robots.txt` all exist
- **AND** the build exits with code 0

#### Scenario: Build is offline-safe

- **WHEN** `npm run build:site` is run with no network connectivity (npm dependencies already installed)
- **THEN** the build completes successfully without any network request

#### Scenario: Build fails loudly on unsubstituted tokens

- **GIVEN** the template contains `{{CHANGELOG_CONTENT}}`
- **WHEN** the build runs successfully
- **THEN** no file under `dist/site/` SHALL contain the literal substring `{{CHANGELOG_CONTENT}}`, `{{BUILD_DATE}}`, or `{{COMMIT_SHA}}`
- **AND** if any token remains, the build SHALL exit non-zero with an error naming the offending token

### Requirement: Site weight stays under 100 KB total raw on-disk

The deployed static assets (HTML + CSS + favicon + robots + 404) SHALL total ≤ 100 KB raw on-disk (uncompressed). The measurement is `fs.statSync(file).size` summed across every file written to `dist/site/`. Budget chosen to accommodate ~18 months of CHANGELOG growth at the historical ~2 versions/month rate; re-evaluate when CHANGELOG exceeds 60 version sections.

#### Scenario: Total size budget is enforced

- **WHEN** `src/__tests__/build-site.test.ts` runs after `npm run build:site`
- **THEN** the sum of `fs.statSync(file).size` for every file in `dist/site/` SHALL be reported and asserted to be ≤ 100 × 1024 bytes
- **AND** if the budget is exceeded, the test SHALL fail with output naming each file's size

#### Scenario: Test is discoverable by the existing vitest config

- **GIVEN** `vitest.config.ts` `include: ['src/**/__tests__/**/*.test.ts']`
- **WHEN** `npm test` is run
- **THEN** vitest SHALL report at least one suite from `src/__tests__/build-site.test.ts`
- **AND** that suite SHALL NOT be skipped or excluded

### Requirement: Pages workflow has minimum required permissions

The pages workflow SHALL request exactly these GitHub-token permissions: `contents: read`, `pages: write`, `id-token: write`. No additional permissions SHALL be granted.

#### Scenario: Permission set is minimal

- **WHEN** the workflow YAML is parsed
- **THEN** the top-level `permissions:` block enumerates exactly three keys
- **AND** none of `actions:`, `checks:`, `deployments:`, `issues:`, `packages:`, `pull-requests:`, `repository-projects:`, `security-events:`, or `statuses:` is set to anything other than the GitHub default

### Requirement: Site assets are excluded from the published npm tarball

The `package.json` `files` array entry `"dist"` would otherwise include `dist/site/*` in the published npm tarball, contaminating downstream consumers (~50–100 KB of site HTML/CSS shipped to every `npm install open-design-mcp`). The `files` array SHALL contain an exclusion entry (`"!dist/site"`) preventing this.

#### Scenario: npm pack does not include site assets

- **GIVEN** `dist/site/index.html` and `dist/site/changelog.html` exist locally (e.g. a developer ran `npm run build:site`)
- **WHEN** `npm pack --dry-run` is run
- **THEN** the listed file paths SHALL NOT include any path matching `dist/site/*`
- **AND** the package size reported SHALL NOT increase relative to a tree where `dist/site/` does not exist

### Requirement: Site is fully usable with JavaScript disabled

The site SHALL contain no module scripts, no `<script src=...>` tags loading external JS, and no inline `<script>` block exceeding 30 non-blank lines. All page content (navigation, headings, links, code blocks, changelog content) SHALL render and be interactive (i.e. anchor links navigate) with JavaScript disabled in the browser.

#### Scenario: No external scripts

- **WHEN** the rendered HTML of any deployed page is inspected
- **THEN** there are zero `<script src=...>` tags

#### Scenario: Inline scripts are small or absent

- **WHEN** any inline `<script>` block in the deployed HTML is measured
- **THEN** it is ≤ 30 non-blank lines
- **AND** it contains no calls to `fetch`, `XMLHttpRequest`, `import()`, or `eval`

### Requirement: README badge links to live site

The repository README SHALL include exactly one badge or link in the badges row pointing at the deployed site URL.

#### Scenario: Badge is present and correct

- **WHEN** the README is parsed
- **THEN** it contains the literal URL `https://nano-step.github.io/open-design-mcp/` at least once
- **AND** the badge appears in the badges block near the top of the README, not buried in a later section

