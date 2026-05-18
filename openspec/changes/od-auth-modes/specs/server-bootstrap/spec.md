# Spec Delta: server-bootstrap (od-auth-modes)

Extends the server bootstrap contract with HTTP Basic Auth support for non-loopback OD deployments behind reverse-proxy auth. Adds two new requirements (Basic Auth + embedded-credentials rejection) and modifies two existing requirements (Logging discipline + Server boots even without BYOK env vars) to cover the new env-var surface.

## ADDED Requirements

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

## MODIFIED Requirements

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
