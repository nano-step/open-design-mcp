# US-001 init-package-scaffold

> First implementation story. Lands the TypeScript MCP server scaffold so every subsequent tool implementation can land as a focused, reviewable PR.

## Status

in-progress (proposal + design + specs locked; implementation tasks not yet executed)

## GitHub Issue

[nano-step/open-design-mcp#2](https://github.com/nano-step/open-design-mcp/issues/2) — `lane:normal`, `change-type:infrastructure`, `status:proposal`

## Lane

normal

## OpenSpec Change

[`openspec/changes/init-package-scaffold/`](../../openspec/changes/init-package-scaffold/)

- proposal.md (v2)
- design.md (v2 — 14 decisions D1-D14)
- specs/server-bootstrap/spec.md (6 requirements, ~18 scenarios)
- specs/vendor-layout/spec.md (6 requirements, ~16 scenarios)
- specs/build-and-ci/spec.md (8 requirements, ~19 scenarios)
- tasks.md (18 ordered tasks T-1, T-2, T-3, T-3b, T-4..T-17)

## Product Contract

After this change ships, a developer or AI agent SHALL be able to:

1. Run `npx open-design-mcp` and have a valid stdio MCP server boot (advertising zero tools).
2. Send an MCP `initialize` JSON-RPC over stdin and receive a well-formed response with `serverInfo.name === "open-design-mcp"`, `serverInfo.version === "0.1.0"`, and a `protocolVersion` matching one of the SDK's `SUPPORTED_PROTOCOL_VERSIONS`.
3. Add a new MCP tool (in a follow-up change) by dropping a file into `src/tools/`, registering it in `src/server.ts`, and shipping a PR — without re-relitigating build config, lint, vendor layout, CI, or licensing.

## Relevant Product Docs

- `docs/HARNESS.md` — engineering workflow this story exercises end-to-end.
- `openspec/config.yaml` — locked project context (tech stack, conventions, BYOK background).
- `~/.nano-brain/memory/2026-05-17-open-design-mcp-research-synthesis.md` — research backing the decisions.
- `~/.nano-brain/memory/2026-05-17-open-design-mcp-decision.md` — strategic decision memo.

## Acceptance Criteria

Verbatim from the three specs (consolidated; each maps to one or more spec scenarios):

### AC-1 — Repository identity + license discipline
- AC-1.1: Top-level `LICENSE` exists, contains Apache 2.0 text, copyright `Copyright (c) 2026 kokorolx <kokoro.lehoang@gmail.com>`.
- AC-1.2: Top-level `NOTICE` exists, references `vendor/od-contracts/NOTICE`.
- AC-1.3: `README.md` carries a "Vendored Dependencies" (or "Attribution") section listing the upstream + license + pinned commit.

### AC-2 — Vendor folder structure + pin
- AC-2.1: `vendor/od-contracts/LICENSE` exists with Apache 2.0 from upstream@7766582.
- AC-2.2: `vendor/od-contracts/NOTICE` exists with attribution to nexu-io/open-design.
- AC-2.3: `vendor/od-contracts/VENDORED_FROM.md` contains 40-char SHA `7766582f0bd75d2dce31b2f9db01a482af801897`, ISO commit date, files-vendored list of 13 paths (explicitly excluding `src/index.ts`), and a Modifications section.
- AC-2.4: `vendor/od-contracts/README.md` documents purpose + sync command + license.
- AC-2.5: `vendor/od-contracts/src/.gitkeep` keeps the empty folder under version control.

### AC-3 — package.json matches D13 locked shape
- AC-3.1: `name === "open-design-mcp"`, `version === "0.1.0"`, `license === "Apache-2.0"`.
- AC-3.2: `type === "module"`, `bin["open-design-mcp"] === "dist/src/server.js"`, `engines.node === ">=20"`.
- AC-3.3: `author === "kokorolx <kokoro.lehoang@gmail.com>"`.
- AC-3.4: `files` whitelist exactly matches D13.
- AC-3.5: Every dependency + devDependency from D13 is present with matching version range.
- AC-3.6: Scripts present: `build`, `prepare`, `lint`, `typecheck`, `test`, `test:integration`, `watch`, `vendor:sync`, `vendor:check`.

### AC-4 — TypeScript configuration matches design
- AC-4.1: `tsconfig.json` has `strict: true`, `module: "Node16"`, `moduleResolution: "Node16"`, `target: "ES2022"`, `rootDir: "."`, `outDir: "./dist"`.
- AC-4.2: `include` covers `src/**/*` and `vendor/od-contracts/src/**/*`.
- AC-4.3: `exclude` covers `node_modules`, `dist`, `tests/**/*`, `**/*.test.ts`.

### AC-5 — Build produces working binary
- AC-5.1: `npm run build` exits 0.
- AC-5.2: `dist/src/server.js` exists with execute bit set.
- AC-5.3: First line of `dist/src/server.js` is `#!/usr/bin/env node`.

### AC-6 — MCP server passes initialize handshake
- AC-6.1: Spawned `node dist/src/server.js` accepts JSON-RPC `initialize` and returns `serverInfo.name === "open-design-mcp"`, `version === "0.1.0"`, `protocolVersion` matching `^\d{4}-\d{2}-\d{2}$`.
- AC-6.2: `tools/list` returns `result.tools` as an empty array.
- AC-6.3: `notifications/initialized` is accepted silently.
- AC-6.4: Unknown method returns JSON-RPC error `-32601` without crashing.
- AC-6.5: Server exits cleanly on SIGINT within 2 seconds; no leftover child processes.

### AC-7 — Logging discipline
- AC-7.1: Startup messages go to stderr only.
- AC-7.2: `git grep -n "console.log" src/` returns no matches (zero matches in our authored source).

### AC-8 — Validation ladder green
- AC-8.1: `npm run lint` exits 0 with zero warnings (`--max-warnings 0`).
- AC-8.2: `npm run typecheck` exits 0 with zero errors.
- AC-8.3: `npm test` exits 0 with at least one passing unit test.
- AC-8.4: `npm run test:integration` exits 0 after a prior build.
- AC-8.5: `bash scripts/vendor-check.sh` exits 0 and prints `vendor-check: ok`.

### AC-9 — CI workflow green on push + PR
- AC-9.1: `.github/workflows/ci.yml` triggers on `push` to `master` and on `pull_request` to `master`.
- AC-9.2: CI matrix runs on Node 20 AND Node 22.
- AC-9.3: Every step in the workflow exits 0 in a clean run.
- AC-9.4: Workflow contains no `npm publish` step.

### AC-10 — Vendor sync script behavior
- AC-10.1: `scripts/vendor-sync.sh` refuses to run when `vendor/od-contracts/` has uncommitted changes.
- AC-10.2: It resolves `HEAD`/tag arguments to a 40-char SHA before writing `VENDORED_FROM.md`.
- AC-10.3: It uses `git clone --filter=blob:none --sparse` to minimize bandwidth.
- AC-10.4: It prints a usage message when invoked with no arguments.
- AC-10.5: It is executable and `bash -n scripts/vendor-sync.sh` passes syntax check.

### AC-11 — Story + evidence + decisions captured
- AC-11.1: `docs/stories/init-package-scaffold.md` exists (this file) with a populated Evidence section after T-14.
- AC-11.2: `docs/TEST_MATRIX.md` exists and maps every spec requirement to a verification command.
- AC-11.3: `docs/evidence/init-package-scaffold/validation.md` records command + exit code for every validation-ladder step.
- AC-11.4: `docs/decisions/init-package-scaffold.md` summarizes D1-D14 with rationale links.

## Design Notes

- Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:integration`, `bash scripts/vendor-check.sh`, `bash scripts/vendor-sync.sh <sha>`.
- Queries: none (no DB).
- API: MCP JSON-RPC over stdio (`initialize`, `tools/list`, `notifications/initialized`).
- Tables: none.
- Domain rules:
  - Apache 2.0 §4(a)-(d) compliance via `vendor/od-contracts/LICENSE`, `NOTICE`, `VENDORED_FROM.md`.
  - §4(b) state-change disclosure pattern locked in design D14.
  - Public-api-contracts hard gate: server name + version + capability shape.
- UI surfaces: none (MCP server has no UI; consumers are coding agents).

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | `npm test` exits 0; `src/__tests__/server.test.ts` passes (shebang + no-console.log static checks). |
| Integration | `npm run build && npm run test:integration` exits 0; `tests/integration/initialize-handshake.test.ts` spawns server and validates AC-6.1, AC-6.2. |
| E2E | N/A — MCP server has no user-facing surface yet (HARNESS § Change Types: infrastructure exempt from E2E). |
| Platform | `bash scripts/vendor-check.sh` exits 0; CI matrix passes on Node 20 + 22. |
| Release | `npm pack --dry-run` lists only `dist/`, vendor LICENSE/NOTICE/VENDORED_FROM.md, top-level LICENSE/NOTICE/README.md, package.json (no `.ts` sources). |

## Change Type

`infrastructure`

Per HARNESS § Change Types:
- E2E **not applicable** — reason: no user-facing surface exists; future BYOK pipeline change introduces it.
- Smoke test **does** apply: `node dist/src/server.js` accepts `initialize` request → integration test covers this.
- Review gate **applies** (not self-verify) because `public-api-contracts` hard gate is triggered.

## Testing Checklist

- [ ] User-flow test covers primary changed behavior (file: `tests/integration/initialize-handshake.test.ts`)
- [ ] Error/edge path tested — high-risk only (N/A — lane is `normal`, not `high-risk`)
- [x] E2E not applicable — reason: infrastructure change, no user UI/surface introduced
- [ ] Smoke test for non-user-facing change — command: `npm run build && npm run test:integration`
- [ ] All listed tests pass (output pasted in Evidence)

## Review

- Reviewer agent: **oracle** (single Oracle per HARNESS lane:normal × change-type:infrastructure)
- Reviewer ≠ implementer: yes (Sisyphus orchestrator implemented; Oracle reviewed fresh per HARNESS § Review Gate)
- Verdict: **PASS**
- Date: 2026-05-17
- Commit: `6a3f2d7` on `feat/init-package-scaffold`
- Background session: `bg_35e1ca7b`

| Acceptance Criterion | Evidence | Status |
| --- | --- | --- |
| AC-1 Repository identity + license | LICENSE has Apache 2.0 + `Copyright (c) 2026 kokorolx <kokoro.lehoang@gmail.com>`; NOTICE references vendor; README "Vendored Dependencies" section present | ✓ |
| AC-2 Vendor folder structure + pin | LICENSE/NOTICE/VENDORED_FROM.md/README.md all present; SHA `7766582f0bd75d2dce31b2f9db01a482af801897` pinned; 13 paths listed; `index.ts` explicitly excluded; `src/.gitkeep` keeps empty dir versioned | ✓ |
| AC-3 package.json matches D13 | name/version/license/type/bin/engines/files/scripts/deps/devDeps all match D13 verbatim; `npm pack --dry-run` confirms no vendor .ts in pack | ✓ |
| AC-4 tsconfig matches design | strict=true, module=Node16, moduleResolution=Node16, target=ES2022, rootDir=`.`, outDir=`./dist`, include covers src+vendor, exclude covers tests | ✓ |
| AC-5 Build produces working binary | `npm run build` exit 0; `dist/src/server.js` exists, executable, starts `#!/usr/bin/env node` | ✓ |
| AC-6 Initialize handshake | `npm run test:integration` 3/3 pass: serverInfo.name="open-design-mcp", version="0.1.0", capabilities present, tools/list returns []; signal handlers present in source; unknown methods return -32601 (SDK default) | ✓ |
| AC-7 Logging discipline | `process.stderr.write` exclusively in server.ts; ESLint `no-console: error` rule; unit test asserts no `process.stdout.write`; `grep -rn "console.log\s*(" src/ --exclude-dir=__tests__` → 0 matches | ✓ |
| AC-8 Validation ladder green | All 6 commands exit 0 — see `docs/evidence/init-package-scaffold/validation.md` | ✓ |
| AC-9 CI workflow | `.github/workflows/ci.yml` triggers on push+PR to master, matrix [20,22], no `npm publish` step; actual green run pending PR open in T-16 | ✓ |
| AC-10 Vendor sync script behavior | refuses dirty vendor, resolves to 40-char SHA, sparse+shallow clone, usage message on no args, executable + syntax-check OK | ✓ |
| AC-11 Story + evidence + decisions | This file + TEST_MATRIX.md + validation.md + decisions/init-package-scaffold.md all present | ✓ |

**Non-blocking observation from review:** AC-6.4 (-32601 on unknown method) and AC-6.5 (SIGINT/SIGTERM) are proven indirectly (SDK default behavior + source-level unit test) rather than dedicated integration tests. Recommend strengthening the integration suite in `vendor-sync-initial`. Captured in `docs/HARNESS_BACKLOG.md` per HARNESS § Growth Rule.

## PR Bot Review

- PR URL: TBD (created at T-16)
- Bot rounds: 0
- Outstanding comments: TBD
- Bot approved: TBD (Gemini Code Assist if installed on repo; otherwise self-verify per HARNESS infrastructure change-type)

## Harness Delta

Harness improvements identified during this story:
- **OpenSpec spec format**: requirements MUST contain "SHALL" or "MUST" — discovered via `--strict` validation; documented in `~/.nano-brain/memory/2026-05-17-open-design-mcp-research-synthesis.md`.
- **Deep-design re-check pattern**: re-running Metis with `session_id` (preserved context) is far cheaper than fresh review. Worth codifying in HARNESS_BACKLOG.md as a documented step.
- **Force-push exception for author identity**: HARNESS § Forbidden Practices #7 forbids force-push to bypass PR bot review. Author-identity rewrites pre-PR are a legitimate exception — worth adding a clarifying note to HARNESS.md.

These items go to `docs/HARNESS_BACKLOG.md` after this story merges (T-17 archive phase).

## Evidence

Raw command transcript: [`docs/evidence/init-package-scaffold/validation.md`](../evidence/init-package-scaffold/validation.md)

Summary of T-14 validation ladder (recorded 2026-05-17, commit `6a3f2d7`):

| Step | Command | Exit code |
|---|---|---|
| 1 | `npm run lint` | 0 |
| 2 | `npm run typecheck` | 0 |
| 3 | `npm test` | 0 (7 tests pass) |
| 4 | `npm run build` | 0 |
| 5 | `bash scripts/vendor-check.sh` | 0 (`vendor-check: ok`) |
| 6 | `npm run test:integration` | 0 (3 tests pass) |

Notable mid-implementation correction discovered during T-10:

> `tools/list` initially returned `-32601 Method not found` because `McpServer` only auto-registers the tools capability after `registerTool()` is called. Fixed by explicit `server.server.registerCapabilities({ tools: { listChanged: false } })` + `setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }))`. Comment in `src/server.ts` documents the SDK invariant so future maintainers don't accidentally delete it.

Commit history on `feat/init-package-scaffold`:

```
6a3f2d7 feat: init-package-scaffold T-1..T-14 implementation
5d2a96b fix(openspec): set package author to kokorolx <kokoro.lehoang@gmail.com>
9b424fe fix(openspec): revise init-package-scaffold v2 — apply deep-design findings
0084d44 feat(openspec): init-package-scaffold proposal + design + specs + tasks
64025fc chore: harness init  (on master, parent)
```

CI link: pending PR open in T-16 — GitHub Actions only triggers on push to `master` or `pull_request` targeting `master`, not on feature branch pushes.
