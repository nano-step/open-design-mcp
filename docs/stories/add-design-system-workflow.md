# US-058 — Design-system-first workflow (v0.17.0)

<!-- generated-by: harness-check retrofit 2026-05-20 -->

## Status

in-review

## Harness Compliance Checklist

Single source of truth for "did the agent forget anything?". Run
`npm run harness:check -- add-design-system-workflow` to verify. Every box
must be ticked before merge (or marked N/A with reason per § Change Types
in HARNESS.md).

- [ ] **issue**: GitHub issue created with `lane:*` + `change-type:*` labels — `#___` (RETROFIT: never created — must create before PR)
- [x] **propose**: `openspec/changes/add-design-system-workflow/{proposal,design,tasks}.md` exist; `openspec validate add-design-system-workflow --strict --no-interactive` is green
- [x] **deep-design**: Metis + Oracle synthesis recorded (synthesis is in proposal.md § Synthesis)
- [x] **specs**: `openspec/changes/add-design-system-workflow/specs/design-system/spec.md` and `specs/tools/spec.md` with acceptance criteria
- [x] **story**: this file
- [ ] **branch**: feature branch checked out from correct base — RETROFIT: work was done on `master` directly (harness violation); needs cherry-pick to a `feat/<N>-add-design-system-workflow` branch before PR
- [x] **implement**: 50/54 tasks ticked in tasks.md (10.1–10.4 deferred to follow-up; 12.7 deferred — manual smoke needs live daemon)
- [x] **validate**: lint 0/0; typecheck clean; 290/290 unit; 29/29 integration; vendor:check ok
- [ ] **user-flow-test**: N/A — `od_generate_design` requires a live BYOK provider + daemon; covered by integration mocks. Reason: post-generation static checks (DS001–DS005) and prompt-injection paths are unit-tested end-to-end; live smoke deferred to manual verification before publish.
- [x] **review-gate**: Oracle reviewer (≠ implementer) PASS on iteration 2/5, 0 high findings (see issue + Review Verdict below)
- [ ] **follow-ups**: every outstanding `medium`/`low` finding filed as a GH issue — pending: (a) integration tests 10.1–10.4 (BYOK mock infra), (b) test #M for `designSystemId` happy path once content endpoint exists, (c) live smoke test 12.7
- [ ] **pr-opened**: `gh pr create` with `Closes #N` — pending issue creation + branch
- [ ] **pr-bot**: PR Bot Review — pending PR
- [ ] **merged**: pending PR Bot approval
- [ ] **archived**: `openspec archive add-design-system-workflow` — post-merge
- [ ] **test-matrix**: `docs/TEST_MATRIX.md` row for this change — post-merge
- [ ] **issue-closed**: auto-closed by `Closes #N` — post-merge

## GitHub Issue

`nano-step/open-design-mcp#___` — TO BE CREATED. The change predates the new
harness rule requiring an issue from the start. Must create before PR.

## Lane

normal

## OpenSpec Change

`openspec/changes/add-design-system-workflow/`

## Product Contract

Open-design-mcp v0.17.0 ships a design-system-first workflow: a generator, an
extractor, an updater, automatic injection of a design-system contract into
`od_generate_design`, design-system lint rules in `od_lint_artifact`, and a
`designSystemSummary` field in `od_compose_brief`. Tool count goes from 10 to
13. Fully backward-compatible (semver-minor); existing tools behave
identically when the new optional args are omitted.

## Relevant Product Docs

- `README.md` — Design-System-First Workflow section + Known Limitation
- `CHANGELOG.md` v0.17.0 — Known Limitations subsection
- `openspec/changes/add-design-system-workflow/specs/design-system/spec.md`
- `openspec/changes/add-design-system-workflow/specs/tools/spec.md`
- `openspec/changes/add-design-system-workflow/design.md`

## Acceptance Criteria

Captured exhaustively in the Review Gate Evidence Table (see § Review below
or `openspec/changes/add-design-system-workflow/specs/*/spec.md`). 38 of 38
criteria PASS with cited file:line evidence and test references.

## Design Notes

- Commands: 3 new MCP tools (`od_extract_design_system`,
  `od_generate_design_system`, `od_update_design_system`).
- Queries: extractor is pure (no network, no env).
- API: 3 new optional args (`designSystemMode`, `designSystemHtml`,
  `designSystemSummary`); 5 new error codes (DS001–DS005).
