# Error Diagnosis

Every error → likely cause → fix. Derived from `src/tools/errors.ts` and `src/od-client.ts`.

## Tool Error Shape

When an MCP tool fails, you get:
```
{
  content: [{ type: "text", text: "<error message>" }],
  isError: true
}
```

The `text` field is human-readable and usually tells you the fix. The errors below explain how to translate it into a concrete action.

## HTTP 401 (Auth Failed) — Mode-Aware

The error message depends on which auth mode the MCP server inferred (`src/tools/errors.ts:11-20`):

| Auth mode | Error message | What to fix |
|---|---|---|
| `bearer` | `OD auth failed — check OD_API_TOKEN` | `OD_API_TOKEN` is wrong, expired, or empty. Get a fresh token from the daemon admin. |
| `basic` | `OD auth failed — check OD_BASIC_USER and OD_BASIC_PASS` | One or both basic-auth creds are wrong. Test them with `curl -u user:pass https://daemon/`. |
| `none` | `OD daemon returned 401 — set OD_AUTH_MODE and credentials` | The daemon requires auth but you didn't configure any. Most common on hosted OD — set `OD_AUTH_MODE=basic` + the creds. |

**Recovery flow:**
1. Read the error message — it tells you which env vars to check
2. Verify the daemon's actual auth mode (ask the user, or read deployment docs)
3. Update env vars
4. Restart the MCP server (env vars are read at startup for core config)
5. Retry with `od_list_projects` first — it's the cheapest verification

## HTTP 403 (Forbidden)

Message: `OD rejected request (SSRF protection?)`

Likely causes:
- The daemon has SSRF protections that block requests from your IP / network
- A reverse proxy / firewall is denying the request before it reaches the daemon
- The request is well-formed but the path is restricted (rare)

Fix: check daemon access logs, verify your client IP is whitelisted, check reverse proxy rules.

## HTTP 404 (Not Found)

Two contexts:

### Context 1: Tool-level 404 (project not found)

Tools like `od_get_project`, `od_update_project`, `od_delete_project` map 404 to a friendly message (`src/tools/errors.ts:47-58`): typically `Project not found: <id>`.

Fix: the project id is wrong. Use `od_list_projects` to confirm the id exists.

### Context 2: Daemon-level 404 (endpoint missing)

Generic message: `OD daemon returned 404: <statusText>`.

Causes:
- `OD_DAEMON_URL` points at something that *isn't* an OD daemon (e.g., a generic web server at the same hostname)
- The daemon version is older than this MCP expects (endpoints renamed)
- A reverse proxy is stripping path prefixes

Fix: verify `OD_DAEMON_URL` reaches a real OD daemon — `curl $OD_DAEMON_URL/api/projects` should return JSON (possibly empty list), not HTML.

## HTTP 422 (Lint Findings)

`od_lint_artifact` returns lint findings inline (not as an error), so you typically don't see 422 from it. If a 422 surfaces from another tool, the request body failed validation. Read the response text — the daemon usually includes which field is wrong.

Common 422 from `od_create_project` / `od_update_project`:
- `kind` not one of: `prototype` | `deck` | `template` | `image` | `doc` | `research` | `site`
- `fidelity` not one of: `low` | `mid` | `high`
- `name` empty or too long
- `od_update_project` called with zero mutable fields (must provide at least one of name/kind/fidelity/customInstructions/linkedDirs)

## HTTP 429 (Rate Limited)

Message: `Rate limited — retry shortly`.

Causes: BYOK provider rate limit (most common — your OpenAI/Anthropic key hit its TPM cap), or the OD daemon has its own rate limit.

Fix: wait 30–60 seconds and retry. For `od_generate_design`, consider switching to a less-loaded model temporarily.

## HTTP 5xx (Daemon Error)

Message: `OD daemon error: <statusText>`.

Causes:
- The OD daemon crashed (check its logs)
- An upstream BYOK provider returned 5xx (common — pass-through proxy surfaces it)
- The composed system prompt is malformed (very rare — would mean a vendor-sync bug)

Fix: check the daemon's logs first. If the daemon is healthy, retry — transient upstream issues are common.

## Connection Errors (Network)

Generic message: `OD daemon unreachable: <reason>`.

