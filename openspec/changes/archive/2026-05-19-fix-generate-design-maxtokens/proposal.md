# Proposal: fix-generate-design-maxtokens

**Lane × Change Type:** `lane:normal × change-type:bug-fix`
**Risk Flags:** 1 (touches the production write-path of `od_generate_design`, affects every BYOK call)
**Issue:** [#36](https://github.com/nano-step/open-design-mcp/issues/36) (with [#44](https://github.com/nano-step/open-design-mcp/issues/44) closed as duplicate)

## Why

`od_generate_design` silently truncates output at ~21KB (~8192 tokens). Confirmed in the v1 ships dogfood (`docs/evidence/v1-ships-dogfood/report.md` Signal 5 evidence: 21,484-byte output, cut mid-hero, no `</body>`/`</html>` tags). #36's root-cause analysis already nailed it:

- Upstream OD daemon (`nexu-io/open-design`) defines `ProxyStreamRequest.maxTokens?: number` in its contract.
- Daemon comment: "Defaults to 8192 when unset so pre-existing clients keep their old behavior."
- Our local `ProxyStreamRequest` interface in `src/od-client.ts:35` OMITS the field entirely.
- The MCP tool's `proxyReq` literal in `src/tools/generate-design.ts:~135` never sets it.
- → Daemon falls back to 8192 → output truncates → MCP tool reports success because the SSE stream ends cleanly.

This is the single biggest UX bug remaining: every full-page generation produces a half-built artifact and the tool happily returns `isError: undefined`. The `od-workflow` skill teaches multi-section pages — they can't work today.

## What changes

Three coordinated changes:

1. **`src/od-client.ts`** — add `maxTokens?: number` to the local `ProxyStreamRequest` interface (matches the upstream daemon contract verbatim). No serialization change needed: `body: JSON.stringify(req)` already forwards every field.

2. **`src/tools/generate-design.ts`** — add an optional `maxTokens` input to the tool's zod schema (range `[1, 200000]`, default `64000` chosen to be generous for full landing pages without being abusive). Pass it through to the `proxyReq`. Update tool description to document the field.

3. **Tests** — add unit tests covering: maxTokens passed → field in proxyReq; maxTokens omitted → still works (defaults applied); zod range validation (negative/zero rejected, > 200000 rejected). Add an integration test that asserts the proxy body contains the maxTokens field when supplied.

After this lands: full-page generations should reach completion. The dogfood's `lithe` landing page that produced 21KB before should produce a properly-closed HTML document.

## Risk

- **Medium.** Touches the production call path. But the change is purely additive — clients that don't pass `maxTokens` get exactly today's behavior (daemon default of 8192 applied). Only callers that opt in see the new behavior.
- BYOK provider behavior: `maxTokens` is a standard OpenAI-compatible field. The proxy forwards it to the upstream provider verbatim. We're not inventing semantics.
- **Default of 64000**: chosen as 8× the current cap. Most BYOK providers (`claude-sonnet-4-6` = 64K output) support this. If a model has a lower cap, the provider returns its own cap or rejects — the existing error path handles this.

## Why not

- **Why not require maxTokens?** Backward-compat. Callers shouldn't have to know about token caps for short generations.
- **Why not default to provider max?** Provider max varies; "200000" would be wrong for many models. 64000 is a safe upper-middle.
- **Why not auto-detect provider max?** Requires a provider catalog and lookups. Out of scope for a bug fix.
- **Why not change the default to `undefined` and let the daemon decide?** That's what we do TODAY and it produces the bug. The daemon's default IS the bug.
- **Why not 200000 default?** Risk of accidentally burning provider quota on prompts that should be small. 64000 is "enough for most full pages" without being a footgun.

## Out of scope

- Two-pass / continuation generation (separate future change if a single 64K cap still truncates extremely large pages)
- Detecting truncation in the SSE stream and surfacing `isError: true` when output ends mid-tag (separate, cosmetic improvement)
- Provider-specific token budget catalog
- Changing the daemon's default (out of our control)

## Acceptance criteria

- [ ] `ProxyStreamRequest` interface in `src/od-client.ts` includes `maxTokens?: number`
- [ ] `od_generate_design` zod schema accepts `maxTokens?: number` with range `[1, 200000]` and default `64000`
- [ ] When caller passes `maxTokens: N`, daemon receives `N` in the POST body
- [ ] When caller omits `maxTokens`, daemon receives `64000`
- [ ] All existing tests still pass (the new default replaces the daemon's old 8192 implicit default — none of our existing tests assert on the value)
- [ ] 4 new unit tests cover: field forwarded, default applied, range validation, schema validates
- [ ] 1 new integration test asserts the proxy body contains `maxTokens` when set
- [ ] Tool description updated to document the field
- [ ] README updated to mention the new input
- [ ] Validation ladder green: lint, typecheck, unit ≥199 (+4), build, vendor-check, integration ≥27 (+1), openspec --strict
- [ ] Oracle review (lane:normal × bug-fix × 1 risk flag)
- [ ] Re-dogfood after merge: re-run the v1 ships landing-page brief, assert the response includes `</html>` (proves the page completed)
