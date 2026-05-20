# US-XXX Story Title

<!-- generated-by: harness-init v0.1.0 -->

## Status

planned

## Harness Compliance Checklist

Single source of truth for "did the agent forget anything?". Run
`npm run harness:check -- <story-slug>` to verify. Every box must be ticked
before merge (or marked N/A with reason per § Change Types in HARNESS.md).

- [ ] **issue**: GitHub issue created with `lane:*` + `change-type:*` labels — `#___`
- [ ] **propose**: `openspec/changes/<name>/proposal.md` + `design.md` + `tasks.md` exist and `openspec validate <name> --strict` is green (N/A for tiny lane)
- [ ] **deep-design**: Metis + Oracle synthesis recorded as issue comment (N/A for tiny lane)
- [ ] **specs**: `openspec/changes/<name>/specs/**.md` with acceptance criteria (N/A for tiny lane)
- [ ] **story**: this file exists and matches the OpenSpec change
- [ ] **branch**: feature branch checked out from correct base — branch: `___`, base: `develop`/`master`
- [ ] **implement**: all checkboxes in `openspec/changes/<name>/tasks.md` ticked (or explicitly deferred)
- [ ] **validate**: lint + typecheck + unit + (integration for normal/high-risk) + (e2e for high-risk) + vendor:check all green — output pasted in § Evidence
- [ ] **user-flow-test**: primary changed behavior exercised end-to-end (or marked N/A — reason: `___`)
- [ ] **review-gate**: fresh reviewer (≠ implementer) verdict = PASS with 0 `high` findings — iteration: `___` of 5
- [ ] **follow-ups**: every outstanding `medium`/`low` finding filed as a GH issue — issues: `___`
- [ ] **pr-opened**: `gh pr create` with `Closes #N` in body — PR URL: `___`
- [ ] **pr-bot**: PR Bot Review approved (or documented human override in PR body)
- [ ] **merged**: PR merged via squash/rebase (never `--admin`, never force-push)
- [ ] **archived**: `openspec archive <name>` complete (N/A for tiny lane)
- [ ] **test-matrix**: `docs/TEST_MATRIX.md` updated with story row
- [ ] **issue-closed**: tracking issue auto-closed by `Closes #N` or manually

## GitHub Issue

`nano-step/open-design-mcp#N` — created at Feature Intake step 0. Required for every story
(skip only for tiny-lane changes that never touch remote).

## Lane

tiny | normal | high-risk

## OpenSpec Change

`openspec/changes/<name>/` — leave blank for tiny lane stories.

## Product Contract

Describe the behavior this story must make true.

## Relevant Product Docs

- `docs/product/...`

## Acceptance Criteria

- Criterion 1.
- Criterion 2.
- Criterion 3.

## Design Notes

- Commands:
- Queries:
- API:
- Tables:
- Domain rules:
- UI surfaces:

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | |
| Integration | |
| E2E | |
| Platform | |
| Release | |

## Change Type

One of: `user-feature` | `bug-fix` | `infrastructure` | `refactor` | `docs` | `dependency-bump`.
See `docs/HARNESS.md` § Change Types for E2E/Review gate implications.

## Testing Checklist

- [ ] User-flow test covers primary changed behavior (file: `tests/...`)
- [ ] Error/edge path tested — high-risk only (file: `tests/...`)
- [ ] E2E not applicable — reason: `___` (only valid for infra/refactor/docs/deps)
- [ ] Smoke test for non-user-facing change — command: `___` (only for infra/deps)
- [ ] All listed tests pass (output pasted in Evidence)

## Review

- Reviewer agent: (e.g. Oracle, review-work skill, name of fresh agent)
- Reviewer ≠ implementer: yes / no
- Verdict: `PASS` | `FAIL` | `PENDING`
- Date: YYYY-MM-DD
- Commit: `<sha>`

| Acceptance Criterion | Evidence | Status |
| --- | --- | --- |
| (copy from Acceptance Criteria above) | (test output, command, screenshot path) | ✓ / ✗ |

## PR Bot Review

- PR URL: `___`
- Bot rounds: `N` (max 3 before human escalation)
- Outstanding comments: none / [list]
- Bot approved: yes / no / overridden by [human, reason]

## Harness Delta

Document any harness updates made or proposed because of this story.

## Evidence

Add commands, reports, screenshots, or links after validation exists.
Paste FULL command output (not summary). Include exit codes.
For high-risk web changes, link screenshots in `docs/evidence/<change-name>/`.
