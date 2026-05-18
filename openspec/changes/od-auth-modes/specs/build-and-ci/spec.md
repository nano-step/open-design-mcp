# Spec Delta: build-and-ci (od-auth-modes)

Extends the existing unit-test and integration-test coverage requirements with the new auth-mode test surface.

## MODIFIED Requirements

### Requirement: Unit test coverage for byok-pipeline-tool modules

The unit test suite SHALL cover env-var validation (including the new auth-mode surface), OD HTTP client headers (all 3 auth modes), the SSE parser, and every tool handler.

#### Scenario: Unit test count

- **WHEN** `npm test` runs after `od-auth-modes` is applied
- **THEN** the output SHALL report ≥ 105 passing tests (existing baseline + ≥ 9 config cases + ≥ 4 od-client cases)
- **AND** the test files SHALL include at minimum:
  - `src/__tests__/config.test.ts` — env var validation including all 3 auth-mode resolutions, ambiguity errors, and embedded-credentials rejection
  - `src/__tests__/sse-parser.test.ts`
  - `src/__tests__/od-client.test.ts` — HTTP client wrapper including `Authorization` header shape for each of `{none, bearer, basic}` modes
  - `src/__tests__/tools/list-projects.test.ts`
  - `src/__tests__/tools/get-project.test.ts`
  - `src/__tests__/tools/save-artifact.test.ts`
  - `src/__tests__/tools/lint-artifact.test.ts`
  - `src/__tests__/tools/generate-design.test.ts`

#### Scenario: Auth-mode resolution test cases present

- **WHEN** the config test suite runs
- **THEN** at least one test SHALL assert that `OD_AUTH_MODE=basic` resolves to an `AuthDescriptor` with `mode: 'basic'`, `user`, and `pass` fields populated
- **AND** at least one test SHALL assert that an ambiguous configuration (both bearer and basic credential vars set, no `OD_AUTH_MODE`) throws an error containing the word "ambiguous" or "disambiguate"
- **AND** at least one test SHALL assert that an `OD_DAEMON_URL` containing embedded `user:pass@` is rejected with a redirection to `OD_BASIC_*`

#### Scenario: Authorization header shape test cases present

- **WHEN** the od-client test suite runs
- **THEN** at least one test SHALL assert that `auth: {mode: 'none'}` results in no `authorization` header on the outbound fetch
- **AND** at least one test SHALL assert that `auth: {mode: 'bearer', token: 'tok'}` results in `authorization: Bearer tok`
- **AND** at least one test SHALL assert that `auth: {mode: 'basic', user: 'alice', pass: 'secret'}` results in `authorization: Basic <base64('alice:secret')>` with the exact base64-encoded bytes

#### Scenario: Credential-leakage regression test present

- **WHEN** the od-client test suite runs
- **THEN** at least one test SHALL use a sentinel password value, trigger an `OdHttpError` (mock 500 response), and assert that neither `error.message` nor `error.bodySnippet` contains the sentinel literal

### Requirement: Integration test coverage for byok-pipeline-tool tools

The integration test suite SHALL exercise every registered tool end-to-end against a mock OD daemon spawned in-process, AND SHALL verify that the configured auth mode flows through to outbound headers.

#### Scenario: Integration test count

- **WHEN** `npm run test:integration` runs after `od-auth-modes` is applied
- **THEN** the output SHALL report ≥ 23 passing tests (existing 22 + ≥ 1 new for basic-auth header)
- **AND** zero failing or skipped tests

#### Scenario: Basic-auth header reaches the mock daemon

- **WHEN** the integration suite spawns the MCP server child process with `OD_AUTH_MODE=basic`, `OD_BASIC_USER=alice`, `OD_BASIC_PASS=secret`, and `OD_DAEMON_URL` pointing at the mock OD server
- **AND** the test invokes a read-only tool such as `od_list_projects` through the MCP SDK client
- **THEN** the mock server SHALL receive an inbound request bearing the header `Authorization: Basic YWxpY2U6c2VjcmV0`
  (where `YWxpY2U6c2VjcmV0` is `base64('alice:secret')`)
- **AND** the tool SHALL return a successful (non-error) result to the MCP client
