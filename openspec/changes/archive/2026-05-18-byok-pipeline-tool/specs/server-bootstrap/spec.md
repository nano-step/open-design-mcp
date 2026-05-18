# Spec Delta: server-bootstrap (byok-pipeline-tool)

Adds 5 MCP tools to the server. Previously `tools/list` returned `[]`; now returns 5 tool definitions. Server bootstrap (`src/server.ts`) now loads core config + instantiates the OD client + registers all tools via `registerAllTools(server, client)`.

## MODIFIED Requirements

### Requirement: MCP initialize handshake

The server SHALL respond correctly to the MCP `initialize` JSON-RPC request and advertise its identity.

The MCP SDK (`@modelcontextprotocol/sdk` ^1.29.0) reports `LATEST_PROTOCOL_VERSION = '2025-11-25'` and `DEFAULT_NEGOTIATED_PROTOCOL_VERSION = '2025-03-26'` (verified at `src/types.ts` of the SDK at v1.29.0). The exact `protocolVersion` returned depends on what the client advertises; assertions below match against the set of supported versions rather than a single literal value.

#### Scenario: Initialize returns server metadata

- **WHEN** an MCP client sends `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0.0.0"}}}` via stdin
- **THEN** the server SHALL respond with a single-line JSON-RPC frame of the shape `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"<one of the SUPPORTED_PROTOCOL_VERSIONS values from SDK 1.29>","capabilities":{...},"serverInfo":{"name":"open-design-mcp","version":"0.1.0"}}}`
- **AND** `result.serverInfo.name` SHALL equal the literal string `"open-design-mcp"`
- **AND** `result.serverInfo.version` SHALL equal the literal string `"0.1.0"` (HB-5 — separate change will read dynamically from package.json)
- **AND** `result.protocolVersion` SHALL be a non-empty string matching the regex `^\d{4}-\d{2}-\d{2}$`
- **AND** the response SHALL be written to stdout terminated by `\n`

#### Scenario: notifications/initialized accepted silently

- **WHEN** the client sends `{"jsonrpc":"2.0","method":"notifications/initialized"}` after a successful initialize
- **THEN** the server SHALL accept the notification without error
- **AND** the server MUST NOT send any response (a notification has no id and expects no reply)

#### Scenario: tools/list returns 5 tools

- **WHEN** an MCP client sends `{"jsonrpc":"2.0","id":2,"method":"tools/list"}` after initialization
- **THEN** the server SHALL respond with a result containing exactly 5 entries in `tools[]`
- **AND** the tool names (sorted) SHALL be: `od_generate_design`, `od_get_project`, `od_lint_artifact`, `od_list_projects`, `od_save_artifact`
- **AND** each tool entry SHALL have a non-empty `description` string
- **AND** each tool entry SHALL have an `inputSchema` field with valid JSON Schema (derived from Zod via `@modelcontextprotocol/sdk`)
- **AND** `od_list_projects` and `od_get_project` SHALL additionally include an `outputSchema` field (read-only tools per design §B10)

#### Scenario: Unknown method returns JSON-RPC error

- **WHEN** an MCP client sends a method the server does not implement (e.g., `"resources/list"`)
- **THEN** the server SHALL respond with a JSON-RPC error of code `-32601` (Method not found) for the given id
- **AND** the server MUST NOT crash or close the transport

## ADDED Requirements

### Requirement: Server boots even without BYOK env vars

`src/server.ts` SHALL NOT crash at startup if BYOK env vars are missing. Only `OD_DAEMON_URL` is required at startup; BYOK is validated lazily on `od_generate_design` invocation.

#### Scenario: Server starts with only OD_DAEMON_URL set

- **WHEN** the server is launched with only `OD_DAEMON_URL=http://localhost:7456` in env
- **AND** `BYOK_*` vars are all unset
- **THEN** the server SHALL start successfully and emit `[open-design-mcp] ready` to stderr
- **AND** `tools/list` SHALL return all 5 tools (including `od_generate_design`)
- **AND** invoking the 4 non-BYOK tools SHALL succeed against a reachable OD daemon
- **AND** invoking `od_generate_design` SHALL return `isError: true` with text starting with `"BYOK not configured"`

#### Scenario: Server fails fast with clear stderr when OD_DAEMON_URL missing

- **WHEN** the server is launched with `OD_DAEMON_URL` unset OR set to a non-URL string
- **THEN** the process SHALL exit with code 1
- **AND** stderr SHALL contain `[open-design-mcp] FATAL: invalid core env vars`
- **AND** stderr SHALL name `OD_DAEMON_URL` and its validation error

### Requirement: od_list_projects tool

The server SHALL register a tool `od_list_projects` that wraps `GET /api/projects` on the OD daemon and returns the list of projects.

#### Scenario: Successful list

- **WHEN** an MCP client calls `tools/call` with `name: "od_list_projects"` and empty `arguments`
- **AND** the OD daemon responds 200 with valid `ProjectsResponse`
- **THEN** the MCP response SHALL have `content[0].type === 'text'`
- **AND** the text SHALL be a human-readable summary listing each project id + name + status (when present)
- **AND** the response SHALL have `structuredContent.projects` matching the simplified `{id, name, kind?, status?}[]` shape

#### Scenario: OD daemon unreachable

