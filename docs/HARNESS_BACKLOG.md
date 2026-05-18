# Harness Backlog

<!-- generated-by: harness-init v0.1.0 -->

Use this file when an agent discovers a missing harness capability but should
not change the operating model immediately.

## Template

```md
## Missing Harness Capability

### Title

Short name.

### Discovered While

Task or story that exposed the gap.

### Current Pain

What was hard, repeated, ambiguous, or unsafe?

### Suggested Improvement

What should be added or changed?

### Risk

Tiny, normal, or high-risk.

### Status

proposed | accepted | implemented | rejected
```

## Items

### HB-1: Force-push exception clause for pre-PR author rewrites

#### Discovered While
init-package-scaffold story T-3 (committing then realizing git author identity was wrong before any PR opened).

#### Current Pain
HARNESS § Forbidden Practices #7 forbids force-push without nuance. There is a legitimate window (pre-PR, before any reviewer or bot has seen the work) where rewriting commit identity, splitting commits, or rebasing onto a fresher base IS safe — but the rule reads as a blanket ban.

#### Suggested Improvement
Add a clarifying clause to § Forbidden Practices #7:

> Force-pushing is forbidden once a PR is open OR once another collaborator has fetched the branch, whichever comes first. Pre-PR identity / amend / squash operations on a private feature branch are permitted, but the next push event resets the "private" status — after that, force-push requires explicit human decision documented in the issue.

#### Risk
tiny (documentation only)

#### Status
proposed

---

### HB-2: Codify Metis/Oracle re-check pattern using session_id

#### Discovered While
init-package-scaffold deep-design phase. After v1 revision, re-ran Metis with the same `session_id` to verify all 4 blocking gaps were resolved. Full prior context preserved — re-check returned in 1m19s with concrete table mapping each finding → v2 fix → status. Fresh invocation would have re-read all artifacts and cost ~5–10× more tokens.

#### Current Pain
HARNESS § Deep-Design Gap Analysis describes the re-run loop ("revise → re-run deep-design → repeat until clean pass") but doesn't say HOW to make the re-run cheap. Agents will default to spawning fresh sessions, which is expensive and slow.

#### Suggested Improvement
Add a sub-section under § Deep-Design Gap Analysis:

> **Cheap re-checks**: when revising in response to findings, re-invoke Metis/Oracle with the same `session_id` so the agent has full prior context. Ask only for a delta table (finding → v2 fix → resolved status), not a fresh analysis. Reserve fresh sessions for fundamentally new scope.

#### Risk
tiny (process improvement)

#### Status
proposed

---

### HB-3: Strengthen MCP integration tests for unknown-method + signal handling

#### Discovered While
init-package-scaffold Review Gate (Oracle, `bg_35e1ca7b`). AC-6.4 (unknown method returns -32601) and AC-6.5 (SIGINT/SIGTERM clean shutdown) are proven indirectly — by SDK default behavior and source-level unit test, not by integration tests.

#### Current Pain
Indirect evidence is fragile. If the SDK changes its unknown-method default, or if a future server.ts refactor breaks the signal handler, the existing tests will still pass while real consumers (Claude Code, OpenCode) see broken behavior.

#### Suggested Improvement
In the `vendor-sync-initial` change (next), add two new integration tests:

