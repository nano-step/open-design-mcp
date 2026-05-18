# Spec Delta: build-and-ci (docs-generate-design-flow)

Adds an architecture-documentation requirement so future contributors know the flow-diagram doc is a maintained part of the repo, not a one-off note.

## ADDED Requirements

### Requirement: Architecture documentation for od_generate_design flow

The repository SHALL include an architecture document at `docs/architecture/generate-design-flow.md` that explains the end-to-end flow when an MCP client invokes the `od_generate_design` tool, so that newcomers can understand the system without reading source.

#### Scenario: Flow document exists and is non-empty

- **WHEN** a contributor inspects the repository at any commit on `master` after this change is applied
- **THEN** the file `docs/architecture/generate-design-flow.md` SHALL exist
- **AND** the file SHALL contain at least one mermaid code block (fenced with ```mermaid)
- **AND** the file SHALL be at least 100 lines long

#### Scenario: README links to the flow document

- **WHEN** a contributor reads `README.md`
- **THEN** `README.md` SHALL contain a link to `docs/architecture/generate-design-flow.md` (relative path)
- **AND** the link SHALL appear in a section titled "How it works" (or equivalent heading mentioning the flow)
