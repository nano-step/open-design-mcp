# Spec Delta: server-bootstrap (byok-pipeline-tool)

Adds 5 MCP tools to the server. Previously `tools/list` returned `[]`; now returns 5 tool definitions.

## MODIFIED Requirements

### Requirement: tools/list response shape

After `byok-pipeline-tool` is applied, the server SHALL advertise exactly 5 tools via `tools/list`.

#### Scenario: tools/list returns 5 tools

- **WHEN** an MCP client calls `tools/list` after completing the `initialize` handshake
- **THEN** the response SHALL contain exactly 5 entries in `tools[]`
- **AND** the tool names SHALL be (alphabetical): `od_generate_design`, `od_get_project`, `od_lint_artifact`, `od_list_projects`, `od_save_artifact`
- **AND** each tool entry SHALL have a non-empty `description` field
- **AND** each tool entry SHALL have an `inputSchema` field with valid JSON Schema (derived from Zod via `@modelcontextprotocol/sdk`)

## ADDED Requirements

### Requirement: od_list_projects tool

The server SHALL register a tool `od_list_projects` that wraps `GET /api/projects` on the OD daemon and returns the list of projects.

#### Scenario: Successful list

- **WHEN** an MCP client calls `tools/call` with `name: "od_list_projects"` and empty `arguments`
- **AND** the OD daemon responds 200 with valid `ProjectsResponse`
- **THEN** the MCP response SHALL have `content[0].type === 'text'`
- **AND** the text SHALL be a JSON-stringified summary of project ids + names + status
- **AND** the response SHALL have `structuredContent.projects` matching the OD `Project[]` shape

#### Scenario: OD daemon unreachable

- **WHEN** the OD daemon is unreachable (network error, timeout)
- **THEN** the response SHALL have `isError: true`
- **AND** `content[0].text` SHALL include a human-readable error message

### Requirement: od_get_project tool

The server SHALL register a tool `od_get_project` that wraps `GET /api/projects/:id` and `GET /api/projects/:id/files`, merging the responses.

#### Scenario: Successful get

- **WHEN** `tools/call` invokes `od_get_project` with `{projectId: "valid-id"}`
- **AND** the OD daemon returns valid project + files responses
- **THEN** the MCP response SHALL include the project metadata AND the artifact file list

#### Scenario: Project not found

- **WHEN** the OD daemon returns 404 for `/api/projects/<unknown-id>`
- **THEN** the MCP response SHALL have `isError: true`
- **AND** the text SHALL include `"Project not found"` and the requested id

### Requirement: od_generate_design tool (BYOK)

The server SHALL register a tool `od_generate_design` that composes a system prompt via vendored `composeSystemPrompt`, POSTs to `/api/proxy/<provider>/stream` on the OD daemon, and accumulates the resulting SSE delta events into a single text response.

#### Scenario: Successful generation

- **WHEN** all BYOK env vars are set (`BYOK_BASE_URL`, `BYOK_API_KEY`, `BYOK_MODEL`, optionally `BYOK_PROVIDER`)
- **AND** `tools/call` invokes `od_generate_design` with `{prompt: "create a landing page"}`
- **AND** OD daemon emits valid SSE stream (`event: start`, several `event: delta`, `event: end`)
- **THEN** the MCP response SHALL have `content[0].type === 'text'` with the concatenated delta text
- **AND** `isError` SHALL NOT be set or SHALL be `false`

#### Scenario: BYOK env vars missing

- **WHEN** any of `BYOK_BASE_URL`, `BYOK_API_KEY`, `BYOK_MODEL` is unset
- **AND** `tools/call` invokes `od_generate_design`
- **THEN** the response SHALL have `isError: true`
- **AND** `content[0].text` SHALL include `"BYOK not configured"` and name the missing var(s)
- **AND** the OD daemon SHALL NOT be contacted (validation happens before HTTP call)

#### Scenario: AI provider authentication fails

- **WHEN** OD daemon emits `event: error` with `code: "UNAUTHORIZED"`
- **THEN** the response SHALL have `isError: true`
- **AND** `content[0].text` SHALL include the error message from the SSE event

#### Scenario: System prompt uses vendored composeSystemPrompt with streamFormat=plain

- **WHEN** `od_generate_design` is invoked
- **THEN** the system prompt SHALL be composed via the vendored `composeSystemPrompt` function imported from `vendor/od-contracts/src/prompts/system.js`
- **AND** the `streamFormat` argument SHALL be `'plain'` (suppresses tool-call narration appropriate for BYOK API mode)
- **AND** `metadata.kind` SHALL be set to the tool's `kind` input (defaulting to `'prototype'`)
- **AND** `userInstructions` and `projectInstructions` SHALL pass through from tool inputs

#### Scenario: Progress notifications during streaming

- **WHEN** the MCP client provides a `progressToken` in the request `_meta`
- **AND** OD daemon streams ≥25 delta events
- **THEN** the server SHALL emit at least one `notifications/progress` message during accumulation
- **AND** the notification SHALL include the original `progressToken`
- **AND** the `relatedRequestId` SHALL match the tool call request id

### Requirement: od_save_artifact tool

The server SHALL register a tool `od_save_artifact` wrapping `POST /api/artifacts/save`.

#### Scenario: Successful save

- **WHEN** `tools/call` invokes `od_save_artifact` with valid `{identifier, title, html}`
- **AND** OD daemon returns 200 with `{path, url}`
- **THEN** the response SHALL include the returned `path` and `url` in `content[0].text`

#### Scenario: Invalid identifier (Zod validation)

- **WHEN** `identifier` does not match `/^[a-z0-9-]+$/` or is shorter than 3 chars
- **THEN** the SDK SHALL reject the call before the handler runs
- **AND** the MCP client SHALL receive a JSON-RPC error with code `-32602`

### Requirement: od_lint_artifact tool

The server SHALL register a tool `od_lint_artifact` wrapping `POST /api/artifacts/lint`.

#### Scenario: Successful lint

- **WHEN** `tools/call` invokes `od_lint_artifact` with valid `{html}`
- **AND** OD daemon returns lint findings
- **THEN** the response SHALL include the `agentMessage` (prose summary) in `content[0].text`
- **AND** the response MAY include findings array in `structuredContent`

### Requirement: Server boots even without BYOK env vars

`src/server.ts` SHALL NOT crash at startup if BYOK env vars are missing. Only `OD_DAEMON_URL` is required at startup; BYOK is validated lazily on `od_generate_design` invocation.

#### Scenario: Server starts with only OD_DAEMON_URL set

- **WHEN** the server is launched with only `OD_DAEMON_URL=http://localhost:7456` in env
- **AND** `BYOK_*` vars are all unset
- **THEN** the server SHALL start successfully and emit `[open-design-mcp] ready` to stderr
- **AND** `tools/list` SHALL return all 5 tools (including `od_generate_design`)
- **AND** invoking the 4 non-BYOK tools SHALL succeed against a reachable OD daemon
- **AND** invoking `od_generate_design` SHALL return `isError: true` with `"BYOK not configured"`
