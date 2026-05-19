# Proposal — Surface customInstructions + metadata on od_get_project

## Why

`od_get_project` is the only read path into a project today, but it strips the most useful field — `customInstructions` (the project's brand spec / design principles / color config). Agents can WRITE the brand spec via `od_create_project` / `od_update_project`, the daemon STORES it at `metadata.customInstructions`, and `od_generate_design` READS it internally — but no MCP tool surfaces it back to the agent.

Discovered during the open-design-mcp docs-site dogfood: we set a 3,928-char brand spec on project `open-design-mcp-site`, generated two brand-consistent pages, then could not retrieve the spec back through MCP to verify, audit, or evolve it.

Closes #56.

## What changes

Extend `od_get_project`'s output schema additively to surface what the daemon already returns:

- `customInstructions` — the brand spec / design principle / color config (the load-bearing field, ~3-5 KB string)
- `fidelity` — `low | mid | high-fidelity`
- `skillId` — design-skill binding ID
- `designSystemId` — design-system binding ID
- `createdAt` — epoch millis
- `updatedAt` — epoch millis

Plus fix a pre-existing bug in BOTH `od_get_project` and `od_list_projects`: they read `kind` from a nonexistent top-level field (`(p as { kind?: string }).kind`), but the daemon nests it inside `metadata.kind`. Current callers always see `kind: undefined`. Fix to read from `p.metadata?.kind`.

All changes are **additive** — no removals, no field renames, no behavior change for existing fields that aren't bug-fixes.

## Impact

- **Affected specs:** `tools` (new requirement for `od_get_project` field surfacing)
- **Affected code:**
  - `src/tools/get-project.ts` (handler + schema)
  - `src/tools/list-projects.ts` (kind bug fix only)
  - `src/__tests__/tools/get-project.test.ts` (+4 unit tests)
  - `src/__tests__/tools/list-projects.test.ts` (+1 unit test for kind fix)
  - `tests/integration/tools-readonly.test.ts` (+1 integration test)
  - `README.md` (tool description refresh)
- **No vendor changes** — reuses existing `ProjectMetadataWithStash` from `src/types/metadata-stash.ts`
- **No new dependencies**
- **Backward compatibility:** Additive output schema. Callers that destructure `{id, name, kind, status, resolvedDir}` continue to work; callers that ignored `kind: undefined` will start seeing real values.
