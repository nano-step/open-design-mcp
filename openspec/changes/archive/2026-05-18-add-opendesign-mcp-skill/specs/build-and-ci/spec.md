# Spec Delta: build-and-ci (add-opendesign-mcp-skill)

Adds an AI-tooling artifact requirement so the OpenCode skill at `.opencode/skills/open-design-mcp/` is recognized as a maintained part of the repo (not a one-off draft).

## ADDED Requirements

### Requirement: OpenCode skill for open-design-mcp

The repository SHALL include an OpenCode skill at `.opencode/skills/open-design-mcp/` that teaches AI agents how to use the 8 MCP tools exposed by this server, so that LLM-driven sessions can produce correct tool calls without trial-and-error on env-var setup, auth modes, or workflow ordering.

#### Scenario: Skill files exist and are non-empty

- **WHEN** a contributor inspects the repository at any commit on `master` after this change is applied
- **THEN** `.opencode/skills/open-design-mcp/SKILL.md` SHALL exist
- **AND** `.opencode/skills/open-design-mcp/SKILL.md` SHALL contain a YAML frontmatter block with at minimum `name:` and `description:` fields
- **AND** `.opencode/skills/open-design-mcp/SKILL.md` SHALL be no longer than 350 lines (progressive-disclosure budget)
- **AND** the `references/` subdirectory SHALL exist with at least one `.md` file inside

#### Scenario: Tool catalog stays in sync with server

- **WHEN** a contributor reads `SKILL.md`
- **THEN** the tool catalog section SHALL list all 8 tools currently exposed by `src/tools/index.ts` (`od_list_projects`, `od_get_project`, `od_create_project`, `od_update_project`, `od_delete_project`, `od_save_artifact`, `od_lint_artifact`, `od_generate_design`)
- **AND** the catalog SHALL identify which tools require BYOK env vars (only `od_generate_design`)
- **AND** the catalog SHALL identify which tools require `OD_DAEMON_URL` (all eight)
