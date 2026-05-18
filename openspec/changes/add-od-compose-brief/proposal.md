# Proposal: add-od-compose-brief

**Lane × Change Type:** `lane:tiny × change-type:user-feature`
**Risk Flags:** 0 (pure formatter, no network, no env, no auth)
**Issue:** [#39](https://github.com/nano-step/open-design-mcp/issues/39)

## Why

The `od-workflow` skill (#38, shipped in v0.13.0) instructs subagents to format their Turn 3 prompts as:

```
[form answers — discovery]
- platform: ...
- audience: ...

[brand spec]
<brand-spec.md content>

[page brief]
<pagePrompt>
```

This format matches the upstream OD recognizer at `discovery.ts:114-119`, which checks for the `[form answers —` prefix to skip re-asking discovery questions. Today the subagent must remember the exact syntax, escape values, format `string[]` fields, and re-paste the brand-spec into every per-page call. Easy to mis-format → upstream prompt fails to recognize "form was answered" → re-asks discovery → wasted turns.

A tiny pure helper tool removes the friction: subagent passes structured inputs, gets a correctly-formatted string back, hands it to `od_generate_design`. Multi-page consistency comes free — same `briefAnswers` + `brandSpec` threaded to every per-page call.

## What changes

Add **one new MCP tool**: `od_compose_brief`.

- Pure function. No network, no env vars, no auth.
- Zod input schema with all-optional fields (`pagePrompt` required, all others optional).
- Returns `{ content: [{ type: 'text', text: <composed> }] }` like other tools.
- Section order: `[form answers — discovery]` → `[brand spec]` → `[page brief]`. Empty sections omitted entirely (not even the header).
- `string[]` fields joined with `, ` (matches upstream form-answer convention).
- `siblingArtifactSlugs` field accepted but ignored — reserved hook for future cross-page consistency (per issue scope).
- Tool description states "use BEFORE `od_generate_design` to format Turn 3 prompts".

After this lands: **9 MCP tools** (8 today + 1).

## Why not

- **Why not let the subagent format manually?** Already does; the skill teaches the format. But every manual format is a chance to break upstream recognition. A 30-line helper makes this impossible to get wrong.
- **Why not auto-fetch `customInstructions`?** That's #37's job — already shipped. This helper is upstream of that in the chain; the subagent uses both: `od_compose_brief` formats the prompt, `od_generate_design` auto-fetches per-project customInstructions on top.
- **Why not auto-run brand extraction?** That's the subagent's Turn 2 (WebFetch + grep). This tool is a pure formatter, not an extraction agent.
- **Why a tool and not a skill helper?** Tools work across editor/agent surfaces uniformly; skills are OpenCode-specific. Other MCP consumers (Claude Code, Cursor) get the helper too.

## Risk

- **Low.** Pure function. Zero `OD_*`/`BYOK_*` env touch. Zero network. Easy to test exhaustively.
- One subtle hazard: special characters in answer values could break upstream's regex recognizer. Tests must cover newlines, square brackets, quotes, unicode.

## Out of scope

- Auto-fetch `customInstructions` (#37, shipped)
- Sibling-artifact context fetching (`siblingArtifactSlugs` reserved, not implemented)
- Auto-run brand extraction (subagent's Turn 2 job)
- Auto-detect the "right" sections from a free-form prompt (callers pass structured inputs)

## Acceptance criteria

- [ ] `src/tools/compose-brief.ts` exports a `registerComposeBrief(server, client)` function — even though `client` is unused (pure function), keep the signature consistent with other tools for `index.ts` symmetry. Or omit `client` per existing patterns if cleaner. Either is fine; pick whichever matches the existing tool that's most pure-function-like.
- [ ] Tool registered in `src/tools/index.ts` after `registerLintArtifact` and before `registerGenerateDesign` (since it's a prep tool for generate-design).
- [ ] Zod input schema documented with `.describe()` per field.
- [ ] Tool description explicitly states it's a formatter helper that's CALLED BEFORE `od_generate_design`.
- [ ] 6+ unit tests in `tests/tools/compose-brief.test.ts` covering: form-only, brand-only, both, neither (pagePrompt only), special chars (newlines, quotes, brackets, unicode), multi-platform `string[]` formatting, empty arrays, undefined fields.
- [ ] Empty sections omitted (no orphan headers like `[brand spec]\n\n` when `brandSpec` is undefined).
- [ ] Integration test in `tests/integration/server.spec.ts`: call `od_compose_brief` via the MCP server, assert the response shape (counts increase 24 → 25).
- [ ] All validation ladder gates green: lint, typecheck, unit (183 → 189+), build, vendor-check, integration (24 → 25), openspec --strict.
- [ ] Tool count in README updated: 8 → 9.
- [ ] Skill `references/workflow-examples.md` updated to use `od_compose_brief` in Turn 3 examples.
