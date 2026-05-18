# build-and-ci Specification

## Purpose
TBD - created by archiving change init-package-scaffold. Update Purpose after archive.
## Requirements
### Requirement: validate:quick command works on fresh checkout

`npm install && npm run lint && npm run typecheck && npm test && npm run build` SHALL succeed on a fresh clone of the repository, on supported Node versions.

#### Scenario: Fresh install green pipeline

- **WHEN** a developer clones the repo on Node 20 or Node 22 and runs the full quick chain
- **THEN** every command SHALL exit 0
- **AND** lint SHALL report 0 errors AND 0 warnings (`--max-warnings 0`)
- **AND** typecheck SHALL report 0 errors
- **AND** at least 1 unit test SHALL pass
- **AND** build SHALL produce `dist/src/server.js` with executable bit set

### Requirement: Lint configuration

The repository SHALL use ESLint 9 flat config and SHALL enforce TypeScript-aware rules.

#### Scenario: eslint.config.js exists

- **WHEN** the project root is inspected
- **THEN** `eslint.config.js` SHALL exist
- **AND** it SHALL export a flat config array
- **AND** it SHALL include `@typescript-eslint` rules

#### Scenario: Zero warnings policy

- **WHEN** `npm run lint` is executed
- **THEN** the command SHALL invoke `eslint src --max-warnings 0`
- **AND** any warning SHALL fail the build

### Requirement: TypeScript configuration

`tsconfig.json` SHALL enable strict mode and Node16 module resolution, and SHALL place vendored sources under the same compilation root so they emit to `dist/` alongside `src/`.

#### Scenario: Strict mode + Node16

- **WHEN** `tsconfig.json` is read
- **THEN** `compilerOptions.strict` SHALL be `true`
- **AND** `compilerOptions.target` SHALL be `"ES2022"`
- **AND** `compilerOptions.module` SHALL be `"Node16"`
- **AND** `compilerOptions.moduleResolution` SHALL be `"Node16"`
- **AND** `compilerOptions.outDir` SHALL be `"./dist"`
- **AND** `compilerOptions.rootDir` SHALL be `"."`
- **AND** `compilerOptions.skipLibCheck` SHALL be `true`

#### Scenario: Compilation scope includes vendor

- **WHEN** `tsconfig.json` is read
- **THEN** `include` SHALL contain both `"src/**/*"` and `"vendor/od-contracts/src/**/*"`
- **AND** `exclude` SHALL contain `"node_modules"`, `"dist"`, `"tests/**/*"`, and `"**/*.test.ts"`

#### Scenario: Scaffold typecheck does not require vendor source

- **WHEN** `npm run typecheck` runs in the scaffold PR (vendor/od-contracts/src/ contains only `.gitkeep`)
- **THEN** the typecheck SHALL succeed with exit 0
- **AND** the scaffold's `src/` code MUST NOT import from `vendor/od-contracts/` (no real vendor files exist yet)

#### Scenario: Compilation strategy SHALL NOT preclude future vendor imports

- **WHEN** the `vendor-sync-initial` change later populates `vendor/od-contracts/src/`
- **THEN** the existing `tsconfig.json` SHALL allow `src/` code to import from `'../../vendor/od-contracts/src/prompts/system.js'` (or similar relative path) without further config changes
- **AND** the build SHALL emit those vendored files to `dist/vendor/od-contracts/src/` automatically

### Requirement: Test runner is vitest

The repository SHALL use vitest ^2.1.8 as the test runner with the node environment, AND the integration test suite SHALL grow to ≥5 tests after `vendor-sync-initial`.

#### Scenario: Integration test count

- **WHEN** `npm run test:integration` runs after `vendor-sync-initial` is applied
- **THEN** the output SHALL report ≥ 5 passing tests
- **AND** zero failing or skipped tests
- **AND** at least one test SHALL exercise the `resources/list` -32601 path
- **AND** at least one test SHALL exercise the SIGINT graceful shutdown path

### Requirement: GitHub Actions CI workflow

A CI workflow SHALL run on every push and pull request targeting `master`, exercising the full validation ladder.

#### Scenario: Workflow file exists

- **WHEN** the project root is inspected
- **THEN** `.github/workflows/ci.yml` SHALL exist
- **AND** it SHALL trigger on `push` to `master` and on `pull_request` to `master`

#### Scenario: CI runs matrix on Node 20 and 22

- **WHEN** the CI workflow runs
- **THEN** it SHALL execute on a matrix of Node 20 AND Node 22
- **AND** each matrix entry SHALL run the steps: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `bash scripts/vendor-check.sh`
- **AND** every step SHALL be required for the workflow to succeed
- **AND** the workflow SHALL fail fast if any step exits non-zero

#### Scenario: No deploy step in this PR

- **WHEN** the CI workflow is inspected
- **THEN** it MUST NOT contain any `npm publish` step
- **AND** it MUST NOT publish artifacts to a registry

### Requirement: Build produces executable

`npm run build` SHALL compile TypeScript and mark the entry script executable.

#### Scenario: build script

- **WHEN** `package.json` is read
- **THEN** `scripts.build` SHALL equal `"tsc && shx chmod +x dist/src/server.js"`

#### Scenario: Shebang preserved

- **WHEN** `npm run build` completes
- **THEN** `dist/src/server.js` SHALL start with the line `#!/usr/bin/env node`
- **AND** the file mode SHALL include the user-execute bit (`0o100` and higher)

### Requirement: Integration test placeholder

A minimal integration test SHALL exercise the built binary via the MCP SDK client.

#### Scenario: vitest.integration.config.ts exists

- **WHEN** the project root is inspected
- **THEN** `vitest.integration.config.ts` SHALL exist
- **AND** it SHALL include only files under `tests/integration/**`

#### Scenario: At least one integration test exists

- **WHEN** the project root is inspected
- **THEN** at least one file matching `tests/integration/*.test.ts` SHALL exist
- **AND** the test SHALL spawn `node dist/src/server.js` and send a JSON-RPC `initialize` request, asserting the response contains `serverInfo.name === "open-design-mcp"` and `serverInfo.version === "0.1.0"`
- **AND** the test SHALL also call `tools/list` and assert `result.tools` is an empty array
- **AND** the test SHALL clean up the subprocess on completion (no leftover child processes, no hung file handles)

#### Scenario: Integration test command

- **WHEN** `package.json` is read
- **THEN** `scripts["test:integration"]` SHALL equal `"vitest run --config vitest.integration.config.ts"`
- **AND** the command SHALL assume a prior `npm run build` has produced `dist/src/server.js`; the CI workflow sequences build before test:integration explicitly (the script itself does not invoke build for fast local iteration)

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

