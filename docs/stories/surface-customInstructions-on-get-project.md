# Story: surface customInstructions + metadata on od_get_project

**Status:** ready-to-implement
**Issue:** [#56](https://github.com/nano-step/open-design-mcp/issues/56)
**Lane:** `lane:normal × change-type:user-feature`
**Risk flags:** 2 (public-contract change + data-correctness fix bundled)
**Effort estimate:** Quick (<1h impl + ladder)

## Why

`od_get_project` is the only read window into a project but it drops the most useful field — `customInstructions`. Agents can WRITE it via `od_create_project` / `od_update_project`, the daemon STORES it, `od_generate_design` READS it internally — but NO tool surfaces it back. Discovered live during the open-design-mcp docs-site dogfood (a 3,928-char brand spec that couldn't be retrieved through MCP).

## Deep-design summary

Metis + Oracle ran in parallel.
- **Metis verdict:** PASS. 2 risk flags → lane:normal. 6 scope gaps folded.
- **Oracle verdict:** PASS. 2 blocking findings folded (outputSchema lockstep + read precedence pattern). Confidence: HIGH.
- **Decision:** Option A (surface from daemon, no new MCP storage). Option B (SQLite/JSON store) explicitly killed — daemon contract already round-trips reliably.

## Acceptance criteria (final, post-deep-design)

1. `od_get_project` accepts the same input as today (no breaking change to `inputSchema`).
2. `od_get_project` output `structuredContent.project` includes a new optional `customInstructions: string | undefined`, populated via the precedence `metadata.customInstructions || project.customInstructions || undefined`.
3. `customInstructions` set as a non-empty string → both `structuredContent` AND text contain it.
4. `customInstructions` set as empty string `""` → returned as `undefined` in `structuredContent`, absent from text.
5. `customInstructions` absent on the daemon → returned as `undefined` in `structuredContent`, absent from text.
6. Text output includes a `Custom Instructions (<N> chars):\n<content>` block when set; absent when not.
7. Output also surfaces (additive): `fidelity`, `skillId`, `designSystemId`, `createdAt`, `updatedAt` — all as optional fields, sourced from the daemon as-is.
8. Pre-existing `kind` bug fixed: both `od_get_project` AND `od_list_projects` now read `kind` from `metadata.kind`, not the non-existent top-level field.

## Implementation hints (from Oracle's review)

```ts
// src/tools/get-project.ts — handler additions

import type { ProjectMetadataWithStash } from '../types/metadata-stash.js';

// Inside the handler, after `const p = detail.project;`:
const md = p.metadata as ProjectMetadataWithStash | undefined;
const customInstructions =
  md?.customInstructions ||
  (p as { customInstructions?: string }).customInstructions ||
  undefined;

// Schema additions:
const outputSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    kind: z.string().optional(),
    status: z.string().optional(),
    resolvedDir: z.string().optional(),
    customInstructions: z.string().optional(),
    fidelity: z.string().optional(),
    skillId: z.string().optional(),
    designSystemId: z.string().optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
  }),
  files: z.array(fileSummarySchema),
});
```

**Critical gotcha (Oracle B1):** The MCP SDK validates `structuredContent` against `outputSchema` via Zod `safeParseAsync`. Zod **silently strips** unknown keys. The `outputSchema` AND the `structuredContent` payload AND the handler return type MUST be updated in lockstep.

**Read precedence (Oracle B2):** Use `||` not `??` — empty string is semantically "cleared", treat as falsy. Mirrors `src/tools/generate-design.ts:131-133`.

## Test plan

- 6 new unit tests in `src/__tests__/tools/get-project.test.ts`
- 1 new unit test in `src/__tests__/tools/list-projects.test.ts` (kind regression)
- 1 updated integration test in `tests/integration/tools-readonly.test.ts`

## Out of scope (deferred)

- `pendingPrompt` (write-side)
- `linkedDirs` (write-side)
- A "brand audit" diff tool
- Surfacing `customInstructions` in `od_list_projects` (would token-bomb agents listing 10+ projects)

## Done definition

All 8 AC verified, 7/7 validation ladder clean env, live user-flow test PASS against hosted daemon (retrieves the existing 3,928-char brand spec on `open-design-mcp-site`), fresh Oracle Review Gate PASS, PR merged + #56 auto-closed + archive committed.
