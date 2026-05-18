# Spec Delta: build-and-ci (project-lifecycle-tools)

Extends unit + integration test coverage to include the three new lifecycle tools and the new OdClient methods.

## MODIFIED Requirements

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
