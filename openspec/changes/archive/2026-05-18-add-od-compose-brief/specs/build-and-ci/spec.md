# Spec Delta: build-and-ci (add-od-compose-brief)

Adds a new MCP tool `od_compose_brief` — a pure formatter helper for composing Turn 3 prompts.

## ADDED Requirements

### Requirement: od_compose_brief formats Turn 3 prompts

The MCP server SHALL expose a tool `od_compose_brief` that accepts structured inputs (page brief, Turn 1 form answers, Turn 2 brand-spec) and returns a single string formatted to match upstream Open Design's recognized Turn 2+ input format (`[form answers — discovery]` / `[brand spec]` / `[page brief]` sections). The tool SHALL be a pure function: no network, no env vars, no auth.

#### Scenario: Tool registered with pure-function semantics

- **WHEN** the MCP server starts and lists tools via `tools/list`
- **THEN** the tool list SHALL include `od_compose_brief`
- **AND** the tool list SHALL contain exactly 9 tools (the existing 8 + `od_compose_brief`)
- **AND** `od_compose_brief`'s description SHALL state it is a formatter helper used BEFORE `od_generate_design`
- **AND** invoking `od_compose_brief` with valid inputs SHALL NOT require any `OD_*` or `BYOK_*` env var

#### Scenario: Empty sections are omitted

- **WHEN** a caller invokes `od_compose_brief` with only `pagePrompt` set (no `briefAnswers`, no `brandSpec`)
- **THEN** the returned text SHALL contain the `[page brief]` section
- **AND** the returned text SHALL NOT contain a `[form answers — discovery]` header
- **AND** the returned text SHALL NOT contain a `[brand spec]` header

#### Scenario: Multi-value form fields render correctly

- **WHEN** a caller invokes `od_compose_brief` with `briefAnswers.platform = ['Responsive web', 'Desktop web']`
- **THEN** the returned text SHALL include the line `- platform: Responsive web, Desktop web`
- **AND** an empty array (`platform: []`) SHALL result in the `platform` field being omitted entirely
