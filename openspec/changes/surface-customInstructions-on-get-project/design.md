# Design — Surface customInstructions + metadata on od_get_project

## Context

- `od_get_project`'s current output schema: `{ project: {id, name, kind?, status?, resolvedDir?}, files }`
- Daemon GET `/api/projects/:id` returns: `{ project: {id, name, skillId, designSystemId, metadata: {kind, fidelity, customInstructions}, createdAt, updatedAt}, files }`
- Verified live on hosted daemon: `docs/evidence/get-project-customInstructions/daemon-raw-response.json` (3,928-char customInstructions).
- Vendor type `Project` (`vendor/od-contracts/src/api/projects.ts:125-142`) declares `customInstructions?: string` AND `metadata?: ProjectMetadata | null`.
- Existing canonical read precedence pattern: `src/tools/generate-design.ts:131-133` — `md?.customInstructions || detail.project.customInstructions || undefined`.
- Existing canonical stash pattern: `src/tools/create-project.ts:64-69` (writes to `metadata.customInstructions` for daemon compat, #43).
- Existing stash type: `src/types/metadata-stash.ts` (`ProjectMetadataWithStash`).

## Decisions

### 1. Option A (surface) over Option B (MCP-side store) — UNANIMOUS

**Decision:** Pure pass-through via Option A. No new storage layer.

**Rationale:** Both Metis and Oracle converged that the daemon already returns the data reliably. Live evidence: 3,928 chars round-trip via `metadata.customInstructions` on hosted. Option B (SQLite/JSON in MCP) was estimated at ~10× the cost of A with zero additional value for #56 — it would only be justified if the MCP needed to persist data that does NOT belong on the daemon (workspace-local notes, agent-private session state, etc.). #56 doesn't have that requirement.

**Confidence:** High — daemon contract confirmed via live curl.

### 2. Read precedence — mirror `generate-design.ts:131-133` exactly

**Decision:** Use the same `||` short-circuit pattern, not `??`:

```ts
const md = p.metadata as ProjectMetadataWithStash | undefined;
const customInstructions =
  md?.customInstructions ||
  (p as { customInstructions?: string }).customInstructions ||
  undefined;
```

**Rationale (Oracle B2):** Empty string `""` is semantically "cleared", not "set to empty" — must be treated as falsy. `??` would surface the empty string; `||` skips to the next source or `undefined`. Mirrors existing precedence for `od_generate_design`, so a project that auto-merges its `customInstructions` into the system prompt produces identical results to what `od_get_project` would surface. Symmetry between write→read→generate paths.

**Confidence:** High — direct cite from canonical existing code.

### 3. outputSchema and structuredContent MUST be updated in lockstep (CRITICAL)

**Decision:** Both the Zod `outputSchema` definition AND the `structuredContent` type AND the handler return shape must add every new field together.

**Rationale (Oracle B1):** The MCP SDK at `@modelcontextprotocol/sdk/server/mcp.js:200-201` validates `structuredContent` against the Zod `outputSchema` via `safeParseAsync`. Zod's default `z.object()` **silently strips** unknown keys. Furthermore, `zodToJsonSchema()` emits `additionalProperties: false` in the JSON Schema exposed via `tools/list`. Verified empirically:

```
z.object({a: z.string()}).safeParse({a: 'x', b: 'y'})
// → {success: true, data: {a: 'x'}}  // b silently stripped
```

Implementation gotcha: if a contributor adds the field to `structuredContent` but forgets `outputSchema`, the new field disappears with no error.

**Confidence:** High — empirically verified.

### 4. Text response design — full content, with a length-indicator header

**Decision:** When `customInstructions` is set, the text response appends:

```
Custom Instructions (3928 chars):
<full content>
```

When not set, the line is omitted entirely (not `Custom Instructions: none`).

**Rationale:** The LLM reads `content[0].text`. The whole point of #56 is to let the LLM SEE the instructions. Truncating defeats the purpose. The length-indicator header makes the section scannable; the full content makes it useful. 3-5 KB strings fit comfortably within typical tool-output limits.

**Confidence:** High — both consultants agreed (Oracle: "full dump"; Metis: "indicator only" — resolved as hybrid which is what Oracle's exact code emits).

### 5. Surface only customInstructions in `od_list_projects` — NO

**Decision:** `od_list_projects` gets ONLY the `kind` bug fix, not the new fields.

**Rationale (Metis):** Adding 3-5 KB of `customInstructions` per project to a list response = token-bomb. Lists are for discovery (id + name + summary), gets are for detail. Asymmetry is intentional. Same logic applies to `fidelity`, `skillId`, `designSystemId`, `createdAt`, `updatedAt` — they belong on `od_get_project` only.

**Confidence:** High — design symmetry argument.

### 6. Pre-existing `kind` bug — fix in same PR (BOTH tools)

**Decision:** Fix in both `get-project.ts:55` AND `list-projects.ts` (line that reads `kind`).

**Rationale (Metis bonus finding):** Current code `(p as { kind?: string }).kind` reads a non-existent top-level field. Vendor type confirms `kind` only exists at `metadata.kind`. Daemon evidence confirms same. Current output ALWAYS returns `kind: undefined`. Same root cause in both tools, 1-line fix each, ships together.

**Behavior change:** Callers that hardcoded `kind === undefined` checks would see new values (`'prototype'`, `'deck'`, etc.). Treated as bug-fix, not breaking change — listed transparently in proposal.md.

**Confidence:** High — daemon evidence + vendor type cite.

### 7. NO redaction of customInstructions content

**Decision:** Surface `customInstructions` verbatim. No regex-based secret redaction.

**Rationale (Oracle):** Content is user-authored and already visible in the daemon UI + already consumed by `od_generate_design`. The MCP runs via stdio (local process, no network exposure beyond stdin/stdout to the parent editor). Redacting patterns like `sk-*` or `Bearer ...` would break legitimate brand content (e.g. "Use Bearer tokens for auth" in a brand spec section). Trust the user's own data.

**Tool description gets a one-line note:** "May include customInstructions if set on the project (user-supplied content)."

**Confidence:** High — risk assessment grounded in stdio architecture.

### 8. Out-of-scope deferrals

**Deferred to future issues (NOT in this PR):**
- `pendingPrompt` — write-side field, doesn't close a read-back gap. File as separate issue if needed.
- `linkedDirs` — same logic.
- A "brand audit" tool that diffs `customInstructions` across sibling projects.
- An `od_get_custom_instructions` dedicated read tool — over-engineering when `od_get_project` covers it.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Caller relies on EXACT current shape via `.strict()` schema match | Very low | Additive change — no existing field changed. Optional fields are valid extensions. |
| `kind` bug-fix surprises a caller that ignored the always-`undefined` value | Very low | Documented in proposal. The "fix" is the correct behavior. |
| Daemon returns `customInstructions: null` instead of omitting it | Low | Read precedence with `||` treats null as falsy, returns `undefined`. Safe. |
| outputSchema and structuredContent drift again in a future change | Medium | Add a comment block at both call sites referencing this decision. |
| `customInstructions` content contains secrets a user pasted in error | Low | Out of scope per decision 7. User's own data. |

## Migration

None required. Output is additive; no caller breaks.

## Open questions

None remaining — all 3 user-facing questions from Metis pre-resolved:
1. Text format: hybrid (length header + full content) ✓
2. Fix `kind` in `list_projects` too: yes ✓
3. Timestamp format: epoch millis as-is (no conversion) ✓
