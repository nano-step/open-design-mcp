# Spec Delta: server-bootstrap (project-lifecycle-tools)

Adds three new MCP tools (`od_create_project`, `od_update_project`, `od_delete_project`) wrapping the OD daemon's project-lifecycle endpoints. Brings the registered tool count from 5 to 8. Modifies the existing `tools/list returns 5 tools` scenario to reflect the new count.

## ADDED Requirements

### Requirement: od_create_project tool

The server SHALL register a tool `od_create_project` that wraps `POST /api/projects` on the OD daemon and creates a new project plus its auto-seeded default conversation.

#### Scenario: Happy path returns project + conversationId

- **WHEN** the tool is invoked with `{id: "smoke-001", name: "Smoke Test"}`
- **AND** the OD daemon responds with `200 {project: {id: "smoke-001", name: "Smoke Test", ...}, conversationId: "<uuid>"}`
- **THEN** the tool SHALL return a `content[0].text` summary mentioning the project id, name, and conversation id
- **AND** the result SHALL include `structuredContent` matching `{project, conversationId}`
- **AND** `isError` SHALL be undefined or false

#### Scenario: Invalid id is rejected client-side before HTTP call

- **WHEN** the tool is invoked with `{id: "has spaces", name: "X"}` (does NOT match `/^[A-Za-z0-9._-]{1,128}$/`)
- **THEN** the tool SHALL return a Zod validation error (JSON-RPC code `-32602`)
- **AND** the server MUST NOT issue any HTTP request to the OD daemon
- **AND** the error message SHALL name the allowed character class

#### Scenario: 400 from daemon surfaces daemon message

- **WHEN** the daemon responds with `400 BAD_REQUEST {error: {message: "invalid project id"}}`
- **THEN** the tool SHALL return `isError: true`
- **AND** the response text SHALL convey the daemon's reason

#### Scenario: customInstructions length limit enforced client-side

- **WHEN** the tool is invoked with `customInstructions` longer than 5000 characters
- **THEN** the tool SHALL return a Zod validation error before any HTTP call

### Requirement: od_update_project tool

The server SHALL register a tool `od_update_project` that wraps `PATCH /api/projects/:id` and updates mutable project fields.

#### Scenario: Happy path returns updated project

- **WHEN** the tool is invoked with `{projectId: "smoke-001", name: "Smoke Test (updated)"}`
- **AND** the daemon responds `200 {project: {id: "smoke-001", name: "Smoke Test (updated)", ...}}`
- **THEN** the tool SHALL return a summary including the new name
- **AND** `structuredContent` SHALL include the returned `project`
- **AND** `isError` SHALL be undefined or false

#### Scenario: Empty patch rejected client-side

- **WHEN** the tool is invoked with only `{projectId: "smoke-001"}` and no mutable fields
- **THEN** the tool SHALL return a Zod validation error stating at least one of name/customInstructions/kind/fidelity/linkedDirs is required
- **AND** the server MUST NOT issue any HTTP request

#### Scenario: 404 maps to friendly Project-not-found

- **WHEN** the daemon responds `404` for an unknown projectId
- **THEN** the tool SHALL return `isError: true`
- **AND** the response text SHALL begin with `Project not found:` followed by the projectId

### Requirement: od_delete_project tool

The server SHALL register a tool `od_delete_project` that wraps `DELETE /api/projects/:id`. The tool description SHALL warn that the delete is permanent.

#### Scenario: Happy path returns ok confirmation

- **WHEN** the tool is invoked with `{projectId: "smoke-001"}`
- **AND** the daemon responds `200 {ok: true}`
- **THEN** the tool SHALL return a text confirmation mentioning the deleted projectId
- **AND** `isError` SHALL be undefined or false

#### Scenario: Description warns of permanence

- **WHEN** an MCP client retrieves the tool's metadata via `tools/list`
- **THEN** the tool's `description` SHALL contain the word "permanent" or "PERMANENTLY" (case-insensitive match) to signal irreversibility to LLM callers

#### Scenario: 404 maps to friendly Project-not-found

- **WHEN** the daemon responds `404` for an unknown projectId
- **THEN** the tool SHALL return `isError: true`
- **AND** the response text SHALL begin with `Project not found:` followed by the projectId

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

#### Scenario: tools/list returns 8 tools

- **WHEN** an MCP client sends `{"jsonrpc":"2.0","id":2,"method":"tools/list"}` after initialization
- **THEN** the server SHALL respond with a result containing exactly 8 entries in `tools[]`
- **AND** the tool names (sorted) SHALL be: `od_create_project`, `od_delete_project`, `od_generate_design`, `od_get_project`, `od_lint_artifact`, `od_list_projects`, `od_save_artifact`, `od_update_project`
- **AND** each tool entry SHALL have a non-empty `description` string
- **AND** each tool entry SHALL have an `inputSchema` field with valid JSON Schema (derived from Zod via `@modelcontextprotocol/sdk`)
- **AND** `od_list_projects` and `od_get_project` SHALL additionally include an `outputSchema` field (read-only tools per design §B10 of byok-pipeline-tool)

#### Scenario: Unknown method returns JSON-RPC error

- **WHEN** an MCP client sends a method the server does not implement (e.g., `"resources/list"`)
- **THEN** the server SHALL respond with a JSON-RPC error of code `-32601` (Method not found) for the given id
