# Tasks: fix-generate-design-maxtokens

## 1. Implementation

1. [ ] `src/od-client.ts`:
   - [ ] Add `maxTokens?: number` to the `ProxyStreamRequest` interface. Document it inline: "Optional cap on completion tokens, forwarded to the OD daemon's `/api/proxy/<provider>/stream` endpoint. Defaults to 8192 on the daemon side when unset — see #36."

2. [ ] `src/tools/generate-design.ts`:
   - [ ] Add `maxTokens` to the zod input schema:
     ```typescript
     maxTokens: z
       .number()
       .int()
       .positive()
       .max(200_000)
       .optional()
       .default(64_000)
       .describe('Cap on completion tokens forwarded to the BYOK provider. Default 64000 (8× the daemon\'s built-in 8192 default). Range [1, 200000]. Most providers cap themselves below this; the daemon forwards verbatim.')
     ```
   - [ ] Pass `maxTokens: args.maxTokens` into the `proxyReq` literal.
   - [ ] Update the tool description to mention `maxTokens` as a tunable parameter.

## 2. Tests — unit (4 new)

3. [ ] `src/__tests__/tools/generate-design.test.ts`:
   - [ ] Test 29: 'maxTokens explicit value → forwarded to proxyStream (issue #36)'. Mock proxyStream, assert `mockReq.maxTokens === 32000` when caller passes 32000.
   - [ ] Test 30: 'maxTokens omitted → default 64000 forwarded (issue #36)'. Mock proxyStream, assert `mockReq.maxTokens === 64000` when caller omits the field.
   - [ ] Test 31: 'maxTokens out of range → zod rejects'. Try `maxTokens: 0` and `maxTokens: 300_000`, assert handler returns error result with text containing 'maxTokens'.
   - [ ] Test 32: 'maxTokens non-integer → zod rejects'. Try `maxTokens: 1.5`, assert error result.

## 3. Tests — integration (1 new)

4. [ ] `tests/integration/tools-byok.test.ts`:
   - [ ] New test: 'od_generate_design forwards maxTokens to daemon proxy body'. Mock daemon, capture `POST /api/proxy/<provider>/stream` body, parse JSON, assert `body.maxTokens === 32000` when caller passes 32000.

## 4. Documentation

5. [ ] `README.md`:
   - [ ] Update `od_generate_design` row in the tools table: mention the new `maxTokens` parameter.
   - [ ] Add to the env vars table (no new env var, but the section explaining the tool should note the cap).

6. [ ] `.opencode/skills/od-workflow/SKILL.md`:
   - [ ] In the tool reference section, add a note that `od_generate_design` accepts `maxTokens` for long pages.

## 5. Spec delta

7. [ ] `openspec/changes/fix-generate-design-maxtokens/specs/build-and-ci/spec.md`:
   - [ ] 1 ADDED requirement: how `od_generate_design` controls completion-token cap.

## 6. Validation ladder

8. [ ] `unset OD_* BYOK_*`
9. [ ] `npm run lint` ✅
10. [ ] `npm run typecheck` ✅
11. [ ] `npm test` ✅ (expect ≥199 unit, +4)
12. [ ] `npm run build` ✅
13. [ ] `bash scripts/vendor-check.sh` ✅
14. [ ] `npm run test:integration` ✅ (expect ≥27, +1)
15. [ ] `npx openspec validate fix-generate-design-maxtokens --strict --no-interactive` ✅

## 7. Oracle review

16. [ ] Fire `oracle` review on the diff (lane:normal × bug-fix × 1 risk flag gate).

## 8. Ship

17. [ ] Commit: `fix: forward maxTokens to daemon to prevent silent truncation (closes #36)`
18. [ ] Push as kokorolx via temp token URL
19. [ ] Open PR against master, assignee kokorolx
20. [ ] Wait for CI green
21. [ ] Squash-merge
22. [ ] `openspec archive fix-generate-design-maxtokens --yes`
23. [ ] Commit + rebase + push archive

## 9. Re-dogfood (the proof gate)

24. [ ] Run a focused dogfood: invoke `od_generate_design` with the full `lithe` landing page brief from `docs/evidence/v1-ships-dogfood/composed-brief.txt`. Assert the response contains `</html>` (proves the page completed).
25. [ ] Save to `docs/evidence/v1-ships-dogfood/re-dogfood-36-fix.md`.
26. [ ] Close #36 with evidence link.
