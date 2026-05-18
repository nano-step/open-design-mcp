# Environment Setup

Complete env-var matrix, auth-mode auto-inference logic, and validation order. Source-of-truth: `src/config.ts`.

## Variable Reference

| Variable | Used by | Required? | Default |
|---|---|---|---|
| `OD_DAEMON_URL` | every tool | **yes** — validated eagerly at server start (`src/config.ts:4`) | none |
| `OD_API_TOKEN` | bearer-mode auth | only when `OD_AUTH_MODE=bearer` | `""` |
| `OD_AUTH_MODE` | auth selection | optional — inferred if unset | inferred |
| `OD_BASIC_USER` | basic-mode auth | only when `OD_AUTH_MODE=basic` | none |
| `OD_BASIC_PASS` | basic-mode auth | only when `OD_AUTH_MODE=basic` | none |
| `BYOK_BASE_URL` | `od_generate_design` only | **yes for generation** — validated lazily (`src/config.ts:19`, `150`) | none |
| `BYOK_API_KEY` | `od_generate_design` only | **yes for generation** — non-empty string | none |
| `BYOK_MODEL` | `od_generate_design` only | **yes for generation** — non-empty string | none |
| `BYOK_PROVIDER` | `od_generate_design` only | optional | `"openai"` |

## Validation Order — Why It Matters

Validation happens in two phases (`src/config.ts:107–151`):

1. **At server startup (eager)** — `loadCoreConfig()` runs once. If `OD_DAEMON_URL` is missing or malformed, the process exits with a clear stderr message *before any tool can be called*. This is intentional: a misconfigured daemon URL would cause every tool to fail in identical ways, so failing fast is friendlier.
2. **Inside `od_generate_design` (lazy)** — `getByokConfig()` runs only when the user calls that tool. Missing BYOK vars surface as a tool-level error (`isError: true`, "BYOK not configured: missing ...") — never as a server crash.

**Implication for the LLM driving the MCP:** The user can explore via `od_list_projects` / `od_get_project` *before* they've set up BYOK. If the user says "I just want to look around", don't ask for `BYOK_API_KEY` yet.

## Auth-Mode Inference

`OD_AUTH_MODE` is optional. If unset, `resolveAuth()` (`src/config.ts:32-76`) infers from which credentials you've set:

| `OD_API_TOKEN` set? | `OD_BASIC_USER` + `OD_BASIC_PASS` set? | Inferred mode |
|---|---|---|
| no | no | `none` (no auth header sent) |
| yes | no | `bearer` |
| no | yes | `basic` |
| yes | yes | **error** — set `OD_AUTH_MODE` explicitly to disambiguate |

If you explicitly set `OD_AUTH_MODE`, the matching credentials become required:
- `OD_AUTH_MODE=bearer` → `OD_API_TOKEN` must be non-empty (else startup error)
- `OD_AUTH_MODE=basic` → both `OD_BASIC_USER` and `OD_BASIC_PASS` must be non-empty (else startup error)
- `OD_AUTH_MODE=none` → no creds needed; any set creds are ignored

## Embedded Credentials Are Rejected

`https://user:pass@host/` style URLs are rejected at startup (`src/config.ts:86-92`). Use `OD_BASIC_USER` / `OD_BASIC_PASS` instead. This is to prevent credentials leaking into logs, error messages, or proxy chains.

## Common Deployment Recipes

### Recipe 1 — Local Docker OD (most common, no auth)

The Docker image typically binds to `127.0.0.1:7456` with no auth:

```bash
export OD_DAEMON_URL="http://localhost:7456"
# That's all. Mode is inferred as 'none'.
```

If the MCP server runs **inside** a Docker container while OD runs on the host:
```bash
export OD_DAEMON_URL="http://host.docker.internal:7456"   # macOS / Windows Docker Desktop
# or
export OD_DAEMON_URL="http://172.17.0.1:7456"             # Linux bridge gateway
```

If both run on a shared Docker network (e.g. `ai-sandbox`):
```bash
export OD_DAEMON_URL="http://ai-open-design:7456"
```

### Recipe 2 — Self-hosted OD with bearer token

```bash
export OD_DAEMON_URL="https://od.internal.example.com"
export OD_API_TOKEN="secret-token-string"
# Mode auto-infers to 'bearer'.
```

### Recipe 3 — Hosted OD behind nginx basic auth

This is how the publicly-hosted instance at `https://od.thnkandgrow.com/` is configured.

```bash
export OD_DAEMON_URL="https://od.thnkandgrow.com/"
export OD_AUTH_MODE="basic"
export OD_BASIC_USER="<username>"
export OD_BASIC_PASS="<password>"
```

**Note:** Always set `OD_AUTH_MODE=basic` explicitly for hosted deployments. Auto-inference works, but being explicit makes the error message clearer if creds are missing.

## Smoke Test

After setting env vars, the fastest verification is:

```
Call od_list_projects with no args.
```

| Response | Diagnosis |
|---|---|
| `{ projects: [...] }` (even empty array) | ✅ Daemon connection + auth both work |
| HTTP 401 | Auth mode / credentials wrong — see [errors.md](errors.md) |
| HTTP 403 | Reverse proxy denying request (whitelist? rate limit?) |
| `ECONNREFUSED` | Daemon isn't running at `OD_DAEMON_URL`, or the URL is wrong for the network you're in |
| `ENOTFOUND` / `EAI_AGAIN` | DNS resolution failed — typo in hostname or VPN/proxy issue |

## How the MCP Sends the Auth Header

| Mode | Header sent on every request |
|---|---|
| `none` | (none) |
| `bearer` | `Authorization: Bearer <OD_API_TOKEN>` |
| `basic` | `Authorization: Basic <base64(OD_BASIC_USER:OD_BASIC_PASS)>` |

Set in `src/od-client.ts` constructor. The same header rides on every HTTP call to the daemon, including the proxy path used by `od_generate_design`.
