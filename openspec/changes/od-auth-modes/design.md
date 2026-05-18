# Design: od-auth-modes

## A. Context

`open-design-mcp` is a stdio MCP server that talks to an Open Design (OD) HTTP daemon. Today it supports two transport-auth shapes:

- No `Authorization` header (loopback / shared Docker network).
- `Authorization: Bearer <OD_API_TOKEN>` (set by `OD_API_TOKEN` env var).

The hosted instance at `https://od.thnkandgrow.com/` sits behind nginx HTTP Basic Auth. The daemon itself doesn't enforce Basic Auth (its source has no Basic Auth middleware — only origin-validation for loopback), but the reverse proxy in front does. From the MCP server's point of view, it just sees a 401 with `WWW-Authenticate: Basic realm="OpenDesign"` until it presents `Authorization: Basic <base64(user:pass)>`.

The byok-pipeline-tool design (§B7) only modeled bearer tokens. HB-6 captured the gap. This change closes it.

## B. Design Decisions

### B1. Env-var contract (additive)

Three new optional vars added to the core schema:

```ts
OD_AUTH_MODE  ?: 'none' | 'bearer' | 'basic'
OD_BASIC_USER ?: string
OD_BASIC_PASS ?: string
```

**Why additive (not replacing `OD_API_TOKEN`):**

- Existing users have `OD_API_TOKEN=…` configured. Forcing them to set `OD_AUTH_MODE=bearer` too would be a breaking change.
- The auth mode is naturally inferrable from which credential vars are set. The explicit `OD_AUTH_MODE` env var is the override / disambiguator.

### B2. Default mode resolution

When `OD_AUTH_MODE` is unset, infer from sibling vars:

| `OD_API_TOKEN` | `OD_BASIC_USER`+`OD_BASIC_PASS` | Inferred mode |
|---|---|---|
| set (non-empty) | unset | `bearer` |
| unset | set (both non-empty) | `basic` |
| unset | unset | `none` |
| set | set | **error** — ambiguous; require explicit `OD_AUTH_MODE` |

The ambiguous case fails fast at startup with a friendly message:

> Both `OD_API_TOKEN` and `OD_BASIC_USER`/`OD_BASIC_PASS` are set. Set `OD_AUTH_MODE=bearer` or `OD_AUTH_MODE=basic` to disambiguate.

### B3. Explicit-mode validation

When `OD_AUTH_MODE` is set explicitly, the resolver enforces that the matching credentials are present:

| Mode | Required vars | Error if missing |
|---|---|---|
| `none` | (none) | — |
| `bearer` | `OD_API_TOKEN` non-empty | `OD_AUTH_MODE=bearer requires OD_API_TOKEN to be set` |
| `basic` | `OD_BASIC_USER` non-empty AND `OD_BASIC_PASS` non-empty | `OD_AUTH_MODE=basic requires OD_BASIC_USER and OD_BASIC_PASS to be set` |

Validation errors trigger the existing `loadCoreOrExit()` path — stderr message + `process.exit(1)`. Never throws past server bootstrap.

### B4. Embedded-credentials rejection

`OD_DAEMON_URL` containing `user:pass@` is rejected at startup. Rationale:

- Most `fetch` polyfills strip URL credentials inconsistently.
- The URL ends up in error messages and log lines — credential leak.
- We have a clean alternative (the `OD_BASIC_*` vars), so there is no reason to support the URL-embedded form.

Implementation: after Zod URL validation, parse the URL and reject if `url.username` or `url.password` is non-empty.

### B5. AuthDescriptor (the typed representation)

Instead of passing raw env vars to `OdClient`, `parseCore()` resolves them into a discriminated union:

```ts
type AuthDescriptor =
  | { mode: 'none' }
  | { mode: 'bearer'; token: string }
  | { mode: 'basic'; user: string; pass: string };
```

`OdClient` constructor takes this descriptor (replacing the current `token: string` parameter). The header-encoding logic becomes a pure switch:

