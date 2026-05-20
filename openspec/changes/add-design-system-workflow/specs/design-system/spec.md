# Spec: design-system (add-design-system-workflow)

Introduces a project-scoped, machine-readable design-system artifact and the three MCP tools that produce, parse, and patch it.

## ADDED Requirements

### Requirement: design-system.html artifact shape

A design-system artifact SHALL be a single HTML document. The MCP SHALL recognize the following marker structure and SHALL refuse to operate on documents that do not satisfy it:

- The root `<html>` element SHALL carry two attributes: `data-od-artifact="design-system"` and `data-od-version="<positive integer>"`.
- The `<head>` SHALL contain three `<style>` elements with the IDs `od-tokens`, `od-components`, and `od-layout`, in that order. None MAY be empty.
- The `<head>` SHALL contain exactly one `<script type="application/json" id="od-design-system-manifest">` whose contents are valid JSON parseable into the manifest schema below (manifest-schema requirement).
- The `<body>` SHALL contain a human-reviewable component gallery. v0.17 does NOT pin the gallery's substructure beyond the requirement that it is non-empty.

#### Scenario: All four marker slots present

- **GIVEN** an HTML document with `<html data-od-artifact="design-system" data-od-version="1">`, the three `<style>` blocks (`od-tokens`, `od-components`, `od-layout`), the JSON manifest script, and a non-empty `<body>`
- **WHEN** `od_extract_design_system` is invoked with that document
- **THEN** the tool result SHALL return `{ manifest, tokensCss, componentsCss, layoutCss, version: 1 }` without error

#### Scenario: Missing one of the required style blocks

- **GIVEN** an HTML document that omits `<style id="od-components">`
- **WHEN** `od_extract_design_system` is invoked
- **THEN** the tool SHALL return `isError: true`
- **AND** the result text SHALL name the missing slot ("missing required style block: od-components")
- **AND** no partial result SHALL be returned

#### Scenario: Wrong artifact marker

- **GIVEN** an HTML document whose `<html>` carries `data-od-artifact="prototype"` (or omits the attribute entirely)
- **WHEN** `od_extract_design_system` is invoked
- **THEN** the tool SHALL return `isError: true` with a message indicating the document is not a design-system artifact

#### Scenario: Manifest JSON malformed

- **GIVEN** an HTML document where the `<script type="application/json" id="od-design-system-manifest">` body is not valid JSON
- **WHEN** `od_extract_design_system` is invoked
- **THEN** the tool SHALL return `isError: true` with a message starting "design system manifest is not valid JSON"

### Requirement: manifest schema (version 1)

The JSON inside `<script id="od-design-system-manifest">` SHALL conform to the following Zod-validated schema:

```ts
{
  version: 1,
  tokens: {
    colors: Record<string, string>,        // e.g. { "primary": "#3b82f6", "bg": "#fff" }
    type: { fontFamily: string, scale: number[] /* px or rem, in ascending order */ },
    space: number[],                       // ascending spacing scale, unit declared in `unit` field
    unit: "px" | "rem",
    radii: number[],                       // ascending
    shadows: string[],                     // raw CSS shadow strings
    breakpoints: { name: string, min: number }[],
    zIndex: Record<string, number>
  },
  components: {
    name: string,                          // e.g. "btn-primary"
    selector: string,                      // canonical CSS selector
    role: "button" | "input" | "card" | "nav" | "section" | "other",
    snippet: string                        // canonical HTML snippet (one element, no children invented)
  }[],
  layout: {
    name: string,                          // e.g. "container", "stack-md", "grid-2"
    selector: string,
    purpose: string                        // one-line description
  }[]
}
```

The MCP SHALL refuse to inject or operate on a manifest whose `version` is anything other than `1`.

#### Scenario: version field accepted

- **GIVEN** a manifest with `"version": 1`, complete `tokens`, at least one `components` entry, and at least one `layout` entry
- **WHEN** the manifest is parsed
- **THEN** the parser SHALL accept it and return the typed object

#### Scenario: unknown version rejected

- **GIVEN** a manifest with `"version": 2`
- **WHEN** the manifest is parsed
- **THEN** the parser SHALL reject with a message "unsupported design system manifest version: 2 (this MCP supports version 1)"

#### Scenario: required token group missing

- **GIVEN** a manifest that omits `tokens.colors`
- **WHEN** the manifest is parsed
- **THEN** zod validation SHALL fail and the error message SHALL name the `tokens.colors` path

### Requirement: od_generate_design_system tool

The MCP server SHALL expose a tool `od_generate_design_system` that uses the BYOK pipeline to produce a `design-system.html` artifact conforming to the artifact-shape requirement.

#### Scenario: Tool registered

- **WHEN** the MCP server starts and a client lists tools via `tools/list`
- **THEN** the response SHALL include a tool named `od_generate_design_system`
- **AND** the total tool count SHALL be 13 (the existing 10 plus the three new tools)

#### Scenario: Happy path generation

