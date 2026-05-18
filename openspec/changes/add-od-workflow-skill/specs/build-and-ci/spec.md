# Spec Delta: build-and-ci (add-od-workflow-skill)

Adds a new agent-orchestration skill artifact requirement to the repo. Companion to the existing `open-design-mcp` tool-reference skill (which stays unchanged).

## ADDED Requirements

### Requirement: OD playbook skill for OpenCode subagents

The repository SHALL include an OpenCode skill at `.opencode/skills/od-workflow/` that teaches AI agents (via OpenCode's subagent system) how to execute Open Design's full turn-by-turn workflow — discovery questions, brand-spec extraction, TodoWrite planning, 5-dimensional critique, and artifact emission — using a combination of OpenCode's native tools and our `od_*` MCP tools.

#### Scenario: Skill files exist and are non-empty

- **WHEN** a contributor inspects the repository at any commit on `master` after this change is applied
- **THEN** `.opencode/skills/od-workflow/SKILL.md` SHALL exist
- **AND** the file SHALL contain a YAML frontmatter block with at minimum `name:` and `description:` fields
- **AND** the file SHALL be no longer than 350 lines (progressive-disclosure budget)
- **AND** the `references/` subdirectory SHALL exist with at least 5 markdown files

#### Scenario: Transcribed content carries attribution

- **WHEN** a contributor reads any reference file under `.opencode/skills/od-workflow/references/`
- **THEN** files containing content transcribed from upstream nexu-io/open-design SHALL include an attribution header naming the source file:line and pointing to `ATTRIBUTION.md` for the pinned commit and full Apache 2.0 notice
- **AND** `.opencode/skills/od-workflow/ATTRIBUTION.md` SHALL exist with the pinned upstream commit SHA

#### Scenario: Existing skill unaffected

- **WHEN** the change is applied to master
- **THEN** the existing `.opencode/skills/open-design-mcp/` skill SHALL be unchanged (no files modified, no files removed)
- **AND** users who only load `open-design-mcp` SHALL see no behavioral change in `od_generate_design`
