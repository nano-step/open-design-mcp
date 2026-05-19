# Spec Delta: build-and-ci (fix-generate-design-maxtokens)

Adds caller-controlled completion-token capping to `od_generate_design` to fix silent truncation at the upstream daemon's built-in 8192 default.

## ADDED Requirements

### Requirement: od_generate_design controls completion-token cap

The `od_generate_design` tool SHALL accept an optional `maxTokens: number` input that is forwarded to the OD daemon's `/api/proxy/<provider>/stream` POST body. This SHALL replace the daemon's silent built-in default of 8192 tokens (which causes truncation of full-page generations).

#### Scenario: Caller passes explicit maxTokens

- **WHEN** a caller invokes `od_generate_design { projectId, prompt, maxTokens: 32000 }`
- **THEN** the proxy POST body sent to the OD daemon SHALL include `maxTokens: 32000`
- **AND** the integer is forwarded verbatim — the MCP SHALL NOT alter, clamp, or transform the value beyond zod validation

#### Scenario: Caller omits maxTokens

- **WHEN** a caller invokes `od_generate_design { projectId, prompt }` without the `maxTokens` field
- **THEN** the proxy POST body SHALL include `maxTokens: 64000` (the MCP-side default, chosen as 8× the daemon's built-in 8192 to support full-page generations by default)
- **AND** this default SHALL NOT be implicit — the MCP forwards the value explicitly so the daemon never falls back to its own 8192 default

#### Scenario: maxTokens out of range or invalid

- **WHEN** a caller invokes `od_generate_design { projectId, prompt, maxTokens: 0 }` or `maxTokens: 300000` or `maxTokens: 1.5`
- **THEN** the zod schema SHALL reject the call before any network I/O
- **AND** the tool result SHALL include `isError: true` with a message naming the `maxTokens` field
- **AND** valid range is `[1, 200_000]` integers
