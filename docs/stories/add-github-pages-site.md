---
github_issue: "#67"
---

# Story: GitHub Pages site with auto-rendered changelog

**Status:** ready-to-implement
**Issue:** [#67](https://github.com/nano-step/open-design-mcp/issues/67)
**Lane:** `lane:normal × change-type:user-feature`
**Risk flags:** 2 (new public-facing surface, CI workflow added)
**Effort estimate:** Normal (~3-4h impl + validation)

## Harness Compliance Checklist

- [x] **issue**: #67 created with lane:normal + change-type:user-feature labels
- [x] **propose**: openspec/changes/add-github-pages-site/proposal.md
- [x] **specs**: openspec/changes/add-github-pages-site/specs/pages-site/spec.md
- [x] **story**: this file
- [x] **branch**: feat/67-github-pages-changelog from master
- [ ] **implement**: 13 tasks in tasks.md
- [ ] **validate**: V1-V6 ladder green
- [ ] **user-flow-test**: U1+U2 post-merge manual verification
- [ ] **review-gate**: fresh reviewer ≠ implementer, zero high findings
- [ ] **pr-opened**: PR created with Closes #67
- [ ] **pr-bot**: PR bot review PASS
- [ ] **merged**: PR merged to master
- [ ] **archived**: openspec archive add-github-pages-site
- [ ] **test-matrix**: docs/TEST_MATRIX.md updated
- [ ] **issue-closed**: #67 auto-closed by Closes #67

## Why

`open-design-mcp` has no public-facing website. The README is good but doesn't give the project an at-a-glance identity, and reading release history means scrolling 500 lines of raw markdown in GitHub's CHANGELOG view. The user explicitly requested a changelog page that mechanically renders from `CHANGELOG.md` — copy-pasting release notes into a separate file is forbidden by definition.

## Deep-design summary

Metis + Oracle ran in parallel for 4–5 minutes each.

- **Metis verdict:** `needs-revision`. 1 HIGH (test file invisible to vitest glob), 4 MEDIUM (npm tarball contamination, slug-collision risk, duplicate `<h1>` on rendered page, size-budget unit mismatch), 5 LOW. All 10 findings folded into the revised proposal/design/spec/tasks before lock.
- **Oracle verdict:** `architecturally-sound` (with 2 MED fixes). Confirmed build-time render via `marked` is the right architecture, two-job CI workflow follows canonical Pages template, permissions are minimum-correct, fork-PR hijack is blocked by event scoping. Two MED fixes (npm tarball contamination + budget-growth projection) folded.
- **Combined verdict:** clean-pass after one revision cycle. Proceeding to implementation.

## Acceptance criteria (final, post-deep-design)

1. Pushing a commit to `master` that modifies `CHANGELOG.md` causes the published changelog at `https://nano-step.github.io/open-design-mcp/changelog` to update within one workflow run.
2. `npm run build:site` produces byte-identical output locally vs. CI (modulo `BUILD_DATE` and `COMMIT_SHA`).
3. The `/changelog` page renders all current version sections (47 today), each addressable by URL fragment (`#0-17-0`, etc.).
4. The landing page (`/`) lists the project tagline, install snippet, and the 13 MCP tools, plus links to GitHub + npm + changelog.
5. `npm test` discovers and passes the new `src/__tests__/build-site.test.ts` (verifies test is not silently excluded by vitest globbing).
6. `dist/site/` total size ≤ 100 KB raw on-disk; budget enforced by automated test.
7. Workflow runs only on `push: branches: [master]` and `workflow_dispatch`. PR triggers do NOT deploy.
8. `npm pack --dry-run` does NOT include any `dist/site/*` path (verified by test).
9. The rendered `/changelog` contains exactly one `<h1>` (page chrome only; CHANGELOG.md's `# Changelog` heading is depth-shifted).
10. Build script throws and exits non-zero if CHANGELOG.md contains duplicate slugs.
11. README contains a link to the live site URL.

## Implementation hints

```js
// scripts/build-site.mjs — heading renderer with depth-shift + slug detection

import { marked } from 'marked';

const emittedSlugs = new Set();

marked.use({
  renderer: {
    heading({ tokens, depth, raw }) {
      const text = this.parser.parseInline(tokens);
      const shiftedDepth = Math.min(depth + 1, 6); // h1 → h2, etc.

      // Only ## [version] gets an id
      const versionMatch = /^\[([^\]]+)\]/.exec(raw);
      if (depth === 2 && versionMatch) {
        const version = versionMatch[1];
        let slug = version.toLowerCase().replace(/\./g, '-');
        if (/unreleased/i.test(raw)) slug += '-unreleased';

        if (emittedSlugs.has(slug)) {
          throw new Error(
            `Duplicate slug "${slug}" — two CHANGELOG entries collide: ${raw}`
          );
        }
        emittedSlugs.add(slug);

        return `<h${shiftedDepth} id="${slug}">${text}</h${shiftedDepth}>\n`;
      }
      return `<h${shiftedDepth}>${text}</h${shiftedDepth}>\n`;
    },
  },
});
```

```json
// package.json — devDep + files exclusion
{
  "devDependencies": { "marked": "^14" },
  "files": [
    "dist",
    "!dist/site",
    "vendor/od-contracts/LICENSE",
    "..."
  ],
  "scripts": { "build:site": "node scripts/build-site.mjs" }
}
```

```yaml
# .github/workflows/pages.yml — uses --ignore-scripts to skip prepare → tsc
- run: npm ci --ignore-scripts
- run: npm run build:site
  env:
    GITHUB_SHA: ${{ github.sha }}
```

## Evidence

To be filled during implementation. Sections to populate:

- **Validation ladder output** — paste outputs of V1–V6
- **User-flow test output** — paste U1 manual-verification screenshots/URLs + U2 CHANGELOG round-trip
- **Review Gate verdict** — paste reviewer's PASS/FAIL with per-AC citations
- **PR link + bot review** — link + final bot state

## Decisions

- **Stack: static HTML + Node build script + GitHub Actions Pages deploy** — chosen over Jekyll (Ruby toolchain), client-side fetch (CORS / JS-disabled break), and Astro (overkill for 2 pages). Documented in `design.md` § alternatives table.
- **Single source of truth: CHANGELOG.md at repo root** — site never has its own copy. Build script reads, renders, injects. User's explicit constraint.
- **No PR previews** — security (fork PRs cannot trigger Pages deploys). Pages always reflects `master`.
- **No custom domain** — `nano-step.github.io/open-design-mcp/` is sufficient; DNS work deferred.
- **No docs page in v1** — README remains the docs entry point. Adding `/docs` later is additive.
- **Inline JS budget: ≤ 30 non-blank lines** — accommodates smooth-scroll polyfill while keeping the "no external JS" principle.
- **Page weight budget: 100 KB raw on-disk** — raised from initial 50 KB after Oracle's growth-projection finding (at ~2 versions/month, 50 KB would breach in 12–18 months).
- **Test location: `src/__tests__/build-site.test.ts`** — must match vitest config's `include` glob; `tests/` would be silently skipped. (HIGH severity finding from Metis.)
