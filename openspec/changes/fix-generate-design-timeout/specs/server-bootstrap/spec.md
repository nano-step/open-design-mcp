# Spec Delta: server-bootstrap (fix-generate-design-timeout)

Three modifications to the streaming-generation tool's runtime contract: configurable timeout, partial-result recovery, and the spec-correct progress-notification behavior preserved.

## ADDED Requirements

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

## MODIFIED Requirements

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

## Notes

This change does not introduce an async-job pattern, persistent partial output on the OD daemon, or incremental artifact streaming. Those are tracked as separate future work in the proposal's §F6.
