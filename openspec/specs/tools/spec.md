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

### Requirement: od_generate_design auto-injects linked design system

When `od_generate_design` is invoked with a `projectId` and the resolved project has a `designSystemId`, the MCP SHALL fetch the linked design-system.html, run it through the shared extractor, and prepend a **Design System Contract** block to the system prompt returned by `composeSystemPrompt`. The vendored `composeSystemPrompt` SHALL NOT be modified.

The Design System Contract block SHALL include:
1. The full JSON manifest (verbatim).
2. The full content of the three `<style>` blocks (`od-tokens`, `od-components`, `od-layout`), verbatim.
3. A normative instruction set whose strength depends on the `designSystemMode` argument (see next requirement).

#### Scenario: Strict mode injection wording

- **GIVEN** a project with a linked, valid design-system.html
- **WHEN** `od_generate_design { projectId, prompt, designSystemMode: "strict" }` is invoked (or `designSystemMode` is omitted and a system is linked)
- **THEN** the system prompt sent to the BYOK proxy SHALL contain a section beginning with the literal heading `### Design System Contract (strict)`
- **AND** that section SHALL contain the string "You MUST inline the three `<style>` blocks unchanged"
- **AND** that section SHALL contain the string "You MUST NOT introduce new CSS custom properties"
- **AND** that section SHALL contain the literal `<!-- need: ` (the sanctioned escape valve marker)

#### Scenario: Advisory mode injection wording

- **WHEN** `od_generate_design { projectId, prompt, designSystemMode: "advisory" }` is invoked
- **THEN** the system prompt SHALL contain a section beginning with `### Design System Contract (advisory)`
- **AND** that section SHALL contain the string "Prefer the documented tokens and components; deviations require justification"
- **AND** the section SHALL NOT contain MUST-language directives

#### Scenario: Off mode skips injection entirely

- **WHEN** `od_generate_design { projectId, prompt, designSystemMode: "off" }` is invoked on a project with a linked system
- **THEN** no Design System Contract block SHALL be prepended
- **AND** the system prompt SHALL be byte-identical to the prompt produced when no `designSystemId` is set

#### Scenario: Wrapper-injection, not vendor modification

- **WHEN** the auto-inject path runs
- **THEN** the injection SHALL be implemented in `src/tools/generate-design.ts` (or a helper imported by it) — NOT inside `vendor/od-contracts/`
- **AND** running `npm run vendor:check` SHALL continue to pass against the unmodified upstream

### Requirement: od_generate_design designSystemMode argument

The `od_generate_design` tool's input schema SHALL accept an optional argument `designSystemMode: "strict" | "advisory" | "off"`. The default SHALL be `"strict"` when the project has a `designSystemId` AND the linked file resolves, and `"off"` otherwise.

#### Scenario: Argument validated by zod

- **WHEN** a caller passes `designSystemMode: "loose"` (an undeclared value)
- **THEN** zod validation SHALL reject the call before any network I/O
- **AND** the tool result SHALL include `isError: true` with a message naming the `designSystemMode` field

#### Scenario: Default resolution

- **GIVEN** a project with a linked design system and the linked file resolves
- **WHEN** `od_generate_design { projectId, prompt }` is invoked without `designSystemMode`
- **THEN** the effective mode SHALL be `"strict"`

- **GIVEN** a project without a `designSystemId`
- **WHEN** `od_generate_design { projectId, prompt }` is invoked without `designSystemMode`
- **THEN** the effective mode SHALL be `"off"` and no Contract block SHALL be injected

### Requirement: od_lint_artifact accepts designSystemHtml

The `od_lint_artifact` tool's input schema SHALL accept an optional argument `designSystemHtml: string`. When provided, the tool SHALL run the design-system-specific static checks (DS001 through DS005) in addition to its existing structural lint, and merge the findings into a single result.

#### Scenario: Argument is optional

- **WHEN** a caller invokes `od_lint_artifact { html: "<...>" }` without `designSystemHtml`
- **THEN** the tool SHALL behave identically to its pre-v0.17 behavior (no DS findings emitted)
- **AND** all existing scenarios for `od_lint_artifact` SHALL continue to pass