- **GIVEN** `OD_DAEMON_URL` and the BYOK env vars are configured
- **WHEN** a caller invokes `od_generate_design_system { prompt: "<brand brief>", projectId?, briefAnswers?, brandSpec? }`
- **THEN** the MCP SHALL POST to `<OD_DAEMON_URL>/api/proxy/<provider>/stream` with a system prompt whose charter is the DESIGN-SYSTEM charter (NOT the page-design charter from `composeSystemPrompt`)
- **AND** the system prompt SHALL instruct the model to emit a single self-contained HTML document with the four marker slots (the three `<style>` blocks and the JSON manifest)
- **AND** the accumulated streamed text SHALL be returned in the tool result `content[0].text`

#### Scenario: Output structurally validated post-stream

- **WHEN** generation completes
- **THEN** the MCP SHALL run the extractor against the accumulated output
- **AND** if extraction fails the tool SHALL still return the raw HTML in `content[0].text` BUT also include a second `content[1]` item with `type: "text"` and a body listing the missing marker slots so the agent can retry
- **AND** `isError` SHALL be `true` when extraction fails

#### Scenario: BYOK not configured

- **GIVEN** one of `BYOK_BASE_URL` / `BYOK_API_KEY` / `BYOK_MODEL` is unset
- **WHEN** a caller invokes `od_generate_design_system`
- **THEN** the tool SHALL return `isError: true` with the same "BYOK not configured" message used by `od_generate_design`

#### Scenario: maxTokens honored

- **WHEN** a caller invokes `od_generate_design_system { prompt, maxTokens: 80000 }`
- **THEN** the proxy POST body SHALL include `maxTokens: 80000`
- **AND** the default when omitted SHALL be `64000`

### Requirement: od_extract_design_system tool (pure)

The MCP server SHALL expose a tool `od_extract_design_system` that takes a `{ html: string }` input and returns the parsed `{ manifest, tokensCss, componentsCss, layoutCss, version }` structure. The tool SHALL NOT make any network calls and SHALL NOT depend on any env vars.

#### Scenario: Pure function semantics

- **WHEN** `od_extract_design_system` is invoked twice with the same input
- **THEN** the two return values SHALL be byte-identical
- **AND** no network I/O SHALL be observed on either call

#### Scenario: Result includes raw CSS

- **GIVEN** a valid design-system.html whose `<style id="od-tokens">` body is `:root{--color-primary:#3b82f6}`
- **WHEN** `od_extract_design_system` is invoked
- **THEN** the result's `tokensCss` field SHALL equal `:root{--color-primary:#3b82f6}` byte-for-byte (no normalization)

### Requirement: od_update_design_system tool

The MCP server SHALL expose a tool `od_update_design_system` that produces an updated `design-system.html` by either (i) running a BYOK semantic patch ("add a destructive button variant") or (ii) applying a deterministic JSON-delta against the existing manifest. On any successful update, the `data-od-version` attribute on `<html>` SHALL be incremented by one.

#### Scenario: Semantic patch mode

- **GIVEN** an existing `design-system.html` with `data-od-version="3"`
- **WHEN** a caller invokes `od_update_design_system { html: "<existing>", mode: "semantic", instruction: "Add a destructive button variant in red." }`
- **THEN** the MCP SHALL POST to the BYOK proxy with a system prompt that includes the existing manifest and the instruction
- **AND** the returned HTML SHALL satisfy the artifact-shape requirement
- **AND** the new HTML SHALL carry `data-od-version="4"`

#### Scenario: Deterministic JSON-delta mode

- **GIVEN** an existing `design-system.html` with manifest containing `tokens.colors.primary = "#3b82f6"`
- **WHEN** a caller invokes `od_update_design_system { html, mode: "delta", patch: { tokens: { colors: { primary: "#2563eb" } } } }`
- **THEN** the MCP SHALL deep-merge the patch into the manifest, regenerate the affected CSS (the `--color-primary` custom property in `<style id="od-tokens">`), and increment `data-od-version`
- **AND** the operation SHALL be entirely local — no network I/O

#### Scenario: Invalid delta rejected

- **WHEN** a caller invokes `od_update_design_system { html, mode: "delta", patch: { tokens: { unit: "%" } } }`
- **THEN** the merged manifest SHALL fail zod validation (`unit` is `"px" | "rem"` only)
- **AND** the tool SHALL return `isError: true` without modifying the input

### Requirement: project link convention

A project's `designSystemId` field SHALL by convention name a file persisted via `od_save_project_file` inside the same project. The MCP SHALL treat `designSystemId` as the file's `name` (NOT a URL, NOT a daemon-global ID).

#### Scenario: Auto-inject resolves the linked file

- **GIVEN** a project `demo` with `designSystemId: "design-system.html"` and a saved project file with name `design-system.html`
- **WHEN** `od_generate_design { projectId: "demo", prompt: "home page" }` is invoked
- **THEN** the MCP SHALL fetch the project (`GET /api/projects/demo`), then fetch the file's content from the project's files endpoint, then extract via `od_extract_design_system`
- **AND** the auto-inject branch SHALL run before the BYOK request is dispatched

#### Scenario: Linked file missing

- **GIVEN** a project with `designSystemId: "design-system.html"` BUT no such file in the project's files
- **WHEN** `od_generate_design` is invoked
- **THEN** the MCP SHALL proceed as if `designSystemMode: 'off'`
- **AND** the tool result `content` SHALL begin with a single `text` item whose body advises the caller that the linked design system file was not found and the generation proceeded without enforcement
- **AND** `isError` SHALL remain `false` (the generation succeeds; the missing link is advisory only)
