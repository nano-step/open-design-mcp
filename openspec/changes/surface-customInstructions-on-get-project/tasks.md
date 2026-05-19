# Tasks — Surface customInstructions + metadata on od_get_project

## 1. Update `od_get_project` (`src/tools/get-project.ts`)

- [ ] 1.1 Add import: `import type { ProjectMetadataWithStash } from '../types/metadata-stash.js';`
- [ ] 1.2 Extend `outputSchema.project` Zod object — add optional fields:
  ```ts
  customInstructions: z.string().optional(),
  fidelity: z.string().optional(),
  skillId: z.string().optional(),
  designSystemId: z.string().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  ```
- [ ] 1.3 Update the handler return-type annotation (the inline TS type at the function signature) to match `outputSchema`.
- [ ] 1.4 In the handler body, after `const p = detail.project;`, add:
  ```ts
  const md = p.metadata as ProjectMetadataWithStash | undefined;
  const customInstructions =
    md?.customInstructions ||
    (p as { customInstructions?: string }).customInstructions ||
    undefined;
  ```
- [ ] 1.5 Fix pre-existing `kind` bug — replace `(p as { kind?: string }).kind` with `md?.kind || (p as { kind?: string }).kind || undefined`.
- [ ] 1.6 Extend `projectSummary` object with `customInstructions`, `fidelity: md?.fidelity`, `skillId: (p as { skillId?: string | null }).skillId ?? undefined`, `designSystemId: same`, `createdAt: (p as { createdAt?: number }).createdAt`, `updatedAt: (p as { updatedAt?: number }).updatedAt`.
- [ ] 1.7 Append to the text response `lines` array (after the existing entries, before `files`):
  ```ts
  customInstructions ? `Custom Instructions (${customInstructions.length} chars):\n${customInstructions}` : null,
  ```
- [ ] 1.8 Update the tool description (one-line addition): "Output includes `customInstructions` if set on the project (user-supplied content)."
- [ ] 1.9 Run `npm run lint` and `npm run typecheck` — zero new warnings, zero new errors.

## 2. Fix `kind` bug in `od_list_projects` (`src/tools/list-projects.ts`)

- [ ] 2.1 Locate the line that reads `kind` from each project — currently `(p as { kind?: string }).kind`.
- [ ] 2.2 Replace with read-through-metadata pattern (same as #1.5).
- [ ] 2.3 No schema change needed — `kind` was already in the output schema, just always `undefined`.

## 3. Unit tests — `src/__tests__/tools/get-project.test.ts`

- [ ] 3.1 New test: `surfaces customInstructions from metadata.customInstructions in both text and structuredContent`
- [ ] 3.2 New test: `falls through to project.customInstructions when metadata.customInstructions is absent` (the legacy daemon shape)
- [ ] 3.3 New test: `returns customInstructions: undefined when daemon has neither metadata.customInstructions nor project.customInstructions`
- [ ] 3.4 New test: `treats empty string customInstructions as undefined` (validates the `||` precedence)
- [ ] 3.5 New test: `surfaces kind from metadata.kind (regression for pre-existing bug)` — fixture MUST place `kind` inside `metadata: { kind: 'prototype' }` (NOT at the project top level) to exercise the PRIMARY read path. Test asserts `structuredContent.project.kind === 'prototype'`.
- [ ] 3.6 New test: `surfaces fidelity, skillId, designSystemId, createdAt, updatedAt when present`
- [ ] 3.7 Run `npm test` — all existing tests still pass + 6 new tests pass.

## 4. Unit tests — `src/__tests__/tools/list-projects.test.ts`

- [ ] 4.1 New test: `surfaces kind from metadata.kind (regression for pre-existing bug)` — fixture MUST place `kind` inside `metadata: { kind: 'prototype' }` on each list entry (NOT at the project top level), so the test exercises the new primary read path, not the legacy fallback.
- [ ] 4.2 Run `npm test` — passes.

## 5. Integration test — `tests/integration/tools-readonly.test.ts`

- [ ] 5.1 Locate the existing `od_get_project` test block.
- [ ] 5.2 Update the mock daemon response to include `metadata.customInstructions: 'BRAND SPEC FIXTURE: <oklch palette + posture rules>'` (representative ~300-char fixture, not the full live spec).
- [ ] 5.3 Update the assertion to verify `result.structuredContent.project.customInstructions === '<fixture>'`.
- [ ] 5.4 Verify the text response contains the `Custom Instructions (N chars):` line followed by the fixture content.
- [ ] 5.5 Run `npm run test:integration` — passes.

## 6. Documentation

- [ ] 6.1 Update `README.md` `od_get_project` row: add `customInstructions` to the field list.
- [ ] 6.2 Update `.opencode/skills/open-design-mcp/SKILL.md` Tool Catalog row for `od_get_project` (currently `"Fetch a project + its artifact files. Read-only; requires only OD_DAEMON_URL."`). Append: `" Output includes customInstructions if set on the project (user-supplied content)."` — exact verbatim text to match the tool's `description` field (task 1.8).

## 7. Validation ladder (clean env, all required)

- [ ] 7.1 `unset OD_DAEMON_URL OD_AUTH_MODE OD_BASIC_USER OD_BASIC_PASS BYOK_BASE_URL BYOK_API_KEY BYOK_MODEL BYOK_PROVIDER OD_API_TOKEN`
- [ ] 7.2 `npm run lint` — exit 0
- [ ] 7.3 `npm run typecheck` — exit 0
- [ ] 7.4 `npm test` — all tests pass (existing + new)
- [ ] 7.5 `npm run build` — exit 0
- [ ] 7.6 Vendor check (no new vendor imports) — manual grep confirms no new `vendor/od-contracts` imports
- [ ] 7.7 `npm run test:integration` — exit 0
- [ ] 7.8 `npx openspec validate surface-customInstructions-on-get-project --strict` — exit 0

## 8. Live user-flow test (hosted daemon)

- [ ] 8.1 Build the MCP server.
- [ ] 8.2 Drive a stdio harness: initialize → `tools/call(od_get_project, {projectId: "open-design-mcp-site"})` against hosted (`https://od.thnkandgrow.com/` + basic auth).
- [ ] 8.3 Verify response: `structuredContent.project.customInstructions` contains the full 3,928-char brand spec we previously set.
- [ ] 8.4 Verify text response includes `Custom Instructions (3928 chars):` followed by the content.
- [ ] 8.5 Save evidence to `docs/evidence/surface-customInstructions-on-get-project/userflow-test.md`.

## 9. Review Gate (fresh Oracle reviewer ≠ implementer)

- [ ] 9.1 Spawn Oracle review session with full HARNESS Review Gate prompt.
- [ ] 9.2 All AC verified (8 in proposal + every blocking finding from deep-design).
- [ ] 9.3 Verdict: PASS / REVISE / BLOCK.
- [ ] 9.4 On PASS: proceed to PR.

## 10. PR + merge + archive

- [ ] 10.1 Commit implementation + tests + docs in one commit on branch `feat/surface-customInstructions-on-get-project`.
- [ ] 10.2 Push, open PR. Body lists all 8 AC + closes #56.
- [ ] 10.3 Wait CI green.
- [ ] 10.4 Squash-merge `--admin --delete-branch`.
- [ ] 10.5 `npx openspec archive surface-customInstructions-on-get-project --yes`.
- [ ] 10.6 Commit archive + push.
- [ ] 10.7 Verify #56 auto-closed by PR body.
