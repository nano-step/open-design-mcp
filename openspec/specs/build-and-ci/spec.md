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

The unit test suite SHALL cover env-var validation, OD HTTP client (including the three new lifecycle methods + all 3 auth modes), the SSE parser, and every registered tool handler.

#### Scenario: Unit test count

- **WHEN** `npm test` runs after `project-lifecycle-tools` is applied
- **THEN** the output SHALL report ≥ 165 passing tests (existing 142 + ≥ 9 OdClient + ≥ 12 tool handler cases)
- **AND** the test files SHALL include at minimum:
  - `src/__tests__/config.test.ts`
  - `src/__tests__/sse-parser.test.ts`
  - `src/__tests__/od-client.test.ts` — covers createProject, updateProject, deleteProject in addition to existing methods
  - `src/__tests__/tools/list-projects.test.ts`
  - `src/__tests__/tools/get-project.test.ts`
  - `src/__tests__/tools/create-project.test.ts` (NEW)
  - `src/__tests__/tools/update-project.test.ts` (NEW)
  - `src/__tests__/tools/delete-project.test.ts` (NEW)
  - `src/__tests__/tools/save-artifact.test.ts`
  - `src/__tests__/tools/lint-artifact.test.ts`
  - `src/__tests__/tools/generate-design.test.ts`
  - `src/__tests__/tools/errors.test.ts`

#### Scenario: OdClient lifecycle method coverage

- **WHEN** the od-client test suite runs
- **THEN** at least one test SHALL cover `createProject` happy path
- **AND** at least one test SHALL cover `createProject` 400 error path
- **AND** at least one test SHALL cover `updateProject` happy path
- **AND** at least one test SHALL cover `updateProject` 404 error path
- **AND** at least one test SHALL cover `deleteProject` happy path returning `{ok: true}`
- **AND** at least one test SHALL cover `deleteProject` 404 error path
- **AND** at least one test SHALL assert the underlying `fetch` call uses HTTP `PATCH` method for `updateProject` and HTTP `DELETE` for `deleteProject`

### Requirement: Integration test coverage for byok-pipeline-tool tools

The integration test suite SHALL exercise every registered tool end-to-end against a mock OD daemon spawned in-process, AND SHALL cover the complete project lifecycle (create → update → delete).

#### Scenario: Integration test count

- **WHEN** `npm run test:integration` runs after `project-lifecycle-tools` is applied
- **THEN** the output SHALL report ≥ 24 passing tests (existing 23 + ≥ 1 new lifecycle test)
- **AND** zero failing or skipped tests

#### Scenario: Lifecycle round-trip against mock OD

- **WHEN** the integration suite spawns the MCP server child + a mock OD daemon configured with POST/PATCH/DELETE handlers on `/api/projects` and `/api/projects/:id`
- **AND** the test invokes `od_create_project`, then `od_update_project`, then `od_delete_project` through the MCP SDK client
- **THEN** the mock daemon SHALL receive one POST, one PATCH, and one DELETE in that order with matching project ids
- **AND** all three tool invocations SHALL return successful (`isError` undefined/false) results
- **AND** the create result SHALL include the conversationId returned by the daemon

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

### Requirement: Architecture documentation for od_generate_design flow

The repository SHALL include an architecture document at `docs/architecture/generate-design-flow.md` that explains the end-to-end flow when an MCP client invokes the `od_generate_design` tool, so that newcomers can understand the system without reading source.

#### Scenario: Flow document exists and is non-empty

