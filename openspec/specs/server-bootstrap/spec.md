# server-bootstrap Specification

## Purpose
TBD - created by archiving change init-package-scaffold. Update Purpose after archive.
## Requirements
### Requirement: Executable stdio MCP server

The package SHALL produce a runnable binary at `dist/src/server.js` that boots a Model Context Protocol server over stdio.

#### Scenario: Built binary is executable via node

- **WHEN** the user runs `npm run build` in a clean checkout
- **THEN** the file `dist/src/server.js` SHALL exist
- **AND** it SHALL have its execute bit set (mode includes `0o100` for user execute)
- **AND** its first line SHALL be `#!/usr/bin/env node`

#### Scenario: Binary registered in package.json bin field

- **WHEN** an MCP client config references `"command": "npx", "args": ["-y", "open-design-mcp"]`
- **THEN** npx SHALL resolve to `dist/src/server.js` via the `bin.open-design-mcp` entry in `package.json`
- **AND** the binary SHALL boot without printing anything to stdout before the MCP handshake

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

### Requirement: Logging discipline

The server SHALL NOT log secrets, request bodies containing API keys, or `Authorization` headers in any form, regardless of auth mode.

#### Scenario: BYOK API key never logged

- **WHEN** the server is operating normally with valid env vars including `BYOK_API_KEY=sk-test-secret-123`
- **THEN** no log line emitted to stdout SHALL contain the literal string `sk-test-secret-123`
- **AND** no log line emitted to stderr SHALL contain it

#### Scenario: Authorization header never logged (any mode)

- **WHEN** the server makes outbound HTTP requests to the OD daemon under any of `OD_AUTH_MODE` ∈ {`none`, `bearer`, `basic`}
- **THEN** no log line SHALL include the literal string `Authorization:` followed by the credential value
- **AND** no log line SHALL include the literal value of `OD_API_TOKEN` (when set)
- **AND** no log line SHALL include the literal value of `OD_BASIC_PASS` (when set)
- **AND** no log line SHALL include any `Basic <base64>` encoded credential string

#### Scenario: Error messages redact credentials

- **WHEN** an `OdHttpError` is raised because the OD daemon returns a non-2xx status
- **THEN** `error.message` SHALL NOT contain the literal value of `OD_BASIC_PASS` or `OD_API_TOKEN`
- **AND** `error.bodySnippet` (if present) SHALL NOT contain those values

### Requirement: Clean shutdown on signals

The server SHALL handle SIGINT and SIGTERM by closing its transport and exiting with code 0.

#### Scenario: SIGINT triggers graceful exit

- **WHEN** the server process receives SIGINT
- **THEN** it SHALL call `transport.close()` before exit
- **AND** it SHALL exit with code 0 within 2 seconds
- **AND** it MUST NOT leave child processes or open file handles

#### Scenario: SIGTERM triggers graceful exit

- **WHEN** the server process receives SIGTERM
- **THEN** the behavior SHALL be identical to SIGINT

### Requirement: Engines and runtime

The package SHALL declare a Node.js minimum version of 20 and SHALL refuse to install on older runtimes.

#### Scenario: package.json engines

- **WHEN** `package.json` is read
- **THEN** the `engines.node` field SHALL be `">=20"`
- **AND** `npm install` on Node 18 SHALL emit an `EBADENGINE` warning or refuse install

#### Scenario: ESM module type

- **WHEN** `package.json` is read
- **THEN** the `type` field SHALL be `"module"`
- **AND** all source `.ts` files in `src/` SHALL import dependencies with explicit `.js` extensions (Node16 module resolution)

### Requirement: Unadvertised capability method returns JSON-RPC error -32601

When a client invokes a method whose capability the server did NOT advertise during `initialize` (e.g. `resources/list` when the server advertised only `tools`), the server SHALL respond with JSON-RPC error code `-32601` (Method not found).

#### Scenario: Integration test exercises resources/list path

- **WHEN** the integration test suite (`tests/integration/initialize-handshake.test.ts`) runs
- **THEN** it SHALL include a test case named `"rejects resources/list with -32601 (capability not advertised)"`
- **AND** the test SHALL spawn the built server binary (`dist/src/server.js`) via `StdioClientTransport`
- **AND** the test SHALL complete the MCP `initialize` handshake
- **AND** the test SHALL invoke `client.listResources()`
- **AND** the call SHALL reject with an error whose `code === -32601` (exact integer)
- **AND** the test SHALL close the client cleanly

