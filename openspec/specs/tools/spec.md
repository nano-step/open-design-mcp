# tools Specification

## Purpose
TBD - created by archiving change add-od-save-project-file. Update Purpose after archive.
## Requirements
### Requirement: od_save_project_file persists a file inside a project

The MCP server SHALL expose a tool `od_save_project_file` that accepts `{projectId, name, content}`, calls the OD daemon's `POST /api/projects/:id/files` endpoint with a `{name, content}` body, and returns the daemon's file record (typed as the vendor's `ProjectFileResponse`). The tool SHALL be distinct from `od_save_artifact` (which writes to a global, project-unaware artifact store).

#### Scenario: Tool registered with correct shape

- **WHEN** the MCP server starts and a client lists tools via `tools/list`
- **THEN** the response SHALL include a tool named `od_save_project_file`
- **AND** the tool count SHALL be exactly 10 (the existing 9 + this one)
- **AND** the tool's description SHALL distinguish project-scoped vs global save (mentioning `od_save_artifact` as the global counterpart)
- **AND** the tool's input schema SHALL declare three required string fields: `projectId`, `name`, `content`

#### Scenario: Happy path — file is persisted in the project

- **GIVEN** a project `demo` exists on the daemon (created via `od_create_project`)
- **WHEN** a caller invokes `od_save_project_file` with `{projectId: "demo", name: "index.html", content: "<html>...</html>"}`
- **THEN** the MCP server SHALL POST to `<OD_DAEMON_URL>/api/projects/demo/files` with body `{"name":"index.html","content":"<html>...</html>"}`
- **AND** the tool result SHALL include the daemon's returned `size`, `kind`, and (if present) `artifactManifest.entry`
- **AND** the tool result `structuredContent.file` SHALL match the vendor's `ProjectFile` shape
- **AND** a subsequent `od_get_project` for the project SHALL return the new file in `files[]`

#### Scenario: 404 from daemon maps to a custom "Project not found" message

- **GIVEN** the daemon will respond with `404 PROJECT_NOT_FOUND` for an unknown project id
- **WHEN** a caller invokes `od_save_project_file` with `{projectId: "nonexistent", name: "index.html", content: "..."}`
- **THEN** the tool SHALL return `isError: true`
- **AND** the result text SHALL contain "Project not found: nonexistent"
- **AND** the result text SHALL hint at calling `od_create_project` first
- **AND** the error mapping SHALL be produced by the centralized `mapErrorToToolResultWith404` utility (not hand-rolled)

#### Scenario: Input validation rejects path separators in name

- **WHEN** a caller invokes `od_save_project_file` with `{projectId: "demo", name: "subdir/foo.html", content: "..."}`
- **THEN** the tool SHALL reject the input before contacting the daemon
- **AND** the validation error SHALL mention that the name must not contain path separators

#### Scenario: Input validation enforces a content size cap (5 MB)

- **GIVEN** the tool defines `MAX_CONTENT_BYTES = 5 * 1024 * 1024` as a client-side safety rail
- **WHEN** a caller invokes `od_save_project_file` with `content` whose UTF-8 byte length exceeds `MAX_CONTENT_BYTES`
- **THEN** the tool SHALL reject the input before contacting the daemon
- **AND** the validation error SHALL mention the byte-size limit
- **AND** the validation SHALL use `Buffer.byteLength(c, 'utf8')` so multibyte characters are measured by byte count

#### Scenario: Overwrite — calling with an existing name updates the file

- **GIVEN** a file `index.html` already exists in project `demo`
- **WHEN** a caller invokes `od_save_project_file` with `{projectId: "demo", name: "index.html", content: "<new>...</new>"}`
- **THEN** the daemon SHALL overwrite the existing file (last-writer-wins semantics)
- **AND** the tool SHALL return success with the updated file record
- **AND** the tool SHALL NOT defensively check existence first (no pre-flight GET)

#### Scenario: Distinct from od_save_artifact

- **GIVEN** both `od_save_artifact` and `od_save_project_file` exist as separate MCP tools
- **WHEN** a caller invokes `od_save_artifact` (with `identifier, title, html`)
- **THEN** the artifact SHALL be saved to the daemon's global `/app/.od/artifacts/<ts>-<id>/index.html` path
- **AND** a subsequent `od_get_project` for any project SHALL NOT show the saved artifact in `files[]`
- **WHEN** a caller invokes `od_save_project_file` (with `projectId, name, content`)
- **THEN** the file SHALL be saved under the project's storage
- **AND** a subsequent `od_get_project` for that project SHALL show the file in `files[]`

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

