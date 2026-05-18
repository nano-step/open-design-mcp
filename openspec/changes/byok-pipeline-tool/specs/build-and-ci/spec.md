# Spec Delta: build-and-ci (byok-pipeline-tool)

Strengthens test coverage to match the 5-tool surface. CI matrix and validation ladder unchanged.

## MODIFIED Requirements

### Requirement: Test runner is vitest

The integration test suite SHALL grow to ≥7 tests after `byok-pipeline-tool` (was 5 after `vendor-sync-initial`).

#### Scenario: Integration test count

- **WHEN** `npm run test:integration` runs after `byok-pipeline-tool` is applied
- **THEN** the output SHALL report ≥ 7 passing tests
- **AND** zero failing or skipped tests
- **AND** at least one test SHALL verify `tools/list` returns 5 tools with non-empty descriptions
- **AND** at least one test SHALL verify SDK input validation produces `-32602` for malformed input

### Requirement: Unit test coverage

The unit test suite SHALL grow substantially to cover the new modules (config, od-client, sse-parser, 5 tool handlers).

#### Scenario: Unit test count

- **WHEN** `npm test` runs after `byok-pipeline-tool` is applied
- **THEN** the output SHALL report ≥ 20 passing tests (up from 7)
- **AND** the test files SHALL include at minimum:
  - `src/__tests__/config.test.ts` — env var validation
  - `src/__tests__/sse-parser.test.ts` — OD SSE wire format
  - `src/__tests__/od-client.test.ts` — HTTP client wrapper
  - `src/__tests__/tools/list-projects.test.ts`
  - `src/__tests__/tools/get-project.test.ts`
  - `src/__tests__/tools/generate-design.test.ts`
  - `src/__tests__/tools/save-artifact.test.ts`
  - `src/__tests__/tools/lint-artifact.test.ts`

## ADDED Requirements

### Requirement: OD daemon mock helper for integration tests

A local HTTP mock server SHALL be available to integration tests so that they don't depend on a real OD daemon running.

#### Scenario: Mock server file present

- **WHEN** the repo is inspected after `byok-pipeline-tool`
- **THEN** the file `tests/integration/helpers/od-mock-server.ts` SHALL exist
- **AND** it SHALL export a function (e.g., `startOdMockServer()`) that:
  - Starts a Node `http` server on an ephemeral port
  - Accepts response stubs for each OD endpoint
  - Returns `{url, close}` for cleanup

#### Scenario: Integration tests use mock, not live daemon

- **WHEN** any test under `tests/integration/` makes an HTTP call to an OD endpoint
- **THEN** that call SHALL be routed to a `startOdMockServer()` instance
- **AND** the test SHALL NOT contact `http://ai-open-design:7456` or any other real URL

### Requirement: Live smoke test documented but manual

A live smoke test against a real OD daemon SHALL be documented in evidence but SHALL NOT run in CI.

#### Scenario: Smoke test doc present

- **WHEN** `docs/evidence/byok-pipeline-tool/` is inspected after `byok-pipeline-tool`
- **THEN** a file `smoke-test.md` SHALL exist
- **AND** it SHALL document the commands a maintainer runs against `http://ai-open-design:7456` to validate each tool end-to-end
- **AND** it SHALL include the captured transcript from one successful smoke run (date + outputs)

#### Scenario: CI workflow does not call live daemon

- **WHEN** `.github/workflows/ci.yml` is inspected
- **THEN** it SHALL NOT contain references to `ai-open-design`, `OD_DAEMON_URL` env var setting, or any HTTP probe of an OD daemon

### Requirement: vendor-check.sh remains green

`scripts/vendor-check.sh` SHALL continue to exit 0 after `byok-pipeline-tool`.

#### Scenario: Vendor invariants preserved

- **WHEN** `bash scripts/vendor-check.sh` runs after `byok-pipeline-tool` is applied
- **THEN** the script SHALL exit 0 with output ending in `vendor-check: ok`
- **AND** all 13 vendored `.ts` files SHALL remain present
- **AND** the `chat.ts` patch + MODIFICATION header SHALL remain intact
- **AND** `VENDORED_FROM.md` Modifications log SHALL remain unchanged
