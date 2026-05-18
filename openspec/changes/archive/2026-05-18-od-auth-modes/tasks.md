# Tasks: od-auth-modes

Ordered execution plan. Lane:normal → single PR with single Oracle review on the auth code.

## T-1: Pre-flight baseline

Confirm master is clean + branch ready.

- `git status` clean on `od-auth-modes`
- `bash scripts/vendor-check.sh` → `vendor-check: ok`
- All existing tests pass: `npm test` (≥105 unit) + `npm run test:integration` (≥22 integration)
- `openspec validate od-auth-modes --strict --no-interactive` → valid

**Verify:** all 4 commands exit 0.

## T-2: Extend `src/config.ts`

Add `OD_AUTH_MODE`, `OD_BASIC_USER`, `OD_BASIC_PASS` to `coreEnvSchema`. Resolve into an `AuthDescriptor` discriminated union exported alongside `CoreConfig`.

- New exported type: `AuthDescriptor = {mode:'none'} | {mode:'bearer';token:string} | {mode:'basic';user:string;pass:string}`
- `parseCore()` now returns `{...coreEnv, auth: AuthDescriptor}` — the resolved descriptor is the canonical auth surface for `OdClient`
- Default-mode inference per design §B2 (3 happy cases + 1 ambiguous-error case)
- Explicit-mode validation per design §B3
- Embedded-credentials rejection per design §B4 (URL-parse check after Zod validation)
- All errors flow through the existing `loadCoreOrExit()` → friendly stderr + `process.exit(1)`

**Verify:** `npm run typecheck` clean; module load OK with `OD_DAEMON_URL` only (no regression).

## T-3: Unit tests for `src/config.ts`

Extend `src/__tests__/config.test.ts` with 9 new cases (covering design §B2/§B3/§B4):

**Default-mode inference (3 cases):**

- Only `OD_DAEMON_URL` set → resolves `mode: 'none'`
- `OD_DAEMON_URL` + `OD_API_TOKEN` set → resolves `mode: 'bearer'`, token preserved
- `OD_DAEMON_URL` + `OD_BASIC_USER` + `OD_BASIC_PASS` set → resolves `mode: 'basic'`, both values preserved

**Default-mode ambiguity (1 case):**

- `OD_API_TOKEN` AND `OD_BASIC_USER`/`OD_BASIC_PASS` both set, no `OD_AUTH_MODE` → throws with message containing "ambiguous" or "disambiguate"

**Explicit-mode validation (3 cases):**

- `OD_AUTH_MODE=basic` without `OD_BASIC_USER` → throws with message naming the missing var
- `OD_AUTH_MODE=basic` without `OD_BASIC_PASS` → throws
- `OD_AUTH_MODE=bearer` without `OD_API_TOKEN` → throws

**Embedded credentials (1 case):**

- `OD_DAEMON_URL=https://u:p@host/` → throws with message pointing at `OD_BASIC_*`

**Invalid mode value (1 case):**

- `OD_AUTH_MODE=oauth` → throws (enum mismatch)

**Verify:** `npm test -- config.test` → all green (previous count + 9 new).

## T-4: Extend `src/od-client.ts`

Replace the `token: string` constructor parameter with `auth: AuthDescriptor`. Rewrite `headers()` to switch on mode per design §B5.

- Constructor signature: `constructor(baseUrl: string, auth: AuthDescriptor = {mode: 'none'})`
- `headers()` switch covers all 3 modes; TypeScript's exhaustiveness check used (default branch throws or `never`)
- Basic encoding: `Buffer.from(`${user}:${pass}`).toString('base64')`
- Authorization header keyed `authorization` (lowercase, matches existing convention)

**Verify:** `npm run typecheck` clean.

## T-5: Unit tests for `src/od-client.ts`

Extend `src/__tests__/od-client.test.ts` with 4 new cases:

- `auth: {mode: 'none'}` → no `authorization` header in fetch call
- `auth: {mode: 'bearer', token: 'tok123'}` → header equals `Bearer tok123` (regression: same shape as old behavior)
- `auth: {mode: 'basic', user: 'alice', pass: 'secret'}` → header equals `Basic ${base64('alice:secret')}` (verify exact bytes)
- Credential safety: when `proxyStream` throws `OdHttpError` (mock returns 500), `error.message` and `error.bodySnippet` do NOT contain the literal password string `secret` — uses sentinel value to assert

**Verify:** `npm test -- od-client.test` → all green (previous count + 4 new).

## T-6: Wire through `src/server.ts`

Replace the existing `new OdClient(coreConfig.OD_DAEMON_URL, coreConfig.OD_API_TOKEN)` with `new OdClient(coreConfig.OD_DAEMON_URL, coreConfig.auth)`.

- No other changes — config resolution moved entirely into `parseCore()`
- `OD_API_TOKEN` is no longer accessed at this layer (it lives inside the resolved `auth` descriptor)

**Verify:** `npm run build` exit 0; built artifacts in `dist/src/server.js`.