- Domain rules: design-system contract = tokens + components + layout.
- UI surfaces: none (MCP stdio server).
- Vendor wrapper-injection only — `vendor/od-contracts/` untouched.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npx vitest run` — **290/290 passed** (20 test files, 2026-05-20 01:01) |
| Integration | `npm run test:integration` — **29/29 passed** (7 test files, 2026-05-20 01:01) |
| E2E | N/A — no UI surface (see Testing Checklist below) |
| Platform | `npm run lint` 0/0, `npm run typecheck` exit 0, `npm run vendor:check` ok |
| Release | Deferred — manual smoke vs. live daemon + BYOK provider before `npm publish` |

## Change Type

`user-feature` — adds new public MCP tool surface, new behavior on existing
tools (auto-injection, lint extension, brief enrichment). See HARNESS § Change
Types — requires Review Gate (✓ passed) and user-flow test (deferred to
manual smoke at publish-time, see Testing Checklist).

## Testing Checklist

- [x] User-flow test covers primary changed behavior (integration mocks cover all 3 new tools + 3 modified tools)
- [x] Error/edge path tested — DS001–DS005 all positive + negative cases; Zod rejection for malformed inputs
- [ ] E2E not applicable — reason: `MCP stdio server, no UI surface; live BYOK smoke deferred to pre-publish manual step 12.7`
- [x] Smoke test for non-user-facing change — `npm run test:integration` exercises the full server lifecycle
- [x] All listed tests pass (output pasted in Evidence)

## Review

- Reviewer agent: Oracle (background task `bg_0ffffa29`)
- Reviewer ≠ implementer: yes
- Verdict: `PASS`
- Date: 2026-05-20
- Commit: `master @ HEAD` (pre-branch)
- Iteration: 2 of 5 (iter 1: CONDITIONAL PASS w/ 3 doc fixes; iter 2: PASS)

| Acceptance Criterion | Evidence | Status |
| --- | --- | --- |
| design-system.html artifact shape | `src/tools/extract-design-system.ts:12-71` + tests `:57-65,:72-99,:115-136` | ✓ |
| 3 new MCP tools registered | `src/tools/index.ts:22-34` + integration `tools-save-project-file.test.ts:112-117` asserts 13 tools | ✓ |
| BYOK pipeline for generate-design-system | `src/tools/generate-design-system.ts:96-244` + `generate-design-system.test.ts:151-163` | ✓ |
| Semantic + delta update modes | `src/tools/update-design-system.ts:113-293` + `update-design-system.test.ts:96-174` | ✓ |
| DS001–DS005 lint rules (incl. SVG skip + ignore-next-line) | `src/tools/design-system-lint.ts:139-211` + `design-system-lint.test.ts:67-191` | ✓ |
| Wrapper-injection NOT vendor | `git diff vendor/od-contracts/` empty; `npm run vendor:check` ok | ✓ |
| Backward compat — all new args optional | `compose-brief.ts:74` guard; `lint-artifact.ts:59` guard; `generate-design.ts:50-51,168` defaults — byte-identical output when omitted | ✓ |
| Known limitation documented | `CHANGELOG.md:65-66` + `README.md:75` blockquote + `generate-design.ts:198-206` `@todo(v0.18)` | ✓ |
| All 290 unit tests pass + all 29 integration tests pass | shell output 2026-05-20 01:01 | ✓ |

Full evidence table with all 38 criteria → see `bg_0ffffa29` review transcript.

## PR Bot Review

- PR URL: TBD (pending branch + issue)
- Bot rounds: `0` so far
- Outstanding comments: n/a
- Bot approved: pending

## Harness Delta

This change exposed a harness gap: there was no per-phase compliance checklist,
so an entire body of work landed without a tracking issue or feature branch.
Triggered the parallel issue #58 (this file's harness-check tooling) to prevent
recurrence.

Forward-looking: when this change merges, archive it via
`openspec archive add-design-system-workflow` and update
`docs/TEST_MATRIX.md` with a row for design-system tools.

## Evidence

```
$ npm run lint
> open-design-mcp@0.16.1 lint
> eslint src --max-warnings 0
(0 errors, 0 warnings)

$ npm run typecheck
> open-design-mcp@0.16.1 typecheck
> tsc --noEmit
(exit 0)

$ npx vitest run
 Test Files  20 passed (20)
      Tests  290 passed (290)

$ npm run test:integration
 Test Files  7 passed (7)
      Tests  29 passed (29)

$ npm run vendor:check
vendor-check: ok

$ git diff --stat vendor/od-contracts/
(empty — vendor pristine)

$ openspec validate add-design-system-workflow --strict --no-interactive
Change 'add-design-system-workflow' is valid
```
