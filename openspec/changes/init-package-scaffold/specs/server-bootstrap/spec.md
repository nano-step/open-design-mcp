# Spec: server-bootstrap

Defines the behavioral contract of the empty MCP server scaffold — what it must do when launched, what it must respond to, and how it must shut down. This is the spec for `src/server.ts`.

## ADDED Requirements

### Requirement: Executable stdio MCP server

The package SHALL produce a runnable binary at `dist/server.js` that boots a Model Context Protocol server over stdio.

#### Scenario: Built binary is executable via node

- **WHEN** the user runs `npm run build` in a clean checkout
- **THEN** the file `dist/server.js` SHALL exist
- **AND** it SHALL have its execute bit set (mode `0o755` or `0o755`-equivalent)
- **AND** its first line SHALL be `#!/usr/bin/env node`

#### Scenario: Binary registered in package.json bin field

- **WHEN** an MCP client config references `"command": "npx", "args": ["-y", "open-design-mcp"]`
- **THEN** npx SHALL resolve to `dist/server.js` via the `bin.open-design-mcp` entry in `package.json`
- **AND** the binary SHALL boot without printing anything to stdout before the MCP handshake

### Requirement: MCP initialize handshake

The server SHALL respond correctly to the MCP `initialize` JSON-RPC request and advertise its identity.

#### Scenario: Initialize returns server metadata

- **WHEN** an MCP client sends `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0.0.0"}}}` via stdin
- **THEN** the server SHALL respond with `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"...","capabilities":{...},"serverInfo":{"name":"open-design-mcp","version":"0.1.0"}}}`
- **AND** the response SHALL be a single line of JSON terminated with `\n`
- **AND** the response SHALL be written to stdout

#### Scenario: tools/list returns empty array

- **WHEN** an MCP client sends `{"jsonrpc":"2.0","id":2,"method":"tools/list"}` after initialization
- **THEN** the server SHALL respond with `{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}`
- **AND** the response MUST NOT include any phantom tool entries

### Requirement: Logging discipline

The server MUST never write to stdout except for MCP protocol traffic.

#### Scenario: Startup messages go to stderr

- **WHEN** the server boots
- **THEN** any startup message such as `"[open-design-mcp] ready"` SHALL be written to `process.stderr`
- **AND** stdout SHALL contain only valid JSON-RPC frames

#### Scenario: No console.log in src/

- **WHEN** the test suite runs a static check `git grep "console.log" src/`
- **THEN** the check SHALL produce zero matches (use `console.error` instead)

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
