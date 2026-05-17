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

The repository SHALL use vitest ^2.1.8 as the test runner with the node environment.

#### Scenario: vitest.config.ts

- **WHEN** the project root is inspected
- **THEN** `vitest.config.ts` SHALL exist
- **AND** it SHALL set `test.environment` to `'node'`
- **AND** it SHALL set `test.globals` to `true`

#### Scenario: At least one bootstrap test passes

- **WHEN** `npm test` is executed on the scaffold
- **THEN** at least one test file SHALL exist under `src/__tests__/`
- **AND** every test SHALL pass with exit code 0
- **AND** the test suite SHALL include at least one assertion validating that the MCP server module can be imported without error

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

