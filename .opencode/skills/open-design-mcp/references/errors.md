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

Default timeout: 120,000 ms (2 minutes). If `od_generate_design` aborts:

- The user canceled the call → expected, no action needed
- The 2-minute window was exceeded → the model is too slow for the prompt complexity. Switch to a faster model or reduce prompt size. For very large designs (`kind: "deck"`, `kind: "site"`), this is the most common failure.
- The daemon's stream hung mid-way → check daemon logs for upstream errors; often a BYOK provider issue

## Debugging Checklist

When stuck, run these in order:

1. `od_list_projects` (no args) — does the daemon respond at all?
2. If 401 → check auth mode + creds per the table above
3. If `ECONNREFUSED` → `OD_DAEMON_URL` is wrong for your network. See [environment-setup.md § Common Deployment Recipes](environment-setup.md#common-deployment-recipes).
4. If 404 from `od_list_projects` → `OD_DAEMON_URL` points at not-an-OD-daemon
5. If `od_list_projects` works but `od_generate_design` fails → it's BYOK. Check `BYOK_*` env vars per [byok-providers.md](byok-providers.md).
