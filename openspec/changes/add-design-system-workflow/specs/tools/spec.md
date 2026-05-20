# Spec Delta: tools (add-design-system-workflow)

Backward-compatible requirement additions to three existing tools so they participate in the design-system workflow. No requirements are removed or renamed.

## ADDED Requirements

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
