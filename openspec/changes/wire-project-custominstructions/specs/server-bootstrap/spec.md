# Spec Delta: server-bootstrap (wire-project-custominstructions)

Adds an auto-fetch behavior to `od_generate_design` so the project record's stored `customInstructions` actually influence generation. Before this change, the field existed on the project but was never read by the generation tool — a known gap that broke multi-page consistency.

## ADDED Requirements

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
