# Spec Delta: vendor-layout (vendor-sync-initial)

Replaces the empty-placeholder scenarios with populated-vendor scenarios. Adds requirements for §4(b) MODIFICATION header and Modifications log entry.

## MODIFIED Requirements

### Requirement: Vendor folder structure

The repository SHALL contain a `vendor/od-contracts/` directory with the mandatory Apache 2.0 attribution artifacts AND the vendored source tree.

#### Scenario: src subtree contains vendored sources

- **WHEN** the `vendor-sync-initial` change is applied
- **THEN** `vendor/od-contracts/src/` SHALL contain exactly 13 `.ts` files matching the closure defined in `init-package-scaffold` design.md D6
- **AND** it SHALL NOT contain `src/index.ts` (poisonous barrel — excluded per D6)
- **AND** it SHALL NOT contain any `.gitkeep` placeholder file (no longer needed)
- **AND** the 7 runtime files SHALL be: `src/prompts/system.ts`, `src/prompts/official-system.ts`, `src/prompts/discovery.ts`, `src/prompts/directions.ts`, `src/prompts/deck-framework.ts`, `src/prompts/media-contract.ts`, `src/api/projects.ts`
- **AND** the 6 type-only files SHALL be: `src/api/chat.ts`, `src/api/files.ts`, `src/api/comments.ts`, `src/api/research.ts`, `src/api/artifacts.ts`, `src/common.ts`

### Requirement: Upstream pin metadata

`VENDORED_FROM.md` SHALL record the exact upstream commit, date, file list, AND modifications log for traceability.

#### Scenario: Modifications section populated

- **WHEN** `vendor/od-contracts/VENDORED_FROM.md` is read after `vendor-sync-initial`
- **THEN** the `## Modifications` section SHALL contain at least one entry
- **AND** the entry SHALL document the `chat.ts` extensionless-imports patch
- **AND** the entry SHALL include the date (`2026-05-17`), the affected file (`chat.ts`), the list of imports patched (3 entries: `./files`, `./comments`, `./research`), and the rationale (Node16 ESM compatibility)

## ADDED Requirements

### Requirement: Apache 2.0 §4(b) MODIFICATION header on patched files

Any file in `vendor/od-contracts/src/` that has been modified from its upstream source SHALL carry an in-file MODIFICATION header satisfying Apache License 2.0 Section 4(b).

#### Scenario: chat.ts header present

- **WHEN** `vendor/od-contracts/src/api/chat.ts` is read
- **THEN** within the first 25 lines it SHALL contain a block delimited by `// MODIFICATION NOTICE (Apache License 2.0, Section 4(b))`
- **AND** the block SHALL contain the upstream source identifier (repo + commit SHA)
- **AND** the block SHALL contain the modifier's name and email (`kokorolx <kokoro.lehoang@gmail.com>`)
- **AND** the block SHALL contain the date of modification (`2026-05-17`)
- **AND** the block SHALL describe the modification (extensionless imports patched for Node16 ESM)
- **AND** the block SHALL state that Apache 2.0 terms apply to both the upstream and modified portions

#### Scenario: Unmodified files have no MODIFICATION header

- **WHEN** any vendored `.ts` file other than `chat.ts` is read
- **THEN** it SHALL NOT contain a `MODIFICATION NOTICE` block
- **AND** it SHALL retain its original upstream content verbatim (no formatting, comment, or whitespace changes)

### Requirement: Vendored sources are type-checkable from src/

The vendored `.ts` files SHALL compile cleanly under the project's `tsconfig.json` (Node16 module resolution, ES2022 target, strict mode).

#### Scenario: typecheck passes

- **WHEN** `npm run typecheck` is invoked from the repository root
- **THEN** the command SHALL exit 0
- **AND** the output SHALL NOT contain any error referring to a `vendor/od-contracts/src/` path

#### Scenario: build produces vendor dist

- **WHEN** `npm run build` is invoked
- **THEN** `dist/vendor/od-contracts/src/` SHALL contain compiled `.js` files corresponding to every runtime `.ts` file in the source closure
- **AND** the type-only files MAY OR MAY NOT produce `.js` output (depending on whether they contain any non-type code)

### Requirement: chat.ts imports use .js suffix

To satisfy Node16 ESM module resolution, all relative imports in `vendor/od-contracts/src/api/chat.ts` SHALL use the `.js` suffix.

#### Scenario: No extensionless relative imports remain

- **WHEN** `vendor/od-contracts/src/api/chat.ts` is searched for the regex `from\s+['"]\.\.?/[^'"]+(?<!\.js)['"]`
- **THEN** zero matches SHALL be found
- **AND** the original three patched imports (`./files`, `./comments`, `./research`) SHALL appear as `./files.js`, `./comments.js`, `./research.js`