- **WHEN** a contributor inspects the repository at any commit on `master` after this change is applied
- **THEN** the file `docs/architecture/generate-design-flow.md` SHALL exist
- **AND** the file SHALL contain at least one mermaid code block (fenced with ```mermaid)
- **AND** the file SHALL be at least 100 lines long

#### Scenario: README links to the flow document

- **WHEN** a contributor reads `README.md`
- **THEN** `README.md` SHALL contain a link to `docs/architecture/generate-design-flow.md` (relative path)
- **AND** the link SHALL appear in a section titled "How it works" (or equivalent heading mentioning the flow)

### Requirement: OpenCode skill for open-design-mcp

The repository SHALL include an OpenCode skill at `.opencode/skills/open-design-mcp/` that teaches AI agents how to use the 8 MCP tools exposed by this server, so that LLM-driven sessions can produce correct tool calls without trial-and-error on env-var setup, auth modes, or workflow ordering.

#### Scenario: Skill files exist and are non-empty

- **WHEN** a contributor inspects the repository at any commit on `master` after this change is applied
- **THEN** `.opencode/skills/open-design-mcp/SKILL.md` SHALL exist
- **AND** `.opencode/skills/open-design-mcp/SKILL.md` SHALL contain a YAML frontmatter block with at minimum `name:` and `description:` fields
- **AND** `.opencode/skills/open-design-mcp/SKILL.md` SHALL be no longer than 350 lines (progressive-disclosure budget)
- **AND** the `references/` subdirectory SHALL exist with at least one `.md` file inside

#### Scenario: Tool catalog stays in sync with server

- **WHEN** a contributor reads `SKILL.md`
- **THEN** the tool catalog section SHALL list all 8 tools currently exposed by `src/tools/index.ts` (`od_list_projects`, `od_get_project`, `od_create_project`, `od_update_project`, `od_delete_project`, `od_save_artifact`, `od_lint_artifact`, `od_generate_design`)
- **AND** the catalog SHALL identify which tools require BYOK env vars (only `od_generate_design`)
- **AND** the catalog SHALL identify which tools require `OD_DAEMON_URL` (all eight)

### Requirement: OD playbook skill for OpenCode subagents

The repository SHALL include an OpenCode skill at `.opencode/skills/od-workflow/` that teaches AI agents (via OpenCode's subagent system) how to execute Open Design's full turn-by-turn workflow — discovery questions, brand-spec extraction, TodoWrite planning, 5-dimensional critique, and artifact emission — using a combination of OpenCode's native tools and our `od_*` MCP tools.

#### Scenario: Skill files exist and are non-empty

- **WHEN** a contributor inspects the repository at any commit on `master` after this change is applied
- **THEN** `.opencode/skills/od-workflow/SKILL.md` SHALL exist
- **AND** the file SHALL contain a YAML frontmatter block with at minimum `name:` and `description:` fields
- **AND** the file SHALL be no longer than 350 lines (progressive-disclosure budget)
- **AND** the `references/` subdirectory SHALL exist with at least 5 markdown files

#### Scenario: Transcribed content carries attribution

- **WHEN** a contributor reads any reference file under `.opencode/skills/od-workflow/references/`
- **THEN** files containing content transcribed from upstream nexu-io/open-design SHALL include an attribution header naming the source file:line and pointing to `ATTRIBUTION.md` for the pinned commit and full Apache 2.0 notice
- **AND** `.opencode/skills/od-workflow/ATTRIBUTION.md` SHALL exist with the pinned upstream commit SHA

#### Scenario: Existing skill unaffected

- **WHEN** the change is applied to master
- **THEN** the existing `.opencode/skills/open-design-mcp/` skill SHALL be unchanged (no files modified, no files removed)
- **AND** users who only load `open-design-mcp` SHALL see no behavioral change in `od_generate_design`

### Requirement: od_compose_brief formats Turn 3 prompts

The MCP server SHALL expose a tool `od_compose_brief` that accepts structured inputs (page brief, Turn 1 form answers, Turn 2 brand-spec) and returns a single string formatted to match upstream Open Design's recognized Turn 2+ input format (`[form answers — discovery]` / `[brand spec]` / `[page brief]` sections). The tool SHALL be a pure function: no network, no env vars, no auth.

#### Scenario: Tool registered with pure-function semantics

- **WHEN** the MCP server starts and lists tools via `tools/list`
- **THEN** the tool list SHALL include `od_compose_brief`
- **AND** the tool list SHALL contain exactly 9 tools (the existing 8 + `od_compose_brief`)
- **AND** `od_compose_brief`'s description SHALL state it is a formatter helper used BEFORE `od_generate_design`
- **AND** invoking `od_compose_brief` with valid inputs SHALL NOT require any `OD_*` or `BYOK_*` env var

#### Scenario: Empty sections are omitted

- **WHEN** a caller invokes `od_compose_brief` with only `pagePrompt` set (no `briefAnswers`, no `brandSpec`)
- **THEN** the returned text SHALL contain the `[page brief]` section
- **AND** the returned text SHALL NOT contain a `[form answers — discovery]` header
- **AND** the returned text SHALL NOT contain a `[brand spec]` header

#### Scenario: Multi-value form fields render correctly

- **WHEN** a caller invokes `od_compose_brief` with `briefAnswers.platform = ['Responsive web', 'Desktop web']`
- **THEN** the returned text SHALL include the line `- platform: Responsive web, Desktop web`
- **AND** an empty array (`platform: []`) SHALL result in the `platform` field being omitted entirely

### Requirement: customInstructions round-trip

When a project's `customInstructions` is set via `od_create_project` or `od_update_project`, the value SHALL be persisted such that a subsequent `od_generate_design` call against the SAME project ID injects that `customInstructions` content into the system prompt sent to the BYOK provider. This contract SHALL hold against any Open Design daemon implementation that (a) round-trips arbitrary `metadata.*` keys via PATCH/GET, regardless of whether (b) the daemon also surfaces the top-level `customInstructions` field on GET.

#### Scenario: Daemon returns metadata.customInstructions but no top-level field

- **WHEN** the daemon's `GET /api/projects/:id` response shape is `{ project: { id, name, metadata: { customInstructions: "BRAND_RULES" }, ... } }` with NO top-level `customInstructions`
- **AND** a caller invokes `od_generate_design` with `projectId` matching that project
- **THEN** the BYOK proxy SHALL receive a system prompt containing the string `"BRAND_RULES"`
- **AND** the read fallback chain (metadata.customInstructions → top-level customInstructions → undefined) SHALL be observable in test mocks

#### Scenario: Both metadata and top-level set with different values

- **WHEN** a project response includes both `metadata.customInstructions = "M_VALUE"` AND `customInstructions = "T_VALUE"` at the top level
- **THEN** the system prompt SHALL receive `"M_VALUE"` (metadata wins)
- **AND** documentation SHALL state this precedence so a future upstream daemon fix doesn't surprise existing users

#### Scenario: Caller sets customInstructions via the MCP tools

- **WHEN** a caller invokes `od_create_project { id, name, customInstructions: "X" }` OR `od_update_project { projectId, customInstructions: "X" }`
- **THEN** the daemon SHALL receive `customInstructions: "X"` AND `metadata.customInstructions: "X"` in the same request payload
- **AND** subsequent `od_get_project` responses on a real daemon SHALL show `metadata.customInstructions = "X"` (proving the stash round-tripped)

### Requirement: od_generate_design controls completion-token cap

The `od_generate_design` tool SHALL accept an optional `maxTokens: number` input that is forwarded to the OD daemon's `/api/proxy/<provider>/stream` POST body. This SHALL replace the daemon's silent built-in default of 8192 tokens (which causes truncation of full-page generations).

#### Scenario: Caller passes explicit maxTokens

- **WHEN** a caller invokes `od_generate_design { projectId, prompt, maxTokens: 32000 }`
- **THEN** the proxy POST body sent to the OD daemon SHALL include `maxTokens: 32000`
- **AND** the integer is forwarded verbatim — the MCP SHALL NOT alter, clamp, or transform the value beyond zod validation

#### Scenario: Caller omits maxTokens

- **WHEN** a caller invokes `od_generate_design { projectId, prompt }` without the `maxTokens` field
- **THEN** the proxy POST body SHALL include `maxTokens: 64000` (the MCP-side default, chosen as 8× the daemon's built-in 8192 to support full-page generations by default)
- **AND** this default SHALL NOT be implicit — the MCP forwards the value explicitly so the daemon never falls back to its own 8192 default

#### Scenario: maxTokens out of range or invalid

- **WHEN** a caller invokes `od_generate_design { projectId, prompt, maxTokens: 0 }` or `maxTokens: 300000` or `maxTokens: 1.5`
- **THEN** the zod schema SHALL reject the call before any network I/O
- **AND** the tool result SHALL include `isError: true` with a message naming the `maxTokens` field
- **AND** valid range is `[1, 200_000]` integers

