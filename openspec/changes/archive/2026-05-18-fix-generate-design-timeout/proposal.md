# Proposal: fix-generate-design-timeout

**Lane × Change Type:** `lane:normal × change-type:bug-fix`
**Risk Flags:** 2 (changes default behavior of the streaming tool; new env var on critical path)
**Issue:** [#33](https://github.com/nano-step/open-design-mcp/issues/33)

## Why

`od_generate_design` consistently fails with `MCP error -32001: Request timed out` on non-trivial prompts (e.g. complete landing page). A real user repro is documented in #33: ~2 KB Vietnamese-language landing-page brief through Sonnet 4.6 at `https://ai-proxy.thnkandgrow.com/v1` aborts at ~60s with no partial output, no progress, no recovery path.

Two distinct issues stack:

1. **Server-side `DEFAULT_TIMEOUT_MS = 120_000`** is too low for full-page generations (Sonnet at 30–80 tok/s on 15–30k output tokens → 5–10+ minutes). Hard-coded, not configurable.
2. **Silent data loss on abort.** On AbortError mid-stream, the handler discards all accumulated deltas. Users pay BYOK quota for tokens they never see.

The issue also suggests "always emit progress notifications," but research against [MCP spec §Progress](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress.md) shows that's a spec violation: progress notifications MUST only reference tokens the client provided in `_meta.progressToken`. The TypeScript SDK's `Protocol._onprogress` (typescript-sdk `packages/core/src/shared/protocol.ts:693`) error-logs and discards progress with unknown tokens. The real keepalive gap lives in OpenCode's MCP integration (it sets `resetTimeoutOnProgress: true` but never passes `onprogress` callback, so the SDK never emits a `progressToken` to the server, so the server correctly emits nothing). That's an upstream fix in OpenCode, not here.

## What Changes

### F1 — Configurable timeout

Add `OD_GENERATE_TIMEOUT_MS` to `coreEnvSchema` with default `600_000` (10 min). Validated eagerly at startup via Zod (`.coerce.number().int().positive().default(600_000)`). Per Oracle review: thread the parsed value into `makeGenerateDesignHandler` as a constructor parameter (same DI pattern as `loadByok`), not via `process.env` inside the handler.

### F2 — Partial-result recovery on Abort/Timeout

Replace the existing catch-all in `src/tools/generate-design.ts:164-167`:

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

`isError: true` is preserved per Oracle ("a partial result is a failed tool invocation — the model didn't get what it asked for"). The HTML comment is a clean side-channel for the calling agent to recognize the truncation without parsing free-form text.

Helper: `isAbortError(err)` catches BOTH `DOMException name='AbortError'` AND `name='TimeoutError'` (per Oracle decision 5).

### F3 — Tool description + README

- Tool description: replace current sentence with one that warns about long prompts and points to `OD_GENERATE_TIMEOUT_MS`.
- README "How it works": replace "Typical end-to-end: 10–60 seconds" with realistic ranges + env var pointer.

### F4 — Skill documentation

Update the `open-design-mcp` skill (added in PR #34) — `references/errors.md` adds a "Generation timed out" row; `references/byok-providers.md` adds a "Timeout tuning" section. Frame the OpenCode client-side gap as a "known interaction with MCP client transport timeouts," not "our bug." Link to the upstream OpenCode issue once filed.

### F5 — Tests

Three new tests in `src/__tests__/tools/generate-design.test.ts`:

- N+1: `partial recovery on TimeoutError with deltas — isError true + HTML comment + accumulated content`
- N+2: `partial recovery on AbortError (client cancel) with deltas — isError true + 'cancelled by client' message`
- N+3: `TimeoutError with zero deltas — falls through to mapErrorToToolResult (no partial content)`

Per Oracle: use a custom ReadableStream that enqueues N SSE delta blocks then `controller.error(new DOMException('signal timed out', 'TimeoutError'))`. No fake timers needed.

Existing test 10 (`progress notification NOT fired when progressToken absent`) is KEPT — it asserts spec-correct behavior, contrary to what the bug report suggests.

### F6 — Out of scope (deferred to follow-up issues)

- Async job pattern (`od_generate_design_start` + `_poll`) — issue's suggestion 5
- Incremental artifact emission — issue's suggestion 7
- Daemon-side persistence of partial output — needs upstream OD daemon work
- SSE error event partial recovery — Oracle nit, separate change
- Filing upstream issue at sst/opencode for the `onprogress` gap — done in parallel, not a code change here

## Risk

**Normal lane (2 risk flags):**

1. **Changes default timeout from 120s to 600s.** Existing deployments relying on the 120s cap (none documented, but theoretically possible) would see longer-running tool calls. Mitigation: env-configurable, can be set back to 120000.
2. **New env var on critical path.** Parsing failure would crash startup with a clear stderr message (same eager-fail pattern as `OD_DAEMON_URL`). Default value means existing deployments with `OD_GENERATE_TIMEOUT_MS` unset behave identically to the new default.

No vendored code touched, no API surface change, no security implications.

## Acceptance Criteria

- [ ] `OD_GENERATE_TIMEOUT_MS` validated at startup; default 600000; honored at runtime
- [ ] `isAbortError` helper catches both `AbortError` and `TimeoutError`
- [ ] On Abort/Timeout mid-stream with ≥1 delta: return partial content + `isError: true` + HTML comment distinguishing timeout vs cancel
- [ ] On Abort/Timeout with 0 deltas: falls through to existing error path (`mapErrorToToolResult`)
- [ ] Tool description mentions long-prompt warning + env var
- [ ] README "How it works" updated with realistic ranges
- [ ] `.opencode/skills/open-design-mcp/references/{errors,byok-providers}.md` updated
- [ ] All 166 existing unit tests pass; 3 new tests added (total 169)
- [ ] Test 10 still passes (spec-correct behavior, not the bug claimed)
- [ ] Oracle review: PASS
- [ ] Validation ladder: clean env, all 7 steps exit 0
