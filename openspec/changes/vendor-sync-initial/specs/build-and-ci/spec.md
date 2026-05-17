# Spec Delta: build-and-ci (vendor-sync-initial)

> **Revision**: v1. Adds vendor-check.sh post-sync invariants per Metis TG-1/TG-2/TG-4 (`bg_2aaef543`). Strengthens defense-in-depth without breaking backward-compatibility for the pre-sync scaffold state.

## ADDED Requirements

### Requirement: vendor-check.sh enforces post-sync invariants

After `scripts/vendor-sync.sh` has copied vendored sources into `vendor/od-contracts/src/`, `scripts/vendor-check.sh` SHALL verify that the sync actually produced the expected outputs. The script SHALL remain backward-compatible with the pre-sync scaffold state (zero `.ts` files) so it can run in CI before and after `vendor-sync-initial` lands.

#### Scenario: File count assertion

- **WHEN** `bash scripts/vendor-check.sh` runs
- **AND** `vendor/od-contracts/src/` contains zero `.ts` files (pre-sync state)
- **THEN** the script SHALL exit 0

- **AND WHEN** the same script runs with `vendor/od-contracts/src/` containing exactly 13 `.ts` files
- **THEN** the script SHALL exit 0

- **AND WHEN** the same script runs with `vendor/od-contracts/src/` containing any count other than 0 or 13
- **THEN** the script SHALL exit non-zero with a clear stderr message naming the actual count

#### Scenario: chat.ts patch assertion (post-sync only)

- **WHEN** `bash scripts/vendor-check.sh` runs AND `vendor/od-contracts/src/api/chat.ts` exists
- **THEN** the script SHALL grep for `from './files.js'` in that file
- **AND** SHALL exit non-zero if no match is found (sed patch silently no-op'd)

#### Scenario: §4(b) header assertion (post-sync only)

- **WHEN** `bash scripts/vendor-check.sh` runs AND `vendor/od-contracts/src/api/chat.ts` exists
- **THEN** the script SHALL grep the first 25 lines of `chat.ts` for `MODIFICATION (open-design-mcp)` (matches the exact prefix emitted by `scripts/vendor-sync.sh` line 124)
- **AND** SHALL exit non-zero if the header is absent

#### Scenario: Modifications log assertion (post-sync only)

- **WHEN** `bash scripts/vendor-check.sh` runs AND `vendor/od-contracts/src/api/chat.ts` exists
- **THEN** the script SHALL grep `VENDORED_FROM.md` for the regex `^- \`src/api/chat\.ts\`` (matches the exact format emitted by `scripts/vendor-sync.sh` lines 174-176)
- **AND** SHALL exit non-zero if no Modifications entry is found

### Requirement: Vendor sync byproducts are gitignored

The vendor-sync workflow creates timestamped backup and diff artifacts that MUST NOT be committed.

#### Scenario: .gitignore entries present

- **WHEN** the repo root `.gitignore` is read
- **THEN** it SHALL contain a line matching the glob `.vendor-backup-*/` (or equivalent)
- **AND** it SHALL contain a line matching the glob `.vendor-diff-report-*.txt` (or equivalent)

#### Scenario: Byproducts hidden from git status

- **WHEN** `scripts/vendor-sync.sh` has produced `.vendor-backup-<timestamp>/` and `.vendor-diff-report-<timestamp>.txt` files
- **AND** `git status --porcelain` is run
- **THEN** the output SHALL NOT contain any line starting with `?? .vendor-backup-` or `?? .vendor-diff-report-`

## MODIFIED Requirements

### Requirement: Test runner is vitest

The repository SHALL use vitest ^2.1.8 as the test runner with the node environment, AND the integration test suite SHALL grow to ≥5 tests after `vendor-sync-initial`.

#### Scenario: Integration test count

- **WHEN** `npm run test:integration` runs after `vendor-sync-initial` is applied
- **THEN** the output SHALL report ≥ 5 passing tests
- **AND** zero failing or skipped tests
- **AND** at least one test SHALL exercise the `resources/list` -32601 path
- **AND** at least one test SHALL exercise the SIGINT graceful shutdown path