| `<reason>` substring | Diagnosis | Fix |
|---|---|---|
| `ECONNREFUSED` | Daemon not running at `OD_DAEMON_URL`, or wrong port | Start the daemon, or fix the URL/port |
| `ENOTFOUND` / `EAI_AGAIN` | DNS resolution failed | Typo in hostname, VPN/proxy issue, or container-network mismatch (see [environment-setup.md](environment-setup.md)) |
| `ETIMEDOUT` | Network reached the host but the daemon didn't respond in time | Daemon overloaded, or wrong host (firewall blackhole) |
| `CERT_HAS_EXPIRED` / `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | TLS cert issue on hosted OD | Cert needs renewal on the daemon side; don't disable verification |

## BYOK Lazy-Validation Errors (`od_generate_design` only)

If BYOK env vars are missing when `od_generate_design` is called:

```
BYOK not configured: missing BYOK_BASE_URL (and: BYOK_API_KEY, BYOK_MODEL)
```

Fix: set the env vars listed in the error message (see [byok-providers.md](byok-providers.md) for per-provider examples). The MCP server doesn't need to restart — BYOK is read at every `od_generate_design` call.

## Generation Timeouts / Aborts

Default server timeout: 600,000 ms (10 minutes) — configurable via `OD_GENERATE_TIMEOUT_MS`. Raised from a previous 120s after issue [#33](https://github.com/nano-step/open-design-mcp/issues/33) confirmed full-page generations legitimately exceed that.

### Symptom 1 — Server-side timeout fired

You see a tool result with `isError: true` and text ending in:

```
<!-- Generation timed out after Nms at N deltas (M chars). Output is incomplete.
     Increase OD_GENERATE_TIMEOUT_MS or slice the prompt into smaller sections. -->
```

**What happened:** the server-side `AbortSignal.timeout` fired mid-stream. The HTML *before* the comment is real and salvageable — the LLM produced those tokens before being cut off.

**Fix:**
1. Read the partial HTML — is it usable as-is? If yes, save via `od_save_artifact` with a `-partial` slug suffix.
2. If you need the full design: either raise `OD_GENERATE_TIMEOUT_MS` (default 600000), or slice the prompt into sections (hero, features, FAQ, footer) and generate each separately.
3. Don't retry the same prompt blindly — you'll hit the same timeout.

### Symptom 2 — Client-side timeout fired (no partial recovery)

You see `MCP error -32001: Request timed out` from the MCP client itself, well before the server timeout would fire. No partial output is delivered.

**What happened:** the MCP client's JSON-RPC transport timeout (often 60s) fired first. The server may still be generating, but its response never reaches you. Server-side `OD_GENERATE_TIMEOUT_MS` doesn't help here — the client gave up first.

**Known interaction** with OpenCode's MCP integration: OpenCode sets `resetTimeoutOnProgress: true` but doesn't pass an `onprogress` callback to `client.callTool`. The underlying TypeScript SDK only sends a `progressToken` to the server when `onprogress` is set, so without it, no progress notifications flow, so the client's timeout never resets. This is a client-side gap, not a server bug — the server is spec-correct in refusing to emit unsolicited progress.

**Fix (client-side):**
- If you control the MCP client: pass `onprogress` AND `resetTimeoutOnProgress: true` to `client.callTool`.
- If you're using OpenCode: slice the prompt into chunks small enough to finish within the client's default timeout (~60s ≈ a single hero section).
- Track at the upstream OpenCode issue (link TBD once filed).

### Symptom 3 — User canceled

Tool result has `isError: true` and trailing `<!-- Generation cancelled by client at N deltas... -->`. Expected behavior; the partial HTML is real.

## Debugging Checklist

When stuck, run these in order:

1. `od_list_projects` (no args) — does the daemon respond at all?
2. If 401 → check auth mode + creds per the table above
3. If `ECONNREFUSED` → `OD_DAEMON_URL` is wrong for your network. See [environment-setup.md § Common Deployment Recipes](environment-setup.md#common-deployment-recipes).
4. If 404 from `od_list_projects` → `OD_DAEMON_URL` points at not-an-OD-daemon
5. If `od_list_projects` works but `od_generate_design` fails → it's BYOK. Check `BYOK_*` env vars per [byok-providers.md](byok-providers.md).
