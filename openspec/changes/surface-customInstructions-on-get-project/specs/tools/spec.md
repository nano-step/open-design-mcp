# Tools — surface-customInstructions-on-get-project delta

## ADDED Requirements

### Requirement: od_get_project surfaces customInstructions and project metadata

The MCP server SHALL extend the `od_get_project` tool to surface the project's `customInstructions` value (and related metadata) in BOTH the text content AND the `structuredContent` of its tool result, reading from the same precedence chain that `od_generate_design` uses (`metadata.customInstructions` first, then top-level `project.customInstructions`, then `undefined`).

#### Scenario: customInstructions surfaced from metadata.customInstructions

- **GIVEN** a project on the OD daemon whose `metadata.customInstructions` is set to a non-empty string (e.g. a 3,928-char brand spec)
- **WHEN** an agent calls `od_get_project { projectId }`
- **THEN** the tool result's `structuredContent.project.customInstructions` SHALL equal that exact string verbatim
- **AND** the tool result's `content[0].text` SHALL include a line of the form `Custom Instructions (<N> chars):` followed by the full content

#### Scenario: customInstructions falls through to top-level when metadata absent

- **GIVEN** a project whose daemon response has `metadata.customInstructions` absent AND `project.customInstructions` set
- **WHEN** an agent calls `od_get_project { projectId }`
- **THEN** the tool result's `structuredContent.project.customInstructions` SHALL equal `project.customInstructions`

#### Scenario: customInstructions returned as undefined when daemon has neither

- **GIVEN** a project whose daemon response has neither `metadata.customInstructions` nor `project.customInstructions`
- **WHEN** an agent calls `od_get_project { projectId }`
- **THEN** the tool result's `structuredContent.project.customInstructions` SHALL be `undefined` (field absent, NOT `null`, NOT empty string)
- **AND** the tool result's `content[0].text` SHALL NOT contain the `Custom Instructions (...)` line

#### Scenario: empty string customInstructions treated as undefined

- **GIVEN** a project whose `metadata.customInstructions` is exactly `""` (empty string)
- **WHEN** an agent calls `od_get_project { projectId }`
- **THEN** the tool result's `structuredContent.project.customInstructions` SHALL be `undefined` (matching the precedence semantics in `od_generate_design`)

#### Scenario: additional metadata fields surfaced

- **GIVEN** a project whose daemon response has `metadata.fidelity`, `project.skillId`, `project.designSystemId`, `project.createdAt`, `project.updatedAt` populated
- **WHEN** an agent calls `od_get_project { projectId }`
- **THEN** `structuredContent.project` SHALL include each of those fields with their daemon-supplied values (epoch millis for timestamps; strings for IDs)

### Requirement: od_get_project surfaces kind from metadata.kind (bug fix)

The MCP server SHALL read the project's `kind` field from `metadata.kind` (the actual daemon location) rather than the non-existent top-level `project.kind`.

#### Scenario: kind read from metadata.kind

- **GIVEN** a project whose daemon response has `metadata.kind = "prototype"`
- **WHEN** an agent calls `od_get_project { projectId }`
- **THEN** the tool result's `structuredContent.project.kind` SHALL be `"prototype"`
- **AND** NOT `undefined` (which was the broken behavior before this change)

### Requirement: od_list_projects surfaces kind from metadata.kind (bug fix)

The MCP server SHALL read each listed project's `kind` field from `metadata.kind` rather than the non-existent top-level `project.kind`, matching the fix applied to `od_get_project`.

#### Scenario: list shows real kind values

- **GIVEN** the daemon has 3 projects with `metadata.kind` values `"prototype"`, `"deck"`, `"prototype"`
- **WHEN** an agent calls `od_list_projects`
- **THEN** each entry's `kind` field in `structuredContent.projects[].kind` SHALL be the daemon-supplied value
- **AND** NOT `undefined`