```ts
private headers(extra = {}): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json', ...extra };
  switch (this.auth.mode) {
    case 'none':   break;
    case 'bearer': h.authorization = `Bearer ${this.auth.token}`; break;
    case 'basic':  h.authorization = `Basic ${Buffer.from(`${this.auth.user}:${this.auth.pass}`).toString('base64')}`; break;
  }
  return h;
}
```

**Why a discriminated union (not 3 optional fields):**

- Exhaustiveness check at compile time — adding a new mode (e.g. `oauth`) later will surface every place that switches on it.
- Impossible states are unrepresentable: you can't have `mode: 'basic'` without `user` and `pass`.

### B6. Credential safety in error paths

The existing `OdClient.readSnippet()` truncates response bodies for `OdHttpError`. We extend the test suite to verify:

1. `OdHttpError.message` never contains the literal `OD_BASIC_PASS` value (test injects a sentinel password and greps the captured error).
2. `OdHttpError.bodySnippet` never contains the literal password.
3. `console.warn`/`console.error` calls (captured via a spy) never contain the password.
4. The `Authorization` header is never logged (existing §B14 invariant — explicit new test against the Basic header).

### B7. Logging discipline (§B14 extension)

The existing logging-discipline requirement forbids logging `Authorization` headers or API keys. This change adds:

> No code path SHALL log `OD_BASIC_PASS` or any encoded `Basic <…>` header value to stdout, stderr, or any captured log sink.

Enforcement is via test fixtures (`tests/integration/no-leak.test.ts`) that spawn the server with a sentinel password, exercise every tool, and assert the sentinel never appears in captured stderr.

### B8. Backward compatibility

| Existing config | Resolves to | Behavior |
|---|---|---|
| `OD_DAEMON_URL=…` only (no other auth vars) | `mode: 'none'` | No `Authorization` header — unchanged |
| `OD_DAEMON_URL=…` + `OD_API_TOKEN=t` | `mode: 'bearer'` | `Authorization: Bearer t` — unchanged |
| `OD_DAEMON_URL=…` + `OD_API_TOKEN=t` + `OD_AUTH_MODE=bearer` | `mode: 'bearer'` | Same as above |

No user with an existing config sees behavior change. Regression test (`config.test.ts`) explicitly covers each row.

### B9. Testing strategy

| Layer | New tests | Why |
|---|---|---|
| Unit: `config.test.ts` | 9 new cases | Default inference (3) + explicit mode (3 × 2 outcomes = 6 → dedup → 6 happy + 3 error) |
| Unit: `od-client.test.ts` | 3 new cases | Header shape for each mode |
| Unit: `od-client.test.ts` | 1 new case | Embedded credential rejection |
| Integration: `tools-auth-basic.test.ts` | 1 new test | Tool call against mock OD with `OD_AUTH_MODE=basic` confirms `Authorization: Basic <…>` header arrives |
| Integration: existing tests | Regression check | All 22 existing integration tests still pass (default mode unchanged) |
| Live smoke | Manual transcript | One `od_list_projects` call against `https://od.thnkandgrow.com/` documented in `docs/evidence/od-auth-modes/smoke-test.md` |

### B10. PR slicing

This is a **lane:normal** change. Per HARNESS.md §Validation Ladder + §Change Types, normal-lane user-feature work requires single Oracle review (not full review-work skill). A single PR is appropriate — slicing further would add overhead without reducing risk.

**One PR:**

1. config.ts changes + tests
2. od-client.ts changes + tests
3. server.ts wire-through
4. integration test
5. README + evidence + HARNESS_BACKLOG flip

### B11. Out-of-scope and follow-ups

- **OAuth / OIDC** — separate change, distinct env-var surface.
- **mTLS** — different transport configuration; not an `Authorization`-header concern.
- **Credential rotation** — env vars are captured once at startup; rotation requires a restart. This matches the existing `OD_API_TOKEN` model.
- **Hosted-OD smoke automation** — manual transcript only in this change; automated smoke against hosted instance can come in a separate infrastructure change (would need stored test credentials).

## C. Open questions

None — all decisions resolved during proposal review.