### Requirement: SIGINT triggers graceful shutdown

When the server process receives `SIGINT`, it SHALL exit with code 0 within 2000 milliseconds. No zombie process or hung stdio.

#### Scenario: Integration test exercises SIGINT path

- **WHEN** the integration test suite runs
- **THEN** it SHALL include a test case named `"shuts down gracefully on SIGINT within 2 seconds"`
- **AND** the test SHALL spawn the built server binary directly via `child_process.spawn` (NOT via `StdioClientTransport`, to retain raw signal control)
- **AND** the test SHALL wait for the server's stderr line containing `[open-design-mcp] ready` before sending the signal
- **AND** the test SHALL send `SIGINT` to the process
- **AND** the child process SHALL emit `exit` event with `code === 0` (exact integer)
- **AND** the elapsed wall-clock time between sending SIGINT and the `exit` event SHALL be less than 2000 milliseconds
- **AND** after exit, `process.kill(child.pid, 0)` SHALL throw an error with `code === 'ESRCH'` (process truly gone)
- **AND** the vitest per-test timeout SHALL be 5000 milliseconds (framework safety net, NOT the behavioral assertion)

### Requirement: Integration test suite size

After `vendor-sync-initial` is applied, the integration test suite SHALL contain at least 5 test cases (3 pre-existing + 2 new HB-3 cases).

#### Scenario: Test count verifies suite growth

- **WHEN** `npm run test:integration` runs
- **THEN** the test runner output SHALL report ≥ 5 passing tests under `tests/integration/initialize-handshake.test.ts`
- **AND** zero failing or skipped tests

### Requirement: Server boots even without BYOK env vars

`src/server.ts` SHALL NOT crash at startup if BYOK env vars are missing. Only `OD_DAEMON_URL` is required at startup; BYOK is validated lazily on `od_generate_design` invocation. Auth mode is resolved at startup from `OD_AUTH_MODE` and sibling credential vars per the HTTP Basic Auth requirement.

#### Scenario: Server starts with only OD_DAEMON_URL set

- **WHEN** the server is launched with only `OD_DAEMON_URL=http://localhost:7456` in env
- **AND** `BYOK_*`, `OD_AUTH_MODE`, `OD_API_TOKEN`, `OD_BASIC_USER`, `OD_BASIC_PASS` are all unset
- **THEN** the server SHALL start successfully and emit `[open-design-mcp] ready` to stderr
- **AND** the resolved auth mode SHALL be `none`
- **AND** `tools/list` SHALL return all 5 tools (including `od_generate_design`)
- **AND** invoking the 4 non-BYOK tools SHALL succeed against a reachable OD daemon
- **AND** invoking `od_generate_design` SHALL return `isError: true` with text starting with `"BYOK not configured"`

#### Scenario: Server fails fast with clear stderr when OD_DAEMON_URL missing

- **WHEN** the server is launched with `OD_DAEMON_URL` unset OR set to a non-URL string
- **THEN** the process SHALL exit with code 1
- **AND** stderr SHALL contain `[open-design-mcp] FATAL: invalid core env vars`
- **AND** stderr SHALL name `OD_DAEMON_URL` and its validation error

#### Scenario: Server fails fast on invalid auth configuration

- **WHEN** the server is launched with `OD_DAEMON_URL` valid but auth env vars in an invalid combination (per the HTTP Basic Auth requirement scenarios)
- **THEN** the process SHALL exit with code 1
- **AND** stderr SHALL contain `[open-design-mcp] FATAL: invalid core env vars`
- **AND** stderr SHALL name the offending auth env var(s) and explain the constraint

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

### Requirement: HTTP Basic Auth mode for OD daemon transport

The server SHALL support emitting an `Authorization: Basic <base64(user:pass)>` header on every request to the OD daemon when configured for HTTP Basic Auth, enabling use against hosted Open Design deployments fronted by reverse-proxy Basic Auth (e.g. `https://od.thnkandgrow.com/`).

#### Scenario: Resolve mode=basic from explicit env var

