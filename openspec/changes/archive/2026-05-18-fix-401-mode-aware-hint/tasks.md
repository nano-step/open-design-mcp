# Tasks: fix-401-mode-aware-hint

Lane:tiny × bug-fix → single PR, self-verify, no Oracle gate.

## T-1: Add `authMode` getter to `OdClient`

In `src/od-client.ts`, add:

```ts
get authMode(): 'none' | 'bearer' | 'basic' {
  return this.auth.mode;
}
```

**Verify:** `npm run typecheck` clean.

## T-2: Extend `mapErrorToToolResult` signature

In `src/tools/errors.ts`:

- Add optional `authMode` parameter defaulting to `'bearer'` (backward-compat)
- Rewrite the 401 branch with the 3-mode ternary
- Update `mapErrorToToolResultWith404` to accept + forward `authMode`

**Verify:** `npm run typecheck` clean.

## T-3: Update 6 call sites

Pass `client.authMode` at every call:

- `src/tools/list-projects.ts:57`
- `src/tools/get-project.ts:79` (forward to `mapErrorToToolResultWith404`)
- `src/tools/save-artifact.ts:49`
- `src/tools/lint-artifact.ts:54`
- `src/tools/generate-design.ts` × 4

**Verify:** `npm run typecheck` clean.

## T-4: New test file `src/__tests__/tools/errors.test.ts`

Cover all 5 cases from design §B6.

**Verify:** `npm test -- errors.test` → all green.

## T-5: Full validation ladder

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `bash scripts/vendor-check.sh`
6. `npm run test:integration`

**Verify:** all 6 exit 0; unit count grew by ≥5; integration count unchanged.

## T-6: HARNESS_BACKLOG flip

`docs/HARNESS_BACKLOG.md` HB-12: `Status: proposed` → `Status: implemented`.

## T-7: Single atomic commit

`fix(errors): emit mode-aware 401 hint`

## T-8: Push + PR + merge + archive

- Open PR referencing #25
- Wait for CI green
- Squash-merge as kokorolx
- `openspec archive fix-401-mode-aware-hint`