1. Send a JSON-RPC request with `method: "resources/list"` (we don't implement resources), assert response has `error.code === -32601`.
2. Spawn server, send `initialize`, then send `SIGINT` to the subprocess, assert exit code 0 within 2 seconds and no zombie processes.

#### Risk
tiny (additive tests, no production code change)

#### Status
proposed

---

### HB-4: Bump GitHub Actions to Node 24 runner before September 2026

#### Discovered While
init-package-scaffold PR #3 CI run (deprecation annotation). `actions/checkout@v4` + `actions/setup-node@v4` use Node 20 runner; GitHub forces Node 24 runners by default starting 2026-06-02, and removes Node 20 entirely 2026-09-16.

#### Current Pain
Annotation noise on every CI run. Hard deadline before 2026-09-16 or CI breaks.

#### Suggested Improvement
Bump action versions when v5 (Node 24-compatible) releases. If not yet available before deadline, add `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` env var to workflow.

#### Risk
tiny (CI maintenance, no production impact)

#### Status
proposed

---

### HB-5: Read `serverInfo.version` dynamically from `package.json`

#### Discovered While
v0.2.0 smoke test after `npm publish`. The MCP `initialize` response returns `serverInfo.version: "0.1.0"` because `src/server.ts` hard-codes the version string. The npm package version is 0.2.0 (auto-bumped by shared-workflows). Inconsistency.

#### Current Pain
MCP clients see a stale version when introspecting capabilities. Confusing for debugging and version-pinning client integrations.

#### Suggested Improvement
Replace the hard-coded version in `src/server.ts` with one of:
- `import pkg from '../package.json' assert { type: 'json' };` (Node 20+ JSON imports, ESM)
- Read at runtime: `JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf-8')).version`
- Inject at build time via a generated `version.ts` file in `prepare` script

Ensure works in both the source tree and the published `dist/` (path resolution differs).

#### Risk
small (cosmetic UX, no behavior impact in v0.x). Touches 1 file, easy revert.

#### Status
proposed

---

### HB-6: Support HTTP Basic Auth for hosted Open Design deployments

#### Discovered While
byok-pipeline-tool PR-A planning (2026-05-18). User flagged the publicly-hosted OD daemon at `https://od.thnkandgrow.com/` which sits behind HTTP Basic Auth (browser-prompt `Authorization: Basic <base64(user:pass)>` style), not a bearer token. The current OpenSpec design (`openspec/changes/byok-pipeline-tool/design.md` §B7) only models bearer tokens via `OD_API_TOKEN` → `Authorization: Bearer <token>`.

#### Current Pain
Anyone pointing `OD_DAEMON_URL` at a hosted OD instance protected by Basic Auth will hit a 401 from every tool call. They cannot work around it with `OD_API_TOKEN` because that emits the wrong header scheme. Workarounds (embedding `user:pass@` in the URL) are fragile across `fetch` implementations and leak credentials into logs/error messages.

This is the **first deployment mode (hosted, internet-exposed)** the project supports beyond local Docker / loopback — and the design didn't anticipate it.

#### Suggested Improvement
File a follow-up OpenSpec change `od-auth-modes` (lane: `normal`, change-type: `user-feature`) after `byok-pipeline-tool` archives. Sketch:

1. **New env vars** (additive, all optional):
   - `OD_AUTH_MODE`: `none` | `bearer` | `basic` (default `bearer` if `OD_API_TOKEN` set, else `none`)
   - `OD_BASIC_USER` + `OD_BASIC_PASS` (required when mode = `basic`)
2. **`src/od-client.ts`** header logic becomes:
   ```ts
   if (mode === 'bearer' && token) headers.Authorization = `Bearer ${token}`;
   else if (mode === 'basic')      headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
   ```
3. **README**: add a row to the env-vars table + a deployment-mode example for `https://od.thnkandgrow.com/`.
4. **Tests**: extend `od-client.test.ts` with three header-shape assertions (none / bearer / basic) using mocked `fetch`.
5. **Smoke test**: add an entry to `docs/evidence/<change>/smoke-test.md` that exercises one tool against the hosted instance.

**Out of scope for this backlog item, in scope for the change**:
- Credential masking in error messages (must never echo `OD_BASIC_PASS`, even truncated)
- URL-embedded credentials (`https://user:pass@host/`) — explicitly REJECT at startup with friendly error; force users to use env vars
- mTLS / OAuth — separate change, not v0.5

#### Risk
small. Additive only; existing bearer-token flow unchanged when `OD_AUTH_MODE` defaults. Credential-handling lives in one file (`od-client.ts`). Touches design §B7 (lock-update) and §B14 (logging) but no architectural shift.

#### Status
proposed

---

### HB-7: Test environment must not inherit shell env vars that hide module-load bugs

#### Discovered While
byok-pipeline-tool PR-A CI failure (2026-05-18). Local `npm test` passed with 32/32 because the maintainer's shell had `OD_DAEMON_URL` set (for the live OD daemon at `http://ai-open-design:7456`). CI runners don't set it → the eager `coreConfig` singleton called `process.exit(1)` at module load → vitest's harness rejected the test file with `process.exit unexpectedly called`. Same code, opposite outcome based on shell state.

#### Current Pain
The validation ladder (`npm test` → green locally → push) gives false confidence whenever a module has top-level side effects that depend on env vars. The harness currently treats `npm test` as authoritative; it isn't. CI catches it, but only after a push round-trip.

#### Suggested Improvement
Two complementary changes:

1. **`HARNESS.md` § Validation Ladder**: add a clause:
   > Before pushing any change that touches config, env-var parsing, or any module with top-level side effects, run the test suite with the relevant env vars UNSET locally: `env -i PATH=$PATH HOME=$HOME npm test` (or `unset VAR && npm test`). If a module can throw at import time, the test runner must prove it survives both states.

2. **`vitest.config.ts`**: add a `setupFiles` entry that clears `OD_*` and `BYOK_*` before each test file loads, so vitest behaves like CI by default. Per-test cases that need env can `vi.stubEnv` explicitly.

   ```ts
   // tests/setup-clean-env.ts
   for (const k of Object.keys(process.env)) {
     if (k.startsWith('OD_') || k.startsWith('BYOK_')) delete process.env[k];
   }
   ```

#### Risk
tiny (test-infra only, no production code change). Catch is high-value: would have caught PR-A's CI break before push.

#### Status
proposed

---

### HB-8: Multi-PR features collide with auto-publish-on-feat — slicing inflates the version namespace

#### Discovered While
byok-pipeline-tool PR-A merge (2026-05-18). The plan sliced the change into 6 small single-issue PRs (PR-A..PR-F) per HARNESS.md high-risk-lane policy. PR-A merged with subject `feat(byok-pipeline-tool): add config + SSE parser foundation (PR-A, #7) (#13)`. The shared `publish-stable` workflow correctly interpreted `feat:` → minor bump → v0.4.0 published to npm. But PR-A is **foundation-only**; `tools/list` still returns []. The v0.4.0 advertises a feature surface that doesn't exist.

#### Current Pain
Two correct policies in tension:
- **HARNESS.md**: encourage small single-issue PRs for high-risk changes
- **shared-workflows publish-stable**: bump+publish on every `feat:` commit

Multi-PR features inflate the semver namespace. Final byok-pipeline-tool ship lands at ~v0.7.0 or v0.8.0 instead of the planned v0.4.0. End users see 4-5 npm releases that each ship "partial feature" with no behavior change until the last one.

#### Suggested Improvement
Add a `release:skip` PR label that the publish-stable workflow checks on the merge commit. If present, skip the version bump and npm publish. Maintainer applies it to all but the final slice of a multi-PR feature.

Implementation outline (in `kokorolx/shared-workflows` repo, not this one):
```yaml
- id: should-skip
  run: |
    if gh pr view "${{ github.event.head_commit.message }}" --json labels | jq -e '.labels[] | select(.name == "release:skip")'; then
      echo "skip=true" >> $GITHUB_OUTPUT
    fi
- if: steps.should-skip.outputs.skip != 'true'
  run: ./bump-and-publish.sh
```

Add a new label `release:skip` to this repo's label set.

Concurrent project-local mitigation (cheap, no workflow change needed): use `chore(byok-pipeline-tool):` prefix for intermediate slices and reserve `feat:` for the slice that flips a visible behaviour. PR-A, PR-B would be `chore:` (no user-visible change); PR-C, PR-D, PR-E, PR-F would be `feat:`. Less elegant but works today.

#### Risk
tiny (process / workflow improvement). Shared-workflow change is opt-in via label, defaults unchanged.

#### Status
proposed

#### Decisions taken now
- v0.4.0 stays published. Re-plan version namespace: PR-F final ship will be whatever publish-stable lands on after PR-B..PR-E merge through (estimated v0.5.0 — PR-B is `chore:` patch, PR-C/D/E each minor-bump).
- PR-F task updated to drop the literal "release v0.4.0" wording.