- **WHEN** the server is launched with `OD_DAEMON_URL=http://mock/`, `OD_AUTH_MODE=basic`, `OD_BASIC_USER=alice`, `OD_BASIC_PASS=secret`
- **THEN** every outbound HTTP request from `OdClient` SHALL include the header `Authorization: Basic YWxpY2U6c2VjcmV0`
  (where `YWxpY2U6c2VjcmV0` is `base64('alice:secret')`)
- **AND** the server SHALL boot successfully

#### Scenario: Resolve mode=basic by inference

- **WHEN** the server is launched with `OD_DAEMON_URL=http://mock/`, `OD_BASIC_USER=alice`, `OD_BASIC_PASS=secret` and no `OD_AUTH_MODE` set
- **AND** `OD_API_TOKEN` is unset
- **THEN** the resolved auth mode SHALL be `basic`
- **AND** every outbound HTTP request SHALL include `Authorization: Basic <base64(alice:secret)>`

#### Scenario: Resolve mode=bearer by inference (regression)

- **WHEN** the server is launched with `OD_DAEMON_URL=http://mock/`, `OD_API_TOKEN=tok123` and no `OD_AUTH_MODE` set
- **AND** `OD_BASIC_USER` and `OD_BASIC_PASS` are unset
- **THEN** the resolved auth mode SHALL be `bearer`
- **AND** every outbound HTTP request SHALL include `Authorization: Bearer tok123`

#### Scenario: Resolve mode=none by inference (regression)

- **WHEN** the server is launched with only `OD_DAEMON_URL=http://mock/` set
- **AND** none of `OD_AUTH_MODE`, `OD_API_TOKEN`, `OD_BASIC_USER`, `OD_BASIC_PASS` are set
- **THEN** the resolved auth mode SHALL be `none`
- **AND** outbound HTTP requests SHALL NOT include any `Authorization` header

#### Scenario: Fail fast on ambiguous defaults

- **WHEN** the server is launched with both `OD_API_TOKEN=tok` AND `OD_BASIC_USER=alice` AND `OD_BASIC_PASS=secret` and no `OD_AUTH_MODE` set
- **THEN** the process SHALL exit with code 1
- **AND** stderr SHALL contain a message instructing the user to set `OD_AUTH_MODE=bearer` or `OD_AUTH_MODE=basic` to disambiguate

#### Scenario: Fail fast on mode=basic with missing credentials

- **WHEN** the server is launched with `OD_AUTH_MODE=basic` but `OD_BASIC_USER` or `OD_BASIC_PASS` is missing or empty
- **THEN** the process SHALL exit with code 1
- **AND** stderr SHALL name `OD_BASIC_USER` and `OD_BASIC_PASS` as required when `OD_AUTH_MODE=basic`

#### Scenario: Fail fast on mode=bearer with missing token

- **WHEN** the server is launched with `OD_AUTH_MODE=bearer` but `OD_API_TOKEN` is missing or empty
- **THEN** the process SHALL exit with code 1
- **AND** stderr SHALL name `OD_API_TOKEN` as required when `OD_AUTH_MODE=bearer`

#### Scenario: Reject invalid mode value

- **WHEN** the server is launched with `OD_AUTH_MODE=oauth` (any value not in `none|bearer|basic`)
- **THEN** the process SHALL exit with code 1
- **AND** stderr SHALL name the allowed mode values

### Requirement: Embedded credentials in OD_DAEMON_URL are rejected

The server SHALL reject `OD_DAEMON_URL` values containing embedded credentials (`https://user:pass@host/`) at startup, to prevent credential leakage into logs and error messages.

#### Scenario: URL with embedded user:pass

- **WHEN** the server is launched with `OD_DAEMON_URL=https://alice:secret@od.example.com/`
- **THEN** the process SHALL exit with code 1
- **AND** stderr SHALL explain that embedded credentials are not supported
- **AND** stderr SHALL direct the user to set `OD_BASIC_USER` and `OD_BASIC_PASS` instead
- **AND** stderr MUST NOT echo the embedded password verbatim

#### Scenario: URL with embedded username only

- **WHEN** the server is launched with `OD_DAEMON_URL=https://alice@od.example.com/`
- **THEN** the process SHALL exit with code 1 with the same redirection to `OD_BASIC_*`

