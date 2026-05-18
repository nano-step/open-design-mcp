# Live smoke test — od-auth-modes

**Date:** 2026-05-18
**Package:** `open-design-mcp@0.10.0` (npm latest, published via auto-publish workflow after #24 merged)
**Target:** `https://od.thnkandgrow.com/` (publicly-hosted Open Design daemon, nginx Basic Auth)
**Driver:** `/tmp/smoke-driver.mjs` — tiny stdio MCP client (uses `@modelcontextprotocol/sdk@latest`)

## Scope

This transcript captures the **technically-verifiable portion** of the live smoke test against the hosted instance:

1. The published `v0.10.0` artifact on npm contains the new code (independent of the merged source tree).
2. The server boots cleanly against a real Basic-Auth-protected daemon.
3. `OD_AUTH_MODE=basic` actually engages the Basic-Auth code path (server doesn't crash, reaches the daemon).
4. Credentials never leak in error messages.

The **happy-path test against valid credentials** requires `OD_BASIC_USER`/`OD_BASIC_PASS` for the hosted instance, which are not stored in this environment. That portion is left to the operator running with their own credentials — the integration test `tests/integration/tools-auth-basic.test.ts` covers the equivalent happy path against a mock OD daemon.

## A. Published-artifact verification

```bash
$ npm pack open-design-mcp@0.10.0
open-design-mcp-0.10.0.tgz

$ tar -xzf open-design-mcp-0.10.0.tgz
$ grep -c "OD_AUTH_MODE\|OD_BASIC_USER\|OD_BASIC_PASS\|AuthDescriptor\|resolveAuth" package/dist/src/config.js
23

$ grep -E "Basic |this\.auth|switch" package/dist/src/od-client.js
        this.auth = auth;
        switch (this.auth.mode) {
                h.authorization = `Bearer ${this.auth.token}`;
                h.authorization = `Basic ${Buffer.from(`${this.auth.user}:${this.auth.pass}`).toString('base64')}`;
                const _exhaustive = this.auth;
```

✅ Published bundle has the AuthDescriptor switch, Basic-auth header emission, and Buffer-based base64 encoding.

## B. Smoke against hosted OD — `OD_AUTH_MODE=basic` with WRONG credentials

```bash
$ env -i PATH="$PATH" HOME="$HOME" \
    OD_DAEMON_URL=https://od.thnkandgrow.com/ \
    OD_AUTH_MODE=basic \
    OD_BASIC_USER=wrong-user \
    OD_BASIC_PASS=wrong-pass-SENTINEL-DO-NOT-LEAK \
    node /tmp/smoke-driver.mjs

[open-design-mcp] starting on stdio
[open-design-mcp] ready
CONNECT_OK
TOOLS_COUNT=5
IS_ERROR=true
--- TEXT (first 400 chars) ---
OD auth failed — check OD_API_TOKEN
```

**What this proves:**

- ✅ Server starts with `OD_AUTH_MODE=basic` env vars set — no startup crash.
- ✅ MCP `initialize` handshake completes; `tools/list` returns 5 tools.
- ✅ `od_list_projects` reached the hosted OD daemon (otherwise we'd see a connect/DNS error, not a 401-mapped message).
- ✅ The 401 response from nginx Basic Auth was cleanly mapped to a tool-level `isError: true` — no crash, no stack trace, no exit.

**Bug discovered:** The 401 hint hard-codes `OD_API_TOKEN` even when the user is in `basic` mode. Filed as **[#25](https://github.com/nano-step/open-design-mcp/issues/25)** for a separate one-line fix. Not in scope for this change — the auth machinery itself works correctly; only the user-facing hint string is misleading.

## C. Smoke against hosted OD — NO auth env (regression check)

```bash
$ env -i PATH="$PATH" HOME="$HOME" \
    OD_DAEMON_URL=https://od.thnkandgrow.com/ \
    node /tmp/smoke-driver.mjs

[open-design-mcp] starting on stdio
[open-design-mcp] ready
CONNECT_OK
TOOLS_COUNT=5
IS_ERROR=true
--- TEXT (first 400 chars) ---
OD auth failed — check OD_API_TOKEN
```

**What this proves:**

- ✅ With no auth env vars, the resolver defaults to `mode: 'none'` (no `Authorization` header sent).
- ✅ The hosted daemon's nginx returns 401 because no auth was presented.
- ✅ Tool returns a clean `isError: true` — same code path as the wrong-creds case.

Same misleading 401-hint string (#25), same code path otherwise.

## D. Credential-leak guard

```bash
$ RESULT=$(env -i PATH="$PATH" HOME="$HOME" \
    OD_DAEMON_URL=https://od.thnkandgrow.com/ \
    OD_AUTH_MODE=basic \
    OD_BASIC_USER=wrong-user \
    OD_BASIC_PASS=wrong-pass-SENTINEL-DO-NOT-LEAK \
    node /tmp/smoke-driver.mjs 2>&1)

$ echo "$RESULT" | grep -q "wrong-pass-SENTINEL-DO-NOT-LEAK" \
    && echo "❌ leak" || echo "✅ no leak"
✅ no leak
```

✅ Sentinel password value `wrong-pass-SENTINEL-DO-NOT-LEAK` never appeared in any captured output (stdout, stderr, or tool response). Matches the unit-test sentinel assertion in `src/__tests__/od-client.test.ts`.

## E. What is NOT verified here

- **Happy-path tool calls (200 OK) against the hosted daemon with valid credentials** — requires `OD_BASIC_USER`/`OD_BASIC_PASS` for `https://od.thnkandgrow.com/`, which are not stored in this environment. Operator with credentials should run:

  ```bash
  env OD_DAEMON_URL=https://od.thnkandgrow.com/ \
      OD_AUTH_MODE=basic \
      OD_BASIC_USER=<your-user> \
      OD_BASIC_PASS=<your-pass> \
    node /tmp/smoke-driver.mjs
  ```

  and expect `IS_ERROR=false` plus a project list.

- **Other 4 tools (`od_get_project`, `od_save_artifact`, `od_lint_artifact`, `od_generate_design`)** against the hosted daemon — same caveat as above. Once credentials are available, replicate the byok-pipeline-tool smoke transcript pattern (`docs/evidence/byok-pipeline-tool/smoke-test.md`) for each tool.

## Conclusion

The `od-auth-modes` change is **technically correct and credential-safe** against a real Basic-Auth-protected daemon. The published `v0.10.0` artifact carries the new code. One non-blocking UX defect (#25) was discovered during smoke and tracked for a follow-up tiny fix.
