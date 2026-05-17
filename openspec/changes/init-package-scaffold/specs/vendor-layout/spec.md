# Spec: vendor-layout

Defines the on-disk shape, license artifacts, and integrity invariants of `vendor/od-contracts/`, plus the `scripts/vendor-sync.sh` and `scripts/vendor-check.sh` scripts. This PR creates the directory and metadata; copying the actual upstream `.ts` sources is a follow-up change (`vendor-sync-initial`).

## ADDED Requirements

### Requirement: Vendor folder structure

The repository SHALL contain a `vendor/od-contracts/` directory with the mandatory Apache 2.0 attribution artifacts.

#### Scenario: Required files exist after scaffold

- **WHEN** the scaffold change is applied
- **THEN** `vendor/od-contracts/LICENSE` SHALL exist and SHALL contain the full Apache 2.0 license text
- **AND** `vendor/od-contracts/NOTICE` SHALL exist and SHALL contain attribution to `nexu-io/open-design`
- **AND** `vendor/od-contracts/VENDORED_FROM.md` SHALL exist and SHALL contain a 40-character upstream commit SHA
- **AND** `vendor/od-contracts/README.md` SHALL exist and SHALL describe usage + re-sync procedure

#### Scenario: src subtree placeholder

- **WHEN** the scaffold change is applied
- **THEN** `vendor/od-contracts/src/` SHALL exist as an empty directory placeholder
- **AND** it MUST NOT contain any `.ts` files (those are added in the `vendor-sync-initial` change)

### Requirement: Upstream pin metadata

`VENDORED_FROM.md` SHALL record the exact upstream commit, date, and file list for traceability.

#### Scenario: Pin contents

- **WHEN** `vendor/od-contracts/VENDORED_FROM.md` is read
- **THEN** it SHALL contain a field `Upstream Repository: https://github.com/nexu-io/open-design`
- **AND** it SHALL contain a field `Upstream Commit SHA: 7766582f0bd75d2dce31b2f9db01a482af801897`
- **AND** it SHALL contain a field `Upstream Commit Date:` followed by an ISO-8601 timestamp
- **AND** it SHALL contain a `Files Vendored:` section listing the 13 target paths
- **AND** it SHALL contain a `Re-sync Procedure:` section pointing at `scripts/vendor-sync.sh`

### Requirement: Top-level repository attribution

The repository root SHALL carry its own LICENSE and NOTICE files that disclose the vendored Apache 2.0 dependency.

#### Scenario: Top-level LICENSE

- **WHEN** the project root is inspected
- **THEN** a file named `LICENSE` SHALL exist
- **AND** it SHALL contain the Apache 2.0 license text
- **AND** the copyright line SHALL read `Copyright (c) 2026 nano-step`

#### Scenario: Top-level NOTICE references vendor

- **WHEN** the project root is inspected
- **THEN** a file named `NOTICE` SHALL exist
- **AND** it SHALL contain a clause stating: "This product includes software vendored from nexu-io/open-design. See vendor/od-contracts/NOTICE for full attribution."

#### Scenario: README vendor disclosure section

- **WHEN** `README.md` is read
- **THEN** it SHALL contain a section titled `## Vendored Dependencies` (or `## Attribution`)
- **AND** the section SHALL include a table or bullet listing `vendor/od-contracts/` with its license (Apache 2.0), upstream URL, and pinned commit reference

### Requirement: Sync script behavior

`scripts/vendor-sync.sh` SHALL perform a reproducible re-sync of the vendor subtree.

#### Scenario: Refuses to run on dirty vendor

- **WHEN** `scripts/vendor-sync.sh <sha>` is invoked AND `vendor/od-contracts/` has uncommitted changes
- **THEN** the script SHALL exit non-zero with a message naming the dirty paths
- **AND** it MUST NOT mutate any file in `vendor/od-contracts/`

#### Scenario: Resolves HEAD/tag to full SHA

- **WHEN** the script is invoked with `HEAD` or a tag name instead of a 40-char SHA
- **THEN** it SHALL resolve the argument to a 40-character SHA before writing `VENDORED_FROM.md`

#### Scenario: Updates VENDORED_FROM.md atomically

- **WHEN** a sync completes successfully
- **THEN** `VENDORED_FROM.md` SHALL reflect the new SHA, commit date, and timestamp of the sync
- **AND** the file list section SHALL match the actual files copied (no drift)

#### Scenario: Sparse + shallow clone

- **WHEN** the script clones upstream
- **THEN** it SHALL use `git clone --filter=blob:none --sparse` to minimize bandwidth
- **AND** it SHALL sparse-checkout only the paths needed for the vendor closure

### Requirement: Vendor integrity check in CI

`scripts/vendor-check.sh` SHALL verify vendor invariants and SHALL run on every CI build.

#### Scenario: Detects missing license

- **WHEN** `vendor/od-contracts/LICENSE` is absent or empty
- **THEN** `scripts/vendor-check.sh` SHALL exit non-zero with a clear message

#### Scenario: Detects missing notice

- **WHEN** `vendor/od-contracts/NOTICE` is absent or empty
- **THEN** `scripts/vendor-check.sh` SHALL exit non-zero

#### Scenario: Detects SHA format violation

- **WHEN** `VENDORED_FROM.md` lacks a 40-character lowercase hex SHA
- **THEN** the check SHALL exit non-zero

#### Scenario: Passes on clean scaffold

- **WHEN** the scaffold has just been applied and all required files are present and valid
- **THEN** `scripts/vendor-check.sh` SHALL exit 0

### Requirement: Published artifact whitelist

The `package.json` `files` field SHALL ship only what the consumer needs at runtime: compiled `dist/` plus the vendor attribution artifacts. It MUST NOT ship vendored `.ts` source files (those exist only for build-time typechecking).

#### Scenario: npm pack contents

- **WHEN** `npm pack --dry-run` is executed
- **THEN** the output SHALL include `dist/`, `vendor/od-contracts/LICENSE`, `vendor/od-contracts/NOTICE`, `vendor/od-contracts/VENDORED_FROM.md`, top-level `LICENSE`, top-level `NOTICE`, `README.md`, and `package.json`
- **AND** the output MUST NOT include `vendor/od-contracts/src/**/*.ts`
- **AND** the output MUST NOT include `src/`, `tests/`, `scripts/`, `openspec/`, `docs/`, or `.github/`