### Requirement: Tool error messages for 401 are auth-mode-aware

When the OD daemon returns HTTP 401 to any registered tool, the tool SHALL return an `isError: true` result whose text identifies the env var(s) the user should check, based on the resolved `OD_AUTH_MODE`.

#### Scenario: 401 in bearer mode

- **WHEN** the resolved auth mode is `bearer` (via explicit `OD_AUTH_MODE=bearer` or default inference from `OD_API_TOKEN`)
- **AND** the OD daemon returns HTTP 401 to any tool invocation
- **THEN** the tool SHALL return `isError: true`
- **AND** the response text SHALL equal `OD auth failed — check OD_API_TOKEN`

#### Scenario: 401 in basic mode

- **WHEN** the resolved auth mode is `basic` (via explicit `OD_AUTH_MODE=basic` or default inference from `OD_BASIC_USER`+`OD_BASIC_PASS`)
- **AND** the OD daemon returns HTTP 401 to any tool invocation
- **THEN** the tool SHALL return `isError: true`
- **AND** the response text SHALL equal `OD auth failed — check OD_BASIC_USER and OD_BASIC_PASS`

#### Scenario: 401 in none mode

- **WHEN** the resolved auth mode is `none` (no auth env vars set)
- **AND** the OD daemon returns HTTP 401 to any tool invocation
- **THEN** the tool SHALL return `isError: true`
- **AND** the response text SHALL equal `OD daemon returned 401 — set OD_AUTH_MODE and credentials`

#### Scenario: Non-401 errors unchanged across modes

- **WHEN** the OD daemon returns HTTP 403, 404, 429, or any 5xx status
- **THEN** the tool error message SHALL NOT vary based on auth mode
- **AND** the existing message templates SHALL be preserved verbatim

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

### Requirement: Configurable generation timeout

The server SHALL accept an `OD_GENERATE_TIMEOUT_MS` environment variable that controls how long `od_generate_design` waits for an upstream stream to complete before aborting it server-side.

#### Scenario: Default timeout applies when env var unset

- **WHEN** the server starts with `OD_GENERATE_TIMEOUT_MS` unset
- **THEN** `od_generate_design` SHALL use a default timeout of 600000 milliseconds (10 minutes)

#### Scenario: Explicit timeout honored

- **WHEN** the server starts with `OD_GENERATE_TIMEOUT_MS=300000`
- **AND** `od_generate_design` is invoked
- **THEN** the server SHALL abort the upstream stream after 300000 milliseconds if it has not completed
- **AND** the abort SHALL surface as a `TimeoutError` DOMException in the handler

#### Scenario: Invalid timeout crashes startup

- **WHEN** the server starts with `OD_GENERATE_TIMEOUT_MS="abc"` (non-numeric) or `OD_GENERATE_TIMEOUT_MS=0` (non-positive)
- **THEN** the server SHALL exit non-zero with a clear stderr message identifying `OD_GENERATE_TIMEOUT_MS` as the failing field

### Requirement: Partial-result recovery on abort or timeout

When `od_generate_design`'s upstream stream is aborted (by server-side timeout or by the caller's signal) **after** at least one SSE delta has been accumulated, the tool SHALL return the accumulated content with `isError: true` and a trailing HTML comment marker that distinguishes timeout from caller cancellation.

#### Scenario: Server-side timeout mid-stream with content

- **WHEN** the upstream stream emits N (>0) delta events, then the server-side `AbortSignal.timeout` fires
- **THEN** the tool SHALL return `{ content: [{ type: 'text', text: <accumulated> + '\n\n<!-- Generation timed out after Nms at N deltas (M chars). Output is incomplete. Increase OD_GENERATE_TIMEOUT_MS or slice the prompt into smaller sections. -->' }], isError: true }`

#### Scenario: Caller cancellation mid-stream with content

- **WHEN** the upstream stream emits N (>0) delta events, then the caller-supplied AbortSignal fires
- **THEN** the tool SHALL return `{ content: [{ type: 'text', text: <accumulated> + '\n\n<!-- Generation cancelled by client at N deltas (M chars). Output is incomplete. -->' }], isError: true }`

#### Scenario: Abort with zero deltas falls through to existing error path

