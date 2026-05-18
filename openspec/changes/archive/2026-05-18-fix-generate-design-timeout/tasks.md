# Tasks: fix-generate-design-timeout

Lane:normal × bug-fix → single PR, Oracle review on PR, tests required.

## T-1: Add `OD_GENERATE_TIMEOUT_MS` to coreEnvSchema

`src/config.ts`:

```typescript
OD_GENERATE_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
```

Add to `CoreConfig` type via Zod inference (automatic).

**Verify:** `parseCore({ OD_DAEMON_URL: 'http://x' }).OD_GENERATE_TIMEOUT_MS === 600_000`; explicit override honored.

## T-2: Thread timeout into `makeGenerateDesignHandler`

Change signature in `src/tools/generate-design.ts`:

```typescript
export function makeGenerateDesignHandler(
  client: OdClient,
  timeoutMs: number,            // NEW — DI param
  loadByok: () => ByokConfig = getByokConfig,
): ...
```

Replace `AbortSignal.timeout(DEFAULT_TIMEOUT_MS)` with `AbortSignal.timeout(timeoutMs)`.

Delete `DEFAULT_TIMEOUT_MS` constant (now lives in `coreEnvSchema.default`).

Update `registerGenerateDesign(server, client)` → `registerGenerateDesign(server, client, timeoutMs)`. Caller (server.ts) reads from CoreConfig.

**Verify:** Existing test 11 still passes (proxyStream receives an AbortSignal); new tests can pass custom `timeoutMs`.

## T-3: Add `isAbortError` helper + timeout-vs-cancel distinction

Add to `src/tools/generate-design.ts` (private — not exported):

```typescript
function isAbortError(err: unknown): err is DOMException {
  return err instanceof DOMException &&
    (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError';
}
```

**Verify:** unit-test ergonomics — `isAbortError(new DOMException('x', 'AbortError'))` is true, `isAbortError(new Error('x'))` is false.

## T-4: Partial-result recovery in catch block

In `src/tools/generate-design.ts` (current lines 164-167):

```typescript
} catch (err) {
  if (isAbortError(err) && accumulated.length > 0) {
    const reason = isTimeoutError(err)
      ? `timed out after ${timeoutMs}ms`
      : 'cancelled by client';
    return {
      content: [{
        type: 'text',
        text: accumulated +
          `\n\n<!-- Generation ${reason} at ${deltaCount} deltas ` +
          `(${accumulated.length} chars). Output is incomplete. ` +
          `Increase OD_GENERATE_TIMEOUT_MS or slice the prompt into smaller sections. -->`,
      }],
      isError: true,
    };
  }
  return mapErrorToToolResult(err, client.authMode);
}
```

**Verify:** 3 new tests cover partial-recovery branches.

## T-5: Update `od_generate_design` tool description

`src/tools/generate-design.ts:184-185`:

```typescript
description:
  "Generate a design artifact using BYOK. Composes the upstream Open Design system prompt and proxies through OD's /api/proxy/<provider>/stream endpoint. Requires BYOK_BASE_URL, BYOK_API_KEY, BYOK_MODEL env vars in addition to OD_DAEMON_URL. Long prompts (full pages) can take 5-10 minutes — server timeout defaults to 10 minutes, configurable via OD_GENERATE_TIMEOUT_MS. MCP clients may impose their own request timeout (often 60s); on truncation, partial HTML is returned with a trailing comment marker.",
```

**Verify:** description string is ≤ ~600 chars; the catalog row in the skill will need to mirror this.

## T-6: Update README "How it works"

Replace `"Typical end-to-end: 10–60 seconds"` with:

> Typical end-to-end: 10 seconds for small sections (single hero, paragraph rewrite), 1–5 minutes for full pages, up to 10 minutes for complex multi-section designs. Default server timeout is 10 minutes (configurable via `OD_GENERATE_TIMEOUT_MS`). On abort/timeout mid-stream, accumulated tokens are returned as partial HTML with a trailing comment marker.

Add new row to env-var table:

| Variable | Purpose | Required by | Default |
|---|---|---|---|
| `OD_GENERATE_TIMEOUT_MS` | Server-side timeout for `od_generate_design` (milliseconds) | optional | `600000` (10 min) |

**Verify:** README still parses cleanly; mermaid block unchanged.

## T-7: Update skill `references/errors.md`

Add to the "Tool Error Shape" section, in the table of known errors:

