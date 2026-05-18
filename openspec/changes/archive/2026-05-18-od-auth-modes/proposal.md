# Proposal: od-auth-modes

**Lane × Change Type:** `lane:normal × change-type:user-feature`
**Risk Flags:** 2 (env-var contract, credential-handling)
**Issue:** [#23](https://github.com/nano-step/open-design-mcp/issues/23)
**Closes:** HB-6 in `docs/HARNESS_BACKLOG.md`

## Why

`open-design-mcp@0.9.0` only knows two auth modes:

- No header (when `OD_API_TOKEN` is empty — the current default)
- `Authorization: Bearer <OD_API_TOKEN>` (when `OD_API_TOKEN` is set)

This works for the local Docker daemon (loopback / shared network, no auth needed) but **fails against the publicly-hosted Open Design instance** at `https://od.thnkandgrow.com/`, which is fronted by nginx HTTP Basic Auth:

```
$ curl -i https://od.thnkandgrow.com/api/projects
HTTP/2 401
www-authenticate: Basic realm="OpenDesign"
```

Every MCP tool call from `open-design-mcp` hits 401 against the hosted daemon. There is no workaround:

- Embedding `https://user:pass@host/` in `OD_DAEMON_URL` is fragile across `fetch` implementations and leaks credentials into log lines and error messages.
- `OD_API_TOKEN` emits the wrong header scheme (`Bearer`, not `Basic`).

This is the **first deployment mode (hosted, internet-exposed)** the project supports beyond local Docker. Without this change, users cannot connect `open-design-mcp` to any non-loopback OD daemon protected by HTTP Basic Auth — a common reverse-proxy pattern.

## What Changes

### New env vars (additive, all optional)

| Env var | Purpose | Required when |
|---|---|---|
| `OD_AUTH_MODE` | One of `none` / `bearer` / `basic` | optional; auto-derived if unset (see Default behavior) |
| `OD_BASIC_USER` | Basic-auth username | `OD_AUTH_MODE=basic` |
| `OD_BASIC_PASS` | Basic-auth password | `OD_AUTH_MODE=basic` |

### Default behavior (zero-config compatibility)

When `OD_AUTH_MODE` is not set:

- `OD_API_TOKEN` is non-empty → infer `bearer` (existing behavior)
- `OD_API_TOKEN` is empty/unset → infer `none` (existing behavior)

Existing deployments using only `OD_API_TOKEN` continue to work unchanged.

### Auth header logic in `OdClient.headers()`

| Resolved mode | Authorization header emitted |
|---|---|
| `none` | _(no Authorization header)_ |
| `bearer` | `Bearer <OD_API_TOKEN>` |
| `basic` | `Basic <base64(OD_BASIC_USER:OD_BASIC_PASS)>` |

### Startup validation (fail-fast)

`parseCore()` rejects with a friendly stderr message and `process.exit(1)` when:

1. `OD_AUTH_MODE=basic` but `OD_BASIC_USER` or `OD_BASIC_PASS` is missing/empty.
2. `OD_AUTH_MODE=bearer` but `OD_API_TOKEN` is missing/empty.
3. `OD_AUTH_MODE` is set to anything other than `none` / `bearer` / `basic`.
4. `OD_DAEMON_URL` contains embedded credentials (`https://user:pass@host/`). Error message points the user at `OD_BASIC_USER`/`OD_BASIC_PASS` instead.

### Credential safety

- `OD_BASIC_PASS` is never echoed to logs, errors, or stderr — even truncated.
- The `Authorization` header is never logged by `OdClient` (existing design §B14 invariant — extended in tests to cover the new `Basic` path).
- Error messages from `OdHttpError` continue to redact request headers.

### Files changed

- `src/config.ts` — extend `coreEnvSchema` with the three new vars + cross-field validation
- `src/od-client.ts` — extend constructor to accept an auth descriptor; rewrite `headers()` to switch on mode
- `src/server.ts` — pass the resolved auth descriptor from `coreConfig` to `new OdClient(...)`
- `src/__tests__/config.test.ts` — 9 new cases (3 modes × {happy, missing-deps, malformed})
- `src/__tests__/od-client.test.ts` — 3 new cases for `headers()` shape across modes
- `tests/integration/tools-auth-basic.test.ts` — NEW integration test confirming Basic header reaches the mock daemon
- `README.md` — env-var table updated + hosted deployment example
- `docs/HARNESS_BACKLOG.md` — flip HB-6 status from `proposed` to `implemented`
- `docs/evidence/od-auth-modes/` — NEW evidence directory with smoke + validation transcripts

## Out of scope

- mTLS / OAuth / signed-request auth (separate future change)
- Per-request auth override (single config at startup)
- Credential persistence to disk or OS keychain (env-var only)
- Rate-limit / retry behavior for 401 responses (orthogonal — handled by existing error-mapping)
- Automatic `Authorization` header refresh / rotation (env-var captured once at startup)

## Risk

**normal.** Additive only — existing bearer-token and zero-auth flows are unchanged when `OD_AUTH_MODE` is left at its default. Credential handling stays in one file (`src/od-client.ts`). The change touches design §B7 (auth) and §B14 (logging) but introduces no architectural shift.

Two specific risks tracked:

1. **Credential leakage** — mitigated by tests that grep `OdHttpError` snippets and stderr captures for `OD_BASIC_PASS` value.
2. **Behavior change for users with `OD_API_TOKEN` set** — explicitly defended by the default-inference rule (token set → `bearer`); a regression test confirms an unchanged `OD_API_TOKEN`-only config still emits `Bearer` headers.