- **WHEN** the upstream stream is aborted before any delta is accumulated
- **THEN** the tool SHALL NOT return any partial content
- **AND** the tool SHALL return the result of `mapErrorToToolResult(err, client.authMode)` (the existing error-mapping path)

### Requirement: Progress notifications respect MCP spec

The server SHALL emit `notifications/progress` only when the client has provided a `progressToken` in the original `tools/call` request's `_meta.progressToken` field, per the MCP specification's normative requirement that progress notifications MUST only reference tokens provided in an active request.

#### Scenario: Client provided progressToken

- **WHEN** the client invokes `od_generate_design` with `_meta.progressToken = "tok-42"`
- **AND** the upstream stream emits enough deltas to cross a `PROGRESS_EVERY` boundary
- **THEN** the server SHALL send `notifications/progress` events with `progressToken: "tok-42"`

#### Scenario: Client did not provide progressToken

- **WHEN** the client invokes `od_generate_design` without `_meta.progressToken`
- **AND** the upstream stream emits any number of deltas
- **THEN** the server SHALL NOT emit any `notifications/progress` events (sending unsolicited progress would violate the MCP spec's MUST that progress tokens reference an active request, and the TypeScript SDK error-logs and discards unsolicited progress)

### Requirement: od_generate_design auto-fetches stored customInstructions

When `od_generate_design` is invoked with a `projectId` argument, the server SHALL fetch the project record via `GET /api/projects/<id>` BEFORE composing the system prompt, and SHALL thread the project's stored `customInstructions` value into the system prompt as `projectInstructions` (Layer 6 of `composeSystemPrompt`).

#### Scenario: projectId provided, project has customInstructions

- **WHEN** the client invokes `od_generate_design { prompt: "pricing page", projectId: "proj-abc" }` with no `projectInstructions` argument
- **AND** the project record at `proj-abc` has `customInstructions: "brand: indigo, type: Inter"`
- **THEN** the server SHALL call `client.getProject('proj-abc', signal)` exactly once
- **AND** the server SHALL pass `projectInstructions: "brand: indigo, type: Inter"` to `composeSystemPrompt`
- **AND** the upstream LLM request SHALL include those instructions in the system prompt

#### Scenario: projectId provided, both stored and per-call instructions

- **WHEN** the client invokes `od_generate_design { prompt: "...", projectId: "proj-abc", projectInstructions: "OVERRIDE: ..." }`
- **AND** the project record at `proj-abc` has `customInstructions: "brand: indigo, type: Inter"`
- **THEN** the server SHALL merge the two strings with a `\n\n---\n\n` separator, with the stored value FIRST and the per-call value AFTER
- **AND** the merged string SHALL be passed to `composeSystemPrompt` as `projectInstructions`
- **AND** the per-call value appearing after the stored value SHALL function as the more-recent / freshest signal to the LLM

#### Scenario: projectId provided, project has no customInstructions

- **WHEN** the client invokes `od_generate_design { prompt: "...", projectId: "proj-abc" }` with optional `projectInstructions`
- **AND** the project record at `proj-abc` has no `customInstructions` (undefined or empty string)
- **THEN** the server SHALL fall back to the per-call `projectInstructions` value (or `undefined` if not provided)
- **AND** behavior SHALL be identical to invoking without `projectId` plus the per-call value

#### Scenario: projectId points at missing project

- **WHEN** the client invokes `od_generate_design { prompt: "...", projectId: "proj-nonexistent" }`
- **AND** the daemon returns HTTP 404 for `GET /api/projects/proj-nonexistent`
- **THEN** the server SHALL return the result of `mapErrorToToolResult(err, client.authMode)` — the same 404 shape `od_get_project` returns ("Project not found: proj-nonexistent")
- **AND** the upstream LLM request SHALL NOT be made (no BYOK tokens consumed)

#### Scenario: projectId omitted (backwards compatibility)

- **WHEN** the client invokes `od_generate_design { prompt: "..." }` without `projectId`
- **THEN** the server SHALL NOT call `client.getProject`
- **AND** behavior SHALL be identical to the pre-change implementation (per-call `projectInstructions` used directly, or omitted if not provided)
- **AND** no additional HTTP round-trip SHALL be incurred

