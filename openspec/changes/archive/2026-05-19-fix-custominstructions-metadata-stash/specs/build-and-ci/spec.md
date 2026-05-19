# Spec Delta: build-and-ci (fix-custominstructions-metadata-stash)

Fixes the end-to-end customInstructions round-trip by stashing a copy in `metadata.customInstructions` (which the daemon round-trips reliably) while keeping the top-level field for forward-compat with a future upstream fix.

## ADDED Requirements

### Requirement: customInstructions round-trip

When a project's `customInstructions` is set via `od_create_project` or `od_update_project`, the value SHALL be persisted such that a subsequent `od_generate_design` call against the SAME project ID injects that `customInstructions` content into the system prompt sent to the BYOK provider. This contract SHALL hold against any Open Design daemon implementation that (a) round-trips arbitrary `metadata.*` keys via PATCH/GET, regardless of whether (b) the daemon also surfaces the top-level `customInstructions` field on GET.

#### Scenario: Daemon returns metadata.customInstructions but no top-level field

- **WHEN** the daemon's `GET /api/projects/:id` response shape is `{ project: { id, name, metadata: { customInstructions: "BRAND_RULES" }, ... } }` with NO top-level `customInstructions`
- **AND** a caller invokes `od_generate_design` with `projectId` matching that project
- **THEN** the BYOK proxy SHALL receive a system prompt containing the string `"BRAND_RULES"`
- **AND** the read fallback chain (metadata.customInstructions → top-level customInstructions → undefined) SHALL be observable in test mocks

#### Scenario: Both metadata and top-level set with different values

- **WHEN** a project response includes both `metadata.customInstructions = "M_VALUE"` AND `customInstructions = "T_VALUE"` at the top level
- **THEN** the system prompt SHALL receive `"M_VALUE"` (metadata wins)
- **AND** documentation SHALL state this precedence so a future upstream daemon fix doesn't surprise existing users

#### Scenario: Caller sets customInstructions via the MCP tools

- **WHEN** a caller invokes `od_create_project { id, name, customInstructions: "X" }` OR `od_update_project { projectId, customInstructions: "X" }`
- **THEN** the daemon SHALL receive `customInstructions: "X"` AND `metadata.customInstructions: "X"` in the same request payload
- **AND** subsequent `od_get_project` responses on a real daemon SHALL show `metadata.customInstructions = "X"` (proving the stash round-tripped)
