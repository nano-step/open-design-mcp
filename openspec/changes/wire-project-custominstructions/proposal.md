# Proposal: wire-project-custominstructions

**Lane × Change Type:** `lane:normal × change-type:bug-fix`
**Risk Flags:** 1 (new optional param + one extra HTTP round-trip; backwards compatible)
**Issue:** [#37](https://github.com/nano-step/open-design-mcp/issues/37)

## Why

`od_generate_design` ignores the `customInstructions` field stored on the project record. The MCP tool only sees per-call `projectInstructions`, never the stored value. This breaks multi-page consistency: users must paste their full design system into every generation call. Miss it once → page 3 drifts from page 1.

The skill at `.opencode/skills/open-design-mcp/SKILL.md:82` currently claims:

> "The `customInstructions` field is how you bake design preferences ("dark mode", "rounded corners", "Tailwind v4") into all future generations on this project. Set it once on create or update — `od_generate_design` reads it."

**That claim is false today.** Either we make it true, or we strike it from the docs. This change makes it true.

## What Changes

### F1 — Add `projectId` to `od_generate_design` input schema

```typescript
const inputSchema = z.object({
  prompt: z.string().min(1).describe('Design request from the user'),
  projectId: z.string().optional()
    .describe('Project ID — when provided, the project\'s stored customInstructions are merged into the system prompt (per-call projectInstructions wins on conflict)'),
  kind: z.enum(KIND_VALUES).optional().default('prototype'),
  userInstructions: z.string().optional(),
  projectInstructions: z.string().optional(),
});
```

### F2 — Handler fetches the project and merges customInstructions

After BYOK validation, before composing the system prompt:

```typescript
let storedCustomInstructions: string | undefined;
if (args.projectId) {
  try {
    const detail = await client.getProject(args.projectId, combined);
    storedCustomInstructions = detail.project.customInstructions || undefined;
  } catch (err) {
    return mapErrorToToolResult(err, client.authMode);
  }
}

const mergedProjectInstructions = mergeProjectInstructions(
  storedCustomInstructions,
  args.projectInstructions,
);

const systemPrompt = composeSystemPrompt({
  metadata: { kind: args.kind },
  userInstructions: args.userInstructions,
  projectInstructions: mergedProjectInstructions,
  streamFormat: 'plain',
});
```

### F3 — Merge precedence

The `mergeProjectInstructions` helper:
- If only stored: use stored
- If only per-call: use per-call
- If both: per-call wins on conflict, but concatenate so both signals reach the LLM (per-call appended after stored, with `\n\n---\n\n` separator + a comment noting the override)
- If neither: undefined (Layer 6 of the system prompt is skipped, current behavior preserved)

This gives a useful default: project-wide brand rules live in `customInstructions`, per-call refinements go in `projectInstructions`.

### F4 — Errors map cleanly

Project-not-found, network errors, and auth failures during the `getProject` call use the existing `mapErrorToToolResult` path (404 → "Project not found: <id>", etc.). No new error shapes.

### F5 — Tool description update

Add to description: "When `projectId` is provided, the project's stored `customInstructions` (set via `od_create_project` or `od_update_project`) are merged into the system prompt — set design tokens, brand voice, and component conventions once per project."

### F6 — Fix the skill doc

The current SKILL.md claim is correct AFTER this change ships. No prose changes needed in SKILL.md itself, but `references/workflows.md` gains a new example: "Multi-page consistency via stored customInstructions" showing the auto-fetch flow.

## Out of scope

- Auto-fetching `designSystemId` / `skillId` (those Layers 7/8 require new resolution code; separate future change)
- Conversation history threading (requires `/api/runs` integration; separate larger discussion)
- Caching `getProject` results across multiple calls (the cost is one HTTP round-trip per generation; trivial compared to the 1–10 min generation itself)

## Risk

**1 risk flag:**

1. **One extra HTTP call when `projectId` is provided.** Same daemon, same auth, ~50ms. Behavior unchanged when `projectId` omitted. Mitigation: backwards-compatible (the new param is optional); existing call sites work identically.

No vendored code touched. No new env vars. No security implications (auth flows through the same path).

## Acceptance Criteria

- [ ] `od_generate_design` schema accepts optional `projectId: string`
- [ ] When `projectId` provided, `client.getProject(projectId, signal)` is called before composing prompt
- [ ] Stored `customInstructions` from the project is threaded into Layer 6
- [ ] When both stored and per-call `projectInstructions` are present, per-call appended after stored with separator
- [ ] When `projectId` is invalid → returns the existing 404 error (matches `od_get_project` error shape)
- [ ] When `projectId` is omitted → behavior identical to today (full backwards compat)
- [ ] Tool description updated to mention the new behavior
- [ ] All 173 existing unit tests pass
- [ ] 4+ new unit tests cover: projectId-only-stored, projectId-with-percall-merge, projectId-not-found, no-projectId-baseline
- [ ] `references/workflows.md` adds an end-to-end multi-page consistency example
- [ ] Oracle review: PASS
- [ ] Validation ladder: 7/7 green in clean env