- **WHEN** the OD daemon is unreachable (network error, timeout, or non-2xx status)
- **THEN** the response SHALL have `isError: true`
- **AND** `content[0].text` SHALL include a human-readable error message per design §B8

### Requirement: od_get_project tool

The server SHALL register a tool `od_get_project` that wraps `GET /api/projects/:id` and `GET /api/projects/:id/files`, merging the responses.

#### Scenario: Successful get

- **WHEN** `tools/call` invokes `od_get_project` with `{projectId: "valid-id"}`
- **AND** the OD daemon returns valid project + files responses
- **THEN** the MCP response SHALL include the project metadata AND the artifact file list
- **AND** the response SHALL have `structuredContent.project` and `structuredContent.files`

#### Scenario: Project not found

- **WHEN** the OD daemon returns 404 for `/api/projects/<unknown-id>` or its `/files`
- **THEN** the MCP response SHALL have `isError: true`
- **AND** the text SHALL include `"Project not found"` and the requested id

### Requirement: od_generate_design tool (BYOK pipeline)

The server SHALL register a tool `od_generate_design` that composes a system prompt via vendored `composeSystemPrompt`, POSTs to `/api/proxy/<provider>/stream` on the OD daemon, and accumulates the resulting SSE delta events into a single text response.

#### Scenario: Successful generation

- **WHEN** all BYOK env vars are set (`BYOK_BASE_URL`, `BYOK_API_KEY`, `BYOK_MODEL`, optionally `BYOK_PROVIDER`)
- **AND** `tools/call` invokes `od_generate_design` with `{prompt: "create a landing page"}`
- **AND** the OD daemon emits a valid SSE stream (`event: start`, several `event: delta`, `event: end`)
- **THEN** the MCP response SHALL have `content[0].type === 'text'` with the concatenated delta text
- **AND** `isError` SHALL NOT be set or SHALL be `false`

#### Scenario: BYOK env vars missing

- **WHEN** any of `BYOK_BASE_URL`, `BYOK_API_KEY`, `BYOK_MODEL` is unset
- **AND** `tools/call` invokes `od_generate_design`
- **THEN** the response SHALL have `isError: true`
- **AND** `content[0].text` SHALL include `"BYOK not configured"` and name the missing var(s)
- **AND** the OD daemon SHALL NOT be contacted (validation happens before HTTP call)

#### Scenario: AI provider authentication fails

- **WHEN** the OD daemon emits `event: error` mid-stream with an authentication-related message
- **THEN** the response SHALL have `isError: true`
- **AND** `content[0].text` SHALL include the error message from the SSE event

#### Scenario: System prompt uses vendored composeSystemPrompt with streamFormat=plain

- **WHEN** `od_generate_design` is invoked
- **THEN** the system prompt SHALL be composed via the vendored `composeSystemPrompt` function imported from `vendor/od-contracts/src/prompts/system.js`
- **AND** the `streamFormat` argument SHALL be `'plain'` (suppresses tool-call narration appropriate for BYOK API mode)
- **AND** `metadata.kind` SHALL be set to the tool's `kind` input (defaulting to `'prototype'`)
- **AND** `userInstructions` and `projectInstructions` SHALL pass through from tool inputs
- **AND** the `kind` enum values SHALL exactly match the upstream `ProjectKind` type (compile-time enforced via `as const satisfies ReadonlyArray<ProjectKind>`)

#### Scenario: Progress notifications during streaming

- **WHEN** the MCP client provides a `progressToken` in the request `_meta`
- **AND** the OD daemon streams ≥ 25 delta events
- **THEN** the server SHALL emit at least one `notifications/progress` message during accumulation
- **AND** each notification SHALL include the original `progressToken`
- **AND** the count of progress notifications SHALL equal `floor(deltaCount / 25)`

### Requirement: od_save_artifact tool

The server SHALL register a tool `od_save_artifact` wrapping `POST /api/artifacts/save`.

#### Scenario: Successful save

- **WHEN** `tools/call` invokes `od_save_artifact` with valid `{identifier, title, html}`
- **AND** the OD daemon returns 200 with `{path, url}`
- **THEN** the response SHALL include the returned `path` and `url` in `content[0].text`

#### Scenario: Invalid identifier (Zod validation)

- **WHEN** `identifier` does not match `/^[a-z0-9-]+$/` or is shorter than 3 chars or longer than 64
- **THEN** the SDK SHALL reject the call at the input-validation boundary
- **AND** the MCP client SHALL receive an error response (either JSON-RPC `-32602` or a result with `isError: true` per SDK behaviour)

### Requirement: od_lint_artifact tool

The server SHALL register a tool `od_lint_artifact` wrapping `POST /api/artifacts/lint`.

#### Scenario: Successful lint

- **WHEN** `tools/call` invokes `od_lint_artifact` with valid `{html}`
- **AND** the OD daemon returns lint findings
- **THEN** the response SHALL include a formatted summary of findings in `content[0].text`
- **AND** the response SHALL include the `agentMessage` (when present) on its own line prefixed with `Agent:`

#### Scenario: Clean artifact returns zero findings

- **WHEN** the OD daemon returns `{findings: [], agentMessage: undefined}`
- **THEN** the response SHALL have `content[0].text === "Lint: 0 findings."`
- **AND** `isError` SHALL NOT be set
