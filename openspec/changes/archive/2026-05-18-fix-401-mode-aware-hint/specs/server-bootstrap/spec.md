# Spec Delta: server-bootstrap (fix-401-mode-aware-hint)

Adds a single new requirement: 401 error messages from any tool SHALL reflect the configured auth mode, so users receive an actionable hint pointing at the env var(s) they actually configured.

## ADDED Requirements

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
