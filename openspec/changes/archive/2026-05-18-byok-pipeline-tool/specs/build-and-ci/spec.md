# Spec Delta: build-and-ci (byok-pipeline-tool)

Strengthens test coverage to match the 5-tool surface. CI matrix and validation ladder unchanged.

## ADDED Requirements

### Requirement: Unit test coverage for byok-pipeline-tool modules

The unit test suite SHALL grow to cover the new modules (config, od-client, sse-parser, 5 tool handlers).

#### Scenario: Unit test count

- **WHEN** `npm test` runs after `byok-pipeline-tool` is applied
- **THEN** the output SHALL report ≥ 100 passing tests (up from 7 pre-change)
- **AND** the test files SHALL include at minimum:
  - `src/__tests__/config.test.ts` — env var validation
  - `src/__tests__/sse-parser.test.ts` — OD SSE wire format
  - `src/__tests__/od-client.test.ts` — HTTP client wrapper
  - `src/__tests__/tools/list-projects.test.ts`
  - `src/__tests__/tools/get-project.test.ts`
  - `src/__tests__/tools/save-artifact.test.ts`
  - `src/__tests__/tools/lint-artifact.test.ts`
  - `src/__tests__/tools/generate-design.test.ts`

### Requirement: Integration test coverage for byok-pipeline-tool tools

The integration test suite SHALL exercise every registered tool end-to-end against a mock OD daemon spawned in-process.

#### Scenario: Integration test count

- **WHEN** `npm run test:integration` runs after `byok-pipeline-tool` is applied
- **THEN** the output SHALL report ≥ 20 passing tests
- **AND** zero failing or skipped tests
- **AND** at least one test SHALL verify `tools/list` returns 5 tools with non-empty descriptions
- **AND** at least one test SHALL verify each tool's primary happy path against the mock OD daemon
- **AND** at least one test SHALL verify each tool's primary error path (4xx or 5xx from OD)

### Requirement: OD daemon mock helper for integration tests

A local HTTP mock server SHALL be available to integration tests so that they don't depend on a real OD daemon running.

#### Scenario: Mock server file present

- **WHEN** the repo is inspected after `byok-pipeline-tool`
- **THEN** the file `tests/integration/helpers/od-mock-server.ts` SHALL exist
- **AND** it SHALL export a function `startMockOdServer()` that:
  - Starts a Node `http` server on an ephemeral port
  - Accepts per-test response handlers via `mock.handle(method, path, handler)`
  - Returns `{url, close}` for cleanup
- **AND** it SHALL export a `respondSse(res, events)` helper for SSE-emitting endpoints

#### Scenario: Integration tests use mock, not live daemon

- **WHEN** any test under `tests/integration/` makes an HTTP call to an OD endpoint
- **THEN** that call SHALL be routed to a `startMockOdServer()` instance
- **AND** the test SHALL NOT contact `http://ai-open-design:7456` or any other real URL

### Requirement: Live smoke test documented but manual

A live smoke test against a real OD daemon SHALL be documented in evidence but SHALL NOT run in CI.

#### Scenario: Smoke test doc present

- **WHEN** `docs/evidence/byok-pipeline-tool/` is inspected after `byok-pipeline-tool`
- **THEN** a file `smoke-test.md` SHALL exist
- **AND** it SHALL document the commands a maintainer runs to validate each of the 5 tools end-to-end
- **AND** it SHALL include the captured transcript from one successful smoke run (date + outputs)

#### Scenario: CI workflow does not call live daemon

- **WHEN** `.github/workflows/ci.yml` is inspected
- **THEN** it SHALL NOT contain references to `ai-open-design`, real `OD_DAEMON_URL` values, real `BYOK_*` values, or any HTTP probe of an OD daemon