#### Scenario: Finding DS001 — missing required style block

- **GIVEN** a `designSystemHtml` and a page `html` that omits `<style id="od-components">`
- **WHEN** `od_lint_artifact { html, designSystemHtml }` is invoked
- **THEN** the result SHALL include a finding with `code: "DS001"`, `severity: "error"`, and a message naming the missing block (`od-components`)

#### Scenario: Finding DS002 — off-palette color in inline style

- **GIVEN** a `designSystemHtml` whose manifest declares `tokens.colors.primary = "#3b82f6"` (and no `#ff0000`)
- **GIVEN** a page `html` containing `<div style="color:#ff0000">…</div>`
- **WHEN** `od_lint_artifact { html, designSystemHtml }` is invoked
- **THEN** the result SHALL include a finding with `code: "DS002"`, `severity: "error"`, and a message quoting the offending color literal (`#ff0000`)

#### Scenario: DS002 skips colors inside `<svg>`

- **GIVEN** a page `html` containing `<svg><path fill="#ff0000"/></svg>` and no other color usages
- **WHEN** lint is run with a `designSystemHtml`
- **THEN** no DS002 finding SHALL be emitted (SVG fill/stroke colors are out of scope for DS002 in v0.17)

#### Scenario: Finding DS003 — undocumented component class

- **GIVEN** a `designSystemHtml` whose components catalog includes `btn-primary` and `btn-ghost` only
- **GIVEN** a page `html` containing `<button class="btn-warning">…</button>`
- **WHEN** lint is run
- **THEN** the result SHALL include a finding with `code: "DS003"`, `severity: "warning"` (not error), and a message naming the undocumented class

#### Scenario: Finding DS004 — new custom property introduced

- **GIVEN** a `designSystemHtml` whose tokens declare `--color-primary` only
- **GIVEN** a page `html` containing `<style>:root{--color-accent:#0f0}</style>`
- **WHEN** lint is run
- **THEN** the result SHALL include a finding with `code: "DS004"`, `severity: "error"`, naming the new property `--color-accent`

#### Scenario: Finding DS005 — token drift

- **GIVEN** a `designSystemHtml` whose `<style id="od-tokens">` body is `:root{--color-primary:#3b82f6}`
- **GIVEN** a page `html` whose `<style id="od-tokens">` body is `:root{--color-primary:#3B82F6}` (case-changed)
- **WHEN** lint is run
- **THEN** the result SHALL include a finding with `code: "DS005"`, `severity: "error"`, indicating the page's tokens block is not byte-identical to the system's

#### Scenario: Escape hatch suppresses next finding

- **GIVEN** a page `html` containing `<!-- od-lint-ignore-next-line -->\n<div style="color:#ff0000">…</div>`
- **WHEN** lint is run with a `designSystemHtml` that would otherwise emit DS002 for `#ff0000`
- **THEN** the DS002 finding for that element SHALL be suppressed
- **AND** subsequent off-palette occurrences in the same document SHALL still emit findings

### Requirement: od_compose_brief accepts designSystemSummary

The `od_compose_brief` tool's input schema SHALL accept an optional argument `designSystemSummary: string`. When provided, the formatted Turn-3 prompt SHALL include a `### Design System` section whose body is the verbatim summary.

#### Scenario: Summary inserted between brand-spec and page-prompt sections

- **WHEN** `od_compose_brief { briefAnswers, brandSpec, designSystemSummary: "Indigo primary, IBM Plex Sans, 4px spacing scale.", pagePrompt: "Pricing page" }` is invoked
- **THEN** the returned string SHALL contain a section beginning with the literal line `### Design System`
- **AND** the body of that section SHALL be the verbatim `designSystemSummary`
- **AND** the section SHALL appear after the brand-spec section and before the page-prompt section

#### Scenario: Omitted summary causes no structural change

- **WHEN** `od_compose_brief { briefAnswers, brandSpec, pagePrompt }` is invoked without `designSystemSummary`
- **THEN** the returned string SHALL be byte-identical to the pre-v0.17 output for the same inputs (no `### Design System` heading present)

