# Design: fix-401-mode-aware-hint

## A. Context

After `od-auth-modes` (#24) shipped, the `OdClient` knows about three auth modes (`none` / `bearer` / `basic`) but the error mapper in `src/tools/errors.ts` does not — its 401 branch hard-codes the bearer-only message `"OD auth failed — check OD_API_TOKEN"`. This change makes the mapper mode-aware. Pure string fix; no machinery change.

## B. Design Decisions

### B1. Surface the resolved mode on `OdClient`

`OdClient` already holds the `AuthDescriptor` privately. Expose just the `mode` field via a readonly getter:

```ts
class OdClient {
  // ...existing fields
  get authMode(): 'none' | 'bearer' | 'basic' {
    return this.auth.mode;
  }
}
```

**Why not expose the full `AuthDescriptor`:** The mapper only needs the mode for branching; exposing credentials (even via a getter) widens the surface for accidental misuse / logging. The mode itself is non-sensitive.

### B2. Mapper signature change (additive, backward-compatible)

```ts
export function mapErrorToToolResult(
  err: unknown,
  authMode: 'none' | 'bearer' | 'basic' = 'bearer',
): ToolErrorResult
```

**Why default to `'bearer'`:** That's the message every existing test asserts. Tests that don't pass `authMode` continue to pass unchanged. New tests for `'basic'` and `'none'` are additive.

### B3. 401 branch logic

```ts
err.status === 401
  ? authMode === 'basic'
    ? 'OD auth failed — check OD_BASIC_USER and OD_BASIC_PASS'
    : authMode === 'none'
      ? 'OD daemon returned 401 — set OD_AUTH_MODE and credentials'
      : 'OD auth failed — check OD_API_TOKEN'
  : ... // other status codes unchanged
```

**Why ternary instead of exhaustive switch:** This is a single-case branch inside a single-case ternary chain. A switch statement would force a wrapper function and lose the existing message-chain readability. The exhaustiveness check lives upstream on `AuthDescriptor.mode` — we're consuming a primitive here.

### B4. Call-site update pattern

Every tool handler that calls `mapErrorToToolResult(err)` becomes `mapErrorToToolResult(err, client.authMode)`. Six tool files affected:

- `src/tools/list-projects.ts:57`
- `src/tools/get-project.ts:79` (via `mapErrorToToolResultWith404` — see B5)
- `src/tools/save-artifact.ts:49`
- `src/tools/lint-artifact.ts:54`
- `src/tools/generate-design.ts` (lines 77, 90, 118, 166)

### B5. `mapErrorToToolResultWith404` inherits the fix

```ts
export function mapErrorToToolResultWith404(
  err: unknown,
  notFoundText: string,
  authMode: 'none' | 'bearer' | 'basic' = 'bearer',
): ToolErrorResult {
  if (err instanceof OdHttpError && err.status === 404) {
    return { content: [{ type: 'text', text: notFoundText }], isError: true };
  }
  return mapErrorToToolResult(err, authMode);
}
```

Same default-`'bearer'` strategy for backward compat.

### B6. Test surface

New file `src/__tests__/tools/errors.test.ts`:

| Test | Input | Expected text |
|---|---|---|
| 401 bearer mode | `mapErrorToToolResult(err401, 'bearer')` | `OD auth failed — check OD_API_TOKEN` |
| 401 basic mode | `mapErrorToToolResult(err401, 'basic')` | `OD auth failed — check OD_BASIC_USER and OD_BASIC_PASS` |
| 401 none mode | `mapErrorToToolResult(err401, 'none')` | `OD daemon returned 401 — set OD_AUTH_MODE and credentials` |
| 401 default arg | `mapErrorToToolResult(err401)` | `OD auth failed — check OD_API_TOKEN` (backward compat) |
| 403/404/429/5xx unaffected | one assertion per status | message unchanged regardless of mode |

Existing tests in `src/__tests__/tools/list-projects.test.ts` etc. continue to pass — they assert the bearer-mode default.

### B7. Out of scope

- Refactoring the cascading-ternary into a lookup table — readability is acceptable.
- Adding a `mode-aware` version of 403/429/5xx messages.
- Per-tool override of the mapper.

## C. Open questions

None.
