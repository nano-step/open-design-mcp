# Tasks: add-od-compose-brief

## 1. Implementation

1. [ ] Create `src/tools/compose-brief.ts`:
   - [ ] Zod input schema: `pagePrompt: string.min(1)`, `briefAnswers: object().optional()`, `brandSpec: string.optional()`, `siblingArtifactSlugs: array(string).optional()`. All `briefAnswers` subfields optional. Each field with `.describe()`.
   - [ ] Pure helper `composeBrief(args)` returning the formatted string.
   - [ ] Format order: `[form answers — discovery]\n- key: value (joined by ', ' if string[])\n` → blank line → `[brand spec]\n<markdown>` → blank line → `[page brief]\n<pagePrompt>`. Skip empty sections (no orphan headers). Skip undefined/empty subfields under `[form answers — discovery]`.
   - [ ] Tool handler returns `{ content: [{ type: 'text', text: composeBrief(args) }] }` — no `isError` for valid inputs.
   - [ ] Tool description: "Format a Turn 3 prompt for od_generate_design. Combines Turn 1 form answers, Turn 2 brand-spec, and the page brief into a single string upstream OD recognizes (skips re-asking discovery questions). Pure function — no network or env vars."
   - [ ] Export `registerComposeBrief(server)` — no `client` param needed (pure).

2. [ ] Update `src/tools/index.ts`:
   - [ ] Import `registerComposeBrief`.
   - [ ] Call `registerComposeBrief(server)` between `registerLintArtifact` and `registerGenerateDesign`.

## 2. Tests

3. [ ] Create `tests/tools/compose-brief.test.ts` with 8 test cases:
   - [ ] form-only: only briefAnswers passed → emits `[form answers — discovery]` + `[page brief]`, no `[brand spec]`.
   - [ ] brand-only: only brandSpec passed → emits `[brand spec]` + `[page brief]`, no `[form answers]`.
   - [ ] both: all sections present in correct order with blank lines between.
   - [ ] minimal: only `pagePrompt` → emits `[page brief]` only.
   - [ ] string[] formatting: `platform: ['Responsive web', 'Desktop web']` → `- platform: Responsive web, Desktop web`.
   - [ ] empty array: `platform: []` → field omitted (not `- platform: `).
   - [ ] undefined subfields: only `audience` set in `briefAnswers` → only that one rendered.
   - [ ] special chars: newlines/quotes/brackets in values preserved (no escaping — upstream handles raw text).

4. [ ] Update `tests/integration/server.spec.ts`:
   - [ ] Add one test case calling `od_compose_brief` via tools/call.
   - [ ] Assert response shape: `content[0].type === 'text'`, text contains `[page brief]`.

## 3. Documentation & polish

5. [ ] Update `README.md` tools table: 8 → 9 rows. Add `od_compose_brief` row with `format` verb, env vars = none.
6. [ ] Update `.opencode/skills/od-workflow/references/workflow-examples.md`: both end-to-end examples should call `od_compose_brief` in Turn 3.
7. [ ] Update `.opencode/skills/od-workflow/SKILL.md` tool mapping section: add `od_compose_brief` row.
8. [ ] Update `openspec/specs/build-and-ci/spec.md` once archived: spec delta with 1 ADDED requirement (the tool exists, has 9 tools total, pure function).

## 4. Validation ladder

9. [ ] Clean env: `unset OD_* BYOK_*`
10. [ ] `npm run lint` ✅
11. [ ] `npm run typecheck` ✅
12. [ ] `npm test` ✅ (expect 183+8 = 191 unit, all green)
13. [ ] `npm run build` ✅
14. [ ] `bash scripts/vendor-check.sh` ✅
15. [ ] `npm run test:integration` ✅ (24 → 25)
16. [ ] `openspec validate add-od-compose-brief --strict --no-interactive` ✅

## 5. Ship

17. [ ] Commit: `feat: add od_compose_brief tool — format Turn 3 prompts (closes #39)`
18. [ ] Push as kokorolx via temp token URL (origin push blocked)
19. [ ] Open PR against master, assignee kokorolx
20. [ ] Wait for CI green
21. [ ] Squash-merge
22. [ ] `openspec archive add-od-compose-brief --yes`
23. [ ] Commit + rebase (auto-bump) + push archive
24. [ ] Re-sync `od-workflow` skill (since SKILL.md changed) via `sync-skill-to-manager`
