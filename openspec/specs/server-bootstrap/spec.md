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
- **AND** `result.serverInfo.version` SHALL equal the literal string `"0.1.0"`
- **AND** `result.protocolVersion` SHALL be a non-empty string matching the regex `^\d{4}-\d{2}-\d{2}$`
- **AND** the response SHALL be written to stdout terminated by `\n`

#### Scenario: notifications/initialized accepted silently

- **WHEN** the client sends `{"jsonrpc":"2.0","method":"notifications/initialized"}` after a successful initialize
- **THEN** the server SHALL accept the notification without error
- **AND** the server MUST NOT send any response (a notification has no id and expects no reply)

#### Scenario: tools/list returns empty array

- **WHEN** an MCP client sends `{"jsonrpc":"2.0","id":2,"method":"tools/list"}` after initialization
- **THEN** the server SHALL respond with `{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}`
- **AND** the response MUST NOT include any phantom tool entries

#### Scenario: Unknown method returns JSON-RPC error

- **WHEN** an MCP client sends a method the server does not implement (e.g., `"resources/list"`)
- **THEN** the server SHALL respond with a JSON-RPC error of code `-32601` (Method not found) for the given id
- **AND** the server MUST NOT crash or close the transport

### Requirement: Logging discipline

The server MUST never write to stdout except for MCP protocol traffic.

#### Scenario: Startup messages go to stderr

- **WHEN** the server boots
- **THEN** any startup message such as `"[open-design-mcp] ready"` SHALL be written to `process.stderr`
- **AND** stdout SHALL contain only valid JSON-RPC frames

#### Scenario: No console.log in our authored source

- **WHEN** the test suite runs `git grep -n "console.log" src/`
- **THEN** the check SHALL produce zero matches (`console.error` is required instead)
- **AND** this restriction SHALL apply ONLY to `src/` and NOT to `scripts/` (bash) or `vendor/` (vendored upstream code) or `tests/`

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

