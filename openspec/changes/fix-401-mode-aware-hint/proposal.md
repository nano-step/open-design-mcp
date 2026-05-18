# Proposal: fix-401-mode-aware-hint

**Lane × Change Type:** `lane:tiny × change-type:bug-fix`
**Risk Flags:** 0 (single-file logic change, string-only behavior shift)
**Issue:** [#25](https://github.com/nano-step/open-design-mcp/issues/25)
**Closes:** HB-12 in `docs/HARNESS_BACKLOG.md`

## Why

After shipping `od-auth-modes` (#24, v0.10.0), the 401 error mapper in `src/tools/errors.ts:12` still hard-codes:

```
OD auth failed — check OD_API_TOKEN
```

This message is returned regardless of which auth mode is configured. A user running `OD_AUTH_MODE=basic` with wrong credentials sees a 401 telling them to check `OD_API_TOKEN` — an env var they aren't (and shouldn't be) using. They'll waste time chasing the wrong variable.

Discovered during live smoke test against `https://od.thnkandgrow.com/` post-merge (transcript: `docs/evidence/od-auth-modes/smoke-test.md` §B and §C).

The auth machinery itself works correctly — only the user-facing hint string is misleading.

## What Changes

`mapErrorToToolResult` becomes aware of the resolved auth mode, and emits a mode-specific 401 hint:

| `OdClient.authMode` | 401 message |
|---|---|
| `bearer` | `OD auth failed — check OD_API_TOKEN` (unchanged) |
| `basic` | `OD auth failed — check OD_BASIC_USER and OD_BASIC_PASS` |
| `none` | `OD daemon returned 401 — set OD_AUTH_MODE and credentials` |

All other status mappings (403, 404, 429, 5xx) unchanged.

### Implementation sketch

1. `OdClient` exposes a readonly `authMode: 'none' | 'bearer' | 'basic'` getter (derived from the existing `AuthDescriptor`).
2. `mapErrorToToolResult(err, authMode?)` accepts an optional second arg; defaults to `'bearer'` when unspecified for backward-compat with the existing test surface.
3. Six call sites in `src/tools/*.ts` updated to pass `client.authMode` when calling the mapper.
4. New unit tests in `src/__tests__/tools/errors.test.ts` cover all 3 modes' 401 messages.

## Out of scope

- Changing the 403/404/429/5xx messages — those don't depend on auth mode.
- Touching the `mapErrorToToolResultWith404` 404 handler — it delegates to `mapErrorToToolResult`, which transparently inherits the fix.
- Adding new auth modes — that's a separate future change.

## Risk

**tiny.** Pure string-message change in one file, threaded through 6 call sites. No behavior shift on the wire (same HTTP requests, same error codes). Backward-compatible default (`'bearer'`) preserves every existing test assertion.

One soft risk: passing `client.authMode` to the mapper introduces a small coupling between tool handlers and the auth resolution. Mitigation: the coupling is one read of a single readonly field — no observable side effect.