## T-7: Integration test — Basic header reaches mock OD

New file `tests/integration/tools-auth-basic.test.ts`:

- Spawn mock OD server (existing helper `startMockOdServer`)
- Spawn the MCP server child process with env: `OD_DAEMON_URL=<mock>`, `OD_AUTH_MODE=basic`, `OD_BASIC_USER=alice`, `OD_BASIC_PASS=secret`
- Invoke `od_list_projects` via MCP SDK client
- Assert the mock server received `Authorization: Basic ${base64('alice:secret')}` on the inbound request
- Assert response is forwarded successfully (no auth-related error in tool output)

**Verify:** `npm run test:integration -- tools-auth-basic` → 1 test passes.

## T-8: Integration regression sweep

Run the full integration suite. All existing 22 tests must still pass (default mode is `none` — unchanged behavior).

**Verify:** `npm run test:integration` → ≥23 tests pass (22 existing + 1 new).

## T-9: README env-var table + hosted example

Update `README.md`:

- Add three rows to the Environment Variables table for `OD_AUTH_MODE`, `OD_BASIC_USER`, `OD_BASIC_PASS`
- Add a new sub-section "Hosted Open Design deployment (HTTP Basic Auth)" with a config example pointing at `https://od.thnkandgrow.com/` using the new env vars

**Verify:** `grep -c "OD_AUTH_MODE\|OD_BASIC_USER\|OD_BASIC_PASS" README.md` ≥ 6; the hosted example block is present.

## T-10: HARNESS backlog flip

Edit `docs/HARNESS_BACKLOG.md` HB-6: change `Status: proposed` to `Status: implemented`, add a one-line link to PR.

**Verify:** `grep -A1 "^### HB-6" docs/HARNESS_BACKLOG.md` shows the new status.

## T-11: Live smoke test transcript

Create `docs/evidence/od-auth-modes/smoke-test.md`. Run one tool call against `https://od.thnkandgrow.com/` and paste the transcript:

1. Set env: `OD_DAEMON_URL=https://od.thnkandgrow.com/`, `OD_AUTH_MODE=basic`, `OD_BASIC_USER=<user>`, `OD_BASIC_PASS=<pass>`
2. Invoke `od_list_projects` via a tiny stdio driver
3. Capture exit status + first ~30 lines of output
4. Document the redaction approach (do not paste the literal `OD_BASIC_PASS` value)

**Verify:** file exists; transcript shows a 200 response from the hosted OD instance.

## T-12: Full validation ladder

Run all 6 commands, capture exit codes to `docs/evidence/od-auth-modes/validation.md`:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `bash scripts/vendor-check.sh`
6. `npm run test:integration`

**Verify:** all 6 exit 0. Evidence file present.

## T-13: Self code-review (per HARNESS § Review Gate)

Run the code-review skill or self-checklist against the diff vs `master`:

- Does every changed line trace to the proposal/design? (no scope creep)
- Are there any places where `OD_BASIC_PASS` flows to a log sink?
- Are there any places where the `Authorization` header could be echoed in an error?
- Are exhaustiveness checks present on the `AuthDescriptor` switch?
- Are existing users with `OD_API_TOKEN` only configs unaffected? (re-read regression test)

Document findings in PR body under "Self-review".

## T-14: Oracle review (high-confidence auth code)

Per HARNESS.md §Review Gate, lane:normal × change-type:user-feature requires single Oracle review. Spawn `oracle` agent with the diff, proposal, and design. Required verdict: PASS (or REVISE → fix → re-review).

**Verify:** Oracle PASS recorded in PR body.

## T-15: Atomic commits

Commit structure:

1. `feat(config): add OD_AUTH_MODE + Basic-auth env vars` — src/config.ts + tests
2. `feat(od-client): emit Authorization header by auth mode` — src/od-client.ts + tests
3. `chore(server): pass resolved auth descriptor to OdClient` — src/server.ts
4. `test(integration): basic-auth header reaches mock daemon` — tests/integration/tools-auth-basic.test.ts
5. `docs: document OD_AUTH_MODE + hosted-OD example` — README + HARNESS_BACKLOG + evidence/

**Verify:** `git log --oneline | head -5` shows clean conventional commits, no AI attribution trailers.

## T-16: Push + open PR

- Push branch
- Open PR with body referencing #23, evidence link, validation summary, Oracle verdict
- Watch CI Node 20 + 22 matrix → must be green

**Verify:** PR URL captured; CI green; no force-push after open (HB-1 rule).

## T-17: Merge + archive

- Squash-merge PR
- Pull master, confirm semver bump (auto-publish workflow)
- `openspec archive od-auth-modes`
- Confirm canonical `server-bootstrap` and `build-and-ci` specs absorb the deltas

**Verify:** `openspec list` shows zero active changes; `openspec/changes/archive/<date>-od-auth-modes/` exists; `openspec validate --strict --no-interactive` clean across all specs.
