# Spec Delta: server-bootstrap (vendor-sync-initial)

> **Revision**: v2. Test target realigned to `resources/list` per HB-3 verbatim (was `tools/call` in v1 due to scope drift). Resolves Metis A-1.

Strengthens integration test coverage per HB-3. No change to the server's runtime behavior — the new tests verify pre-existing behavior that was previously untested.

## ADDED Requirements

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