```markdown
| Symptom | Likely cause | Fix |
|---|---|---|
| `od_generate_design` returns text ending in `<!-- Generation timed out after Nms... -->` with `isError: true` | Server-side timeout fired mid-stream. The partial HTML before the comment is real and salvageable. | Either: (1) increase `OD_GENERATE_TIMEOUT_MS` (default 600000), or (2) slice the prompt into smaller sections (hero, features, footer separately). Reuse the partial HTML via `od_save_artifact` if it's good enough. |
| `MCP error -32001: Request timed out` from `od_generate_design` (before server timeout fires) | MCP client transport timeout — client gave up waiting on the SSE stream. Server is still working; partial output is lost. | Known interaction with OpenCode (see issue link in references/byok-providers.md). Workaround: configure your client to set `resetTimeoutOnProgress` AND pass `onprogress`; or use a different client. Server-side raising `OD_GENERATE_TIMEOUT_MS` alone won't help — the client's transport timeout is what's failing. |
```

**Verify:** errors.md ≤ 200 lines (currently 132).

## T-8: Update skill `references/byok-providers.md`

In the "Streaming Behavior" section, replace timeout discussion with:

```markdown
- **Default server timeout:** 600,000 ms (10 min) — set via `OD_GENERATE_TIMEOUT_MS` env var. Default raised from 120s after #33 confirmed full-page generations legitimately take 5–10 minutes.
- **Partial-result recovery:** on server-side abort/timeout mid-stream, accumulated tokens are returned as partial HTML with a trailing `<!-- Generation timed out... -->` comment and `isError: true`. The partial output is usable; pair with `od_save_artifact` to checkpoint progress.
- **Client transport timeout (separate concern):** MCP clients have their own JSON-RPC request timeout (often 60s). If the client times out before the server does, the server's partial-recovery path doesn't help — the response never reaches the client. This is a known limitation of the OpenCode MCP integration: it sets `resetTimeoutOnProgress: true` but doesn't pass an `onprogress` callback, so the underlying TypeScript SDK never sends a `progressToken` to the server, so no progress keepalives flow. Track at [upstream sst/opencode issue (link TBD)]. Workaround: if you control the client, pass `onprogress` to `client.callTool`.
```

**Verify:** byok-providers.md ≤ 200 lines (currently 106).

## T-9: Three new tests in `src/__tests__/tools/generate-design.test.ts`

Per Oracle: build a custom ReadableStream emitting N delta blocks then `controller.error(new DOMException('signal timed out', 'TimeoutError'))`.

Test 19: `partial recovery on TimeoutError with deltas — isError true, contains 'timed out after', contains accumulated content`
Test 20: `partial recovery on AbortError (client cancel) with deltas — isError true, contains 'cancelled by client'`
Test 21: `TimeoutError with zero deltas — no partial content, mapErrorToToolResult path (OD daemon unreachable text)`

Also keep test 10 verbatim (spec-correct).

Update existing tests that call `makeGenerateDesignHandler` to pass the new `timeoutMs` arg (default `600_000` for parity with new prod default).

**Verify:** all 21 tests pass; total unit suite = 169 (was 166, +3).

## T-10: Validation ladder (clean env per HB-7)

```bash
unset OD_* BYOK_*
npm run lint
npm run typecheck
npm test
npm run build
bash scripts/vendor-check.sh
npm run test:integration
openspec validate fix-generate-design-timeout --strict --no-interactive
```

**Verify:** all 7 exit 0; unit count = 169 (+3); integration count unchanged at 24.

## T-11: Self code-review

- `OD_GENERATE_TIMEOUT_MS` default is 600_000
- `isAbortError` catches both names (DOMException AbortError + TimeoutError)
- Partial-recovery branch only fires when `accumulated.length > 0`
- Zero-delta path unchanged (falls to `mapErrorToToolResult`)
- Test 10 unmodified
- Tool description + README + skill refs all consistent on timeout numbers
- No source file outside `src/`, `README.md`, `.opencode/skills/`, `openspec/changes/` modified
- Author trailer is kokorolx, no AI attribution

## T-12: Oracle PR review

Lane:normal × bug-fix → Oracle review on PR. Provide diff + new tests + manual smoke-test note.

## T-13: Atomic commit + push as kokorolx

Single commit: `fix(generate-design): raise default timeout to 600s, env-configurable, partial-result recovery on abort (closes #33)`

## T-14: PR + CI + merge

Open PR referencing #33. Attach Oracle verdict. Wait CI green (Node 20 + 22). Squash-merge as kokorolx.

## T-15: Archive OpenSpec + push

```bash
openspec archive fix-generate-design-timeout --yes
```

Then `chore(openspec): archive fix-generate-design-timeout` + push.

## T-16: Re-sync skill to skill-manager

Since `.opencode/skills/open-design-mcp/references/{errors,byok-providers}.md` change, re-run `sync-skill-to-manager` so the published npm package reflects the new guidance. Bump skill version 0.1.0 → 0.1.1.

## T-17 (parallel, not blocking): file upstream OpenCode issue

File at sst/opencode: "MCP client doesn't pass `onprogress` → progress notifications can't extend request timeout." Link from this change's docs once filed.
