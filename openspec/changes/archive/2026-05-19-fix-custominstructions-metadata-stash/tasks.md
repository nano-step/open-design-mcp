# Tasks: fix-custominstructions-metadata-stash

## 1. Implementation (3 source files)

1. [ ] `src/tools/update-project.ts`:
   - [ ] When `args.customInstructions !== undefined`, ALSO set `patch.metadata = { ...(existing patch.metadata ?? {}), customInstructions: args.customInstructions }`.
   - [ ] If the caller also passed `kind` (which goes into metadata), preserve it: `metadata = { kind, customInstructions }`.
   - [ ] Document the stash in the tool description: "customInstructions is also mirrored into metadata.customInstructions to work around upstream daemon GET response that omits the top-level field."

2. [ ] `src/tools/create-project.ts`:
   - [ ] Same pattern: when `args.customInstructions !== undefined`, ALSO write to `metadata.customInstructions` on the create request.
   - [ ] Document.

3. [ ] `src/tools/generate-design.ts`:
   - [ ] Change line ~119:
     ```typescript
     storedCustomInstructions = detail.project.customInstructions || undefined;
     ```
     to:
     ```typescript
     storedCustomInstructions =
       detail.project.metadata?.customInstructions ||
       detail.project.customInstructions ||
       undefined;
     ```
   - [ ] Add inline comment explaining the fallback chain.

## 2. Unit tests (existing + 2 new)

4. [ ] `src/__tests__/tools/generate-design.test.ts`:
   - [ ] Existing tests 22 + 24 still pass (they mock top-level field — fallback chain handles them, no change needed).
   - [ ] Add test 25: "projectId + metadata.customInstructions present, top-level absent → composeSystemPrompt receives stashed value". Mock daemon returns `project: { id, name, metadata: { kind: 'page', customInstructions: 'STASHED' } }`. Assert system prompt contains 'STASHED'.
   - [ ] Add test 26: "projectId + BOTH metadata and top-level set with different values → metadata wins". Mock returns both; assert metadata value is used (forward-compat: when upstream fixes, stash is authoritative until then).

5. [ ] `src/__tests__/tools/update-project.test.ts`:
   - [ ] Add test: "customInstructions passed → daemon receives metadata.customInstructions in PATCH body". Use `vi.fn()` daemon, capture the patch payload, assert `payload.metadata.customInstructions === args.customInstructions`.

6. [ ] `src/__tests__/tools/create-project.test.ts`:
   - [ ] Same pattern: "customInstructions passed → daemon receives metadata.customInstructions in create body".

## 3. Integration test (the real bug guard)

7. [ ] `tests/integration/tools-byok.test.ts` (or a new file):
   - [ ] Add test "od_generate_design surfaces customInstructions via metadata.customInstructions even when daemon omits top-level field". Mock daemon GET returns `project: { ..., metadata: { kind: 'page', customInstructions: 'MARKER-7K3X' } }` with NO top-level `customInstructions`. Trigger `od_generate_design { projectId, prompt }`. Assert the BYOK proxy received a system prompt containing 'MARKER-7K3X'.

## 4. Documentation

8. [ ] Update `README.md`:
   - [ ] In the `od_update_project` row description, add: "customInstructions is mirrored to metadata.customInstructions for daemon compat — see #43."
   - [ ] Same for `od_create_project`.
   - [ ] Same for `od_generate_design`: "Reads customInstructions from metadata.customInstructions (compat with current daemon) or top-level (upstream-fix forward-compat)."

9. [ ] Update `.opencode/skills/od-workflow/SKILL.md` if the tool reference section needs to reflect the round-trip behavior — likely just a one-line note.

## 5. Spec delta

10. [ ] `openspec/changes/fix-custominstructions-metadata-stash/specs/build-and-ci/spec.md`:
    - [ ] 1 MODIFIED requirement: how customInstructions is round-tripped (write to metadata stash + top-level, read with fallback chain).

## 6. Validation ladder

11. [ ] Clean env: `unset OD_* BYOK_*`
12. [ ] `npm run lint` ✅
13. [ ] `npm run typecheck` ✅
14. [ ] `npm test` ✅ (expect ≥193 unit, all green — 4 new tests)
15. [ ] `npm run build` ✅
16. [ ] `bash scripts/vendor-check.sh` ✅
17. [ ] `npm run test:integration` ✅ (expect ≥26, +1)
18. [ ] `openspec validate fix-custominstructions-metadata-stash --strict --no-interactive` ✅

## 7. Oracle review

19. [ ] Fire `oracle` review on the diff (lane:normal × bug-fix × 1 risk flag gate).

## 8. Ship

20. [ ] Commit: `fix: stash customInstructions in metadata for daemon compat (closes #43)`
21. [ ] Push as kokorolx via temp token URL
22. [ ] Open PR against master, assignee kokorolx
23. [ ] Wait for CI green
24. [ ] Squash-merge
25. [ ] `openspec archive fix-custominstructions-metadata-stash --yes`
26. [ ] Commit + rebase + push archive

## 9. Re-dogfood (the proof gate)

27. [ ] Run a focused mini-dogfood against the hosted daemon: PATCH project with customInstructions containing a marker, call `od_generate_design`, grep the generated HTML for the marker. Document the result in `docs/evidence/v1-ships-dogfood/re-dogfood-43-fix.md`.
28. [ ] If Signal 4 flips to PASS → close #43 with evidence link.
