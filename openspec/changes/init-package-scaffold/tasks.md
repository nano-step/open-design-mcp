# Tasks: init-package-scaffold

> **Revision**: v2. Applies HARNESS deep-design verdicts (Metis + Oracle). Key task changes: T-2 acceptance no longer depends on T-7 (circular dep removed), T-3 spells out the full devDependency list, T-3b added for `.nvmrc`, T-5 stub style explicitly safe under strict lint, T-2 vendor LICENSE pulled from upstream (not copied from top-level), T-10 asserts concrete protocolVersion shape.

Ordered checklist for implementing the scaffold. Each task is one PR-sized commit. Each task has an explicit acceptance check (command + expected exit code) that the implementor and reviewer can run.

Order is enforced by dependencies: a task with `Depends: T-N` cannot start until that task is green.

---

## T-1: Top-level LICENSE and NOTICE

**Depends:** none

**Do:**
- Create `LICENSE` at repo root containing the full Apache License 2.0 text.
- Copyright line: `Copyright (c) 2026 nano-step`.
- Create `NOTICE` at repo root containing:
  ```
  Open Design MCP
  Copyright (c) 2026 nano-step

  This product includes software vendored from nexu-io/open-design.
  See vendor/od-contracts/NOTICE for full attribution.
  ```

**Acceptance:**
- `test -f LICENSE && test -f NOTICE && grep -q "Apache License" LICENSE && grep -q "nexu-io/open-design" NOTICE` → exit 0

---

## T-2: Vendor folder skeleton

**Depends:** T-1

**Do:**
- Create directory `vendor/od-contracts/src/`.
- Create `vendor/od-contracts/LICENSE` — **download the LICENSE file from `nexu-io/open-design@7766582`** (not a copy of the top-level LICENSE). The upstream LICENSE file is the authoritative copy under Apache 2.0 §4(a). One-liner:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/nexu-io/open-design/7766582f0bd75d2dce31b2f9db01a482af801897/LICENSE -o vendor/od-contracts/LICENSE
  ```
  (If upstream has no LICENSE at the pinned commit, fall back to the canonical Apache 2.0 text at https://www.apache.org/licenses/LICENSE-2.0.txt and document in T-2 evidence.)
- Create `vendor/od-contracts/NOTICE`:
  ```
  This subdirectory contains software vendored from:
    https://github.com/nexu-io/open-design
    Copyright (c) 2024-2026 Nexu Labs
    Licensed under Apache License 2.0

  Vendored files retain their original copyright headers.
  See VENDORED_FROM.md for the pinned commit, file list, and modifications log.
  ```
- Create `vendor/od-contracts/VENDORED_FROM.md` with these required fields (template — fill values as listed):
  - `Upstream Repository: https://github.com/nexu-io/open-design`
  - `Upstream License: Apache-2.0`
  - `Upstream Commit SHA: 7766582f0bd75d2dce31b2f9db01a482af801897`
  - `Upstream Commit Date: 2026-05-17T12:28:18+09:00`
  - `Upstream Commit Message: chore(ci): scope nix-check workflow permissions to contents:read (#1870)`
  - `Vendored on: <ISO timestamp of when you ran this task>`
  - `Files Vendored:` section listing the 13 target paths (per design.md D6 table; explicitly EXCLUDE `src/index.ts`).
  - `Modifications:` section — empty in scaffold PR. Header line: `(none — populated by scripts/vendor-sync.sh during vendor-sync-initial change)`
  - `Re-sync Procedure:` section pointing at `scripts/vendor-sync.sh <new-sha>`.
- Create `vendor/od-contracts/README.md` with: purpose, file list, sync command, license summary.
- Add `vendor/od-contracts/src/.gitkeep` so the empty directory is committed.

**Acceptance** (inline, does not depend on T-7):
- `test -f vendor/od-contracts/LICENSE && test -s vendor/od-contracts/LICENSE` → exit 0
- `test -f vendor/od-contracts/NOTICE && test -s vendor/od-contracts/NOTICE` → exit 0
- `test -f vendor/od-contracts/VENDORED_FROM.md && test -s vendor/od-contracts/VENDORED_FROM.md` → exit 0
- `test -f vendor/od-contracts/README.md` → exit 0
- `test -d vendor/od-contracts/src && test -f vendor/od-contracts/src/.gitkeep` → exit 0
- `grep -qE '^Upstream Commit SHA: [a-f0-9]{40}$' vendor/od-contracts/VENDORED_FROM.md` → exit 0
- `grep -q '7766582f0bd75d2dce31b2f9db01a482af801897' vendor/od-contracts/VENDORED_FROM.md` → exit 0

---

## T-3: package.json + tsconfig.json + .gitignore additions

**Depends:** T-1

**Do:**
- Create `package.json` matching the **locked shape in `design.md` § D13** byte-for-byte (or with only trivial formatting differences). Key fields to verify:
  - `"name": "open-design-mcp"`
  - `"version": "0.1.0"`
  - `"license": "Apache-2.0"`
  - `"type": "module"`
  - `"bin": { "open-design-mcp": "dist/src/server.js" }`
  - `"engines": { "node": ">=20" }`
  - `"files": ["dist", "vendor/od-contracts/LICENSE", "vendor/od-contracts/NOTICE", "vendor/od-contracts/VENDORED_FROM.md", "LICENSE", "NOTICE", "README.md"]`
  - `"scripts"`: `build`, `prepare`, `lint`, `typecheck`, `test`, `test:integration`, `watch`, `vendor:sync`, `vendor:check`
  - `"dependencies"`: `@modelcontextprotocol/sdk` ^1.29.0, `undici` ^7.0.0, `zod` ^3.23.8
  - `"devDependencies"`: `@types/node` ^20.10.0, `@vitest/coverage-v8` ^2.1.8, `eslint` ^9.0.0, `shx` ^0.3.4, `typescript` ^5.6.0, `typescript-eslint` ^8.0.0, `vitest` ^2.1.8

- Create `tsconfig.json` matching the **locked shape in `design.md` § D6** "Compilation strategy" section:
  - `target: "ES2022"`, `module: "Node16"`, `moduleResolution: "Node16"`
  - `rootDir: "."`, `outDir: "./dist"`
  - `strict: true`, `skipLibCheck: true`, `esModuleInterop: true`, `forceConsistentCasingInFileNames: true`, `resolveJsonModule: true`, `declaration: false`
  - `include: ["src/**/*", "vendor/od-contracts/src/**/*"]`
  - `exclude: ["node_modules", "dist", "**/*.test.ts", "tests/**/*"]`

- Append to `.gitignore`: `dist/`, `coverage/`, `*.tsbuildinfo`, `.vitest-cache/`.

**Acceptance:**
- `node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); if(p.name!=='open-design-mcp')process.exit(1); if(p.type!=='module')process.exit(1); if(p.bin['open-design-mcp']!=='dist/src/server.js')process.exit(1); if(p.engines.node!=='>=20')process.exit(1); if(!p.dependencies['@modelcontextprotocol/sdk'])process.exit(1); if(!p.devDependencies['shx'])process.exit(1); if(!p.devDependencies['typescript-eslint'])process.exit(1); console.log('ok')"` → prints `ok`, exit 0
- `node -e "const t = JSON.parse(require('fs').readFileSync('tsconfig.json','utf8')); if(t.compilerOptions.strict!==true)process.exit(1); if(t.compilerOptions.module!=='Node16')process.exit(1); if(t.compilerOptions.rootDir!=='.')process.exit(1); console.log('ok')"` → prints `ok`, exit 0

---

## T-3b: .nvmrc

**Depends:** T-1

**Do:**
- Create `.nvmrc` at repo root containing the single line `20`.

**Acceptance:**
- `test "$(cat .nvmrc)" = "20"` → exit 0

---

## T-4: Install dependencies

**Depends:** T-3

**Do:**
- Run `npm install` (let it generate `package-lock.json`).
- Commit `package-lock.json`.

**Acceptance:**
- `npm ci` on a fresh `node_modules/` (rm -rf first) → exit 0
- `ls node_modules/@modelcontextprotocol/sdk` → exists

---

## T-5: src/server.ts entry point

**Depends:** T-4

**Do:**
- Create `src/server.ts`:
  - First line `#!/usr/bin/env node`
  - Imports `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
  - Imports `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`
  - Constructs `McpServer` with `name: "open-design-mcp"`, `version: "0.1.0"`
  - Registers no tools (empty surface in this PR)
  - `async function main()` connects to `StdioServerTransport`
  - Wraps `main()` with `.catch(err => { console.error(err); process.exit(1); })`
  - Adds SIGINT + SIGTERM handlers that call `transport.close()` and `process.exit(0)` within 2 seconds
  - Logs `"[open-design-mcp] starting on stdio"` then (after connect) `"[open-design-mcp] ready"` to **stderr** only
- Create `src/tools/.gitkeep` (placeholder folder).
- Create stubs `src/od-client.ts` and `src/pipeline.ts`. To stay lint-clean under `tseslint.configs.strict` (no `@ts-expect-error`, no empty functions, no unused vars), use the following exact pattern in each stub:
  ```typescript
  /**
   * od-client: HTTP wrapper for the Open Design daemon.
   * Implemented in the BYOK pipeline change. Exported as a typed
   * placeholder so the module is non-empty and consumers can typecheck.
   */
  export const OD_CLIENT_PLACEHOLDER = 'not-yet-implemented' as const;
  ```
  Adjust the name + JSDoc for `pipeline.ts`. No `// @ts-expect-error`, no `function () {}`, no empty objects.

**Acceptance:**
- `npm run build` → exit 0
- `head -1 dist/src/server.js` → `#!/usr/bin/env node`
- `[ -x dist/src/server.js ]` → exit 0
- `git grep -n "console.log" src/` → no matches (exit 1 is the success signal here)

---

## T-6: Unit test for server bootstrap

**Depends:** T-5

**Do:**
- Create `vitest.config.ts` per spec build-and-ci.
- Create `src/__tests__/server.test.ts`:
  - One test: `import('../server.js')` resolves without throwing (catches startup syntax errors)
  - One test: regex check that `server.ts` source begins with `#!/usr/bin/env node` shebang
  - One test: regex check that `server.ts` source contains no `console.log(`

**Acceptance:**
- `npm test` → exit 0, all tests pass

---

## T-7: scripts/vendor-check.sh

**Depends:** T-2, T-3

**Do:**
- Create `scripts/vendor-check.sh`:
  - Exit 1 if `vendor/od-contracts/LICENSE` missing or empty.
  - Exit 1 if `vendor/od-contracts/NOTICE` missing or empty.
  - Exit 1 if `vendor/od-contracts/VENDORED_FROM.md` missing or empty.
  - Exit 1 unless `VENDORED_FROM.md` contains a 40-char lowercase hex SHA on a line matching `^Upstream Commit SHA: [a-f0-9]{40}$`.
  - Exit 1 if top-level `LICENSE` or `NOTICE` missing.
  - Exit 0 otherwise; print a single-line `"vendor-check: ok"` message to stdout.
- Note: per-file copyright header verification is intentionally **out of scope** in this PR (Metis F-6 — vacuous when vendor/src is empty). It is deferred to the `vendor-sync-initial` change, where the script will be extended to verify each `.ts` file carries an upstream copyright header.
- Make script executable (`chmod +x`).

**Acceptance:**
- `bash scripts/vendor-check.sh` → exit 0, prints `vendor-check: ok`
- `mv vendor/od-contracts/LICENSE /tmp/lic.bak && bash scripts/vendor-check.sh; rc=$?; mv /tmp/lic.bak vendor/od-contracts/LICENSE; [ $rc -ne 0 ]` → exit 0 (test of negative case)

---

## T-8: scripts/vendor-sync.sh

**Depends:** T-2

**Do:**
- Create `scripts/vendor-sync.sh` per design.md § D8.
- Behavior:
  - Accept 1 argument: upstream SHA (or `HEAD`/tag — resolve to SHA).
  - Refuse if `vendor/od-contracts/src/` (when non-empty) has uncommitted changes.
  - Shallow + sparse clone `https://github.com/nexu-io/open-design` into `/tmp/od-vendor-sync-$$`.
  - Sparse-checkout `packages/contracts/src/{prompts,api,common.ts,index.ts}`.
  - Resolve passed argument to full 40-char SHA.
  - Rsync filtered file set into `vendor/od-contracts/src/` preserving directory structure.
  - Update `VENDORED_FROM.md` with new SHA, ISO timestamp, commit date, commit message.
  - Generate `.vendor-diff-report-<timestamp>.txt` showing the diff vs previous state.
  - Clean up temp clone.
  - Print summary with next steps (review diff, run tests, commit).
- Make executable.
- **DO NOT** actually run the sync in this PR. The script exists; the actual file copy happens in the follow-up `vendor-sync-initial` change.

**Acceptance:**
- `[ -x scripts/vendor-sync.sh ]` → exit 0
- `bash -n scripts/vendor-sync.sh` (syntax-check only) → exit 0
- `scripts/vendor-sync.sh --help 2>&1 | grep -i usage` → exit 0 (script prints usage when no arg passed)

---

## T-9: ESLint flat config

**Depends:** T-4

**Do:**
- Create `eslint.config.js` (flat config, ESM) at repo root:
  - Import `typescript-eslint` (it provides `tseslint.config()` helper).
  - Apply `tseslint.configs.recommended` + `tseslint.configs.strict`.
  - Configure `languageOptions.parserOptions.project` to point at `./tsconfig.json`.
  - Ignore `dist`, `node_modules`, `vendor`, `coverage`.
- Add devDeps if not already present: `eslint`, `typescript-eslint`, `@types/node` (already in T-3).

**Acceptance:**
- `npm run lint` → exit 0, 0 errors, 0 warnings

---

## T-10: Integration test scaffold

**Depends:** T-5, T-6

**Do:**
- Create `vitest.integration.config.ts`:
  ```typescript
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
    test: { include: ['tests/integration/**/*.test.ts'], environment: 'node', globals: true, testTimeout: 15000 },
  });
  ```
- Create `tests/integration/initialize-handshake.test.ts`:
  - Spawns `node dist/src/server.js` as subprocess.
  - Uses `Client` + `StdioClientTransport` from `@modelcontextprotocol/sdk` to call `initialize` and `tools/list`.
  - Asserts: `serverInfo.name === "open-design-mcp"`, `serverInfo.version === "0.1.0"`, `protocolVersion` matches `^\d{4}-\d{2}-\d{2}$`, `tools` is `[]`.
  - Optionally waits for stderr line `"[open-design-mcp] ready"` before sending `initialize` to avoid stdio race (Oracle F9).
  - Cleans up subprocess in `afterAll`.

**Acceptance:**
- `npm run build && npm run test:integration` → exit 0
- Assertion: server responds with `serverInfo.name === "open-design-mcp"`, `serverInfo.version === "0.1.0"`, `protocolVersion` matching `^\d{4}-\d{2}-\d{2}$`, and `tools/list` returns `result.tools` as an empty array.

---

## T-11: GitHub Actions CI workflow

**Depends:** T-7, T-9, T-10

**Do:**
- Create `.github/workflows/ci.yml`:
  - Trigger: `push` on `master`, `pull_request` targeting `master`.
  - Matrix: Node 20 and Node 22.
  - Steps: `actions/checkout@v4`, `actions/setup-node@v4` (with `cache: 'npm'`), `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `bash scripts/vendor-check.sh`, `npm run test:integration`.
  - All steps required (no `continue-on-error`).
  - No `npm publish` step.

**Acceptance:**
- After push: CI run completes successfully on both Node 20 and Node 22 (verify in PR review)
- Locally: same command sequence yields exit 0:
  ```
  npm ci && npm run lint && npm run typecheck && npm test && npm run build && bash scripts/vendor-check.sh && npm run test:integration
  ```

---

## T-12: README

**Depends:** T-1, T-2, T-3

**Do:**
- Create `README.md` with sections:
  - Brief intro (one paragraph: what this package does).
  - **Installation** — `npx open-design-mcp` usage in MCP client config.
  - **Status** — clearly marked "v0.1.0 — scaffold only, no tools yet. Tools land in follow-up changes."
  - **Environment variables** — `OD_DAEMON_URL`, `OD_API_TOKEN`, `BYOK_BASE_URL`, `BYOK_API_KEY`, `BYOK_MODEL` (described but not yet consumed by code).
  - **Vendored Dependencies** — table per spec vendor-layout § README disclosure (link to `vendor/od-contracts/`).
  - **Development** — `npm install`, `npm test`, `npm run build`.
  - **License** — Apache 2.0.

**Acceptance:**
- `grep -E "^## Vendored Dependencies|^## Attribution" README.md` → exit 0
- `grep -i "nexu-io/open-design" README.md` → exit 0

---

## T-13: Story packet + TEST_MATRIX

**Depends:** all above tasks complete

**Do:**
- Create `docs/stories/init-package-scaffold.md` using `docs/templates/story.md` as the base. Link to:
  - GitHub issue #2
  - OpenSpec change folder `openspec/changes/init-package-scaffold/`
  - Each acceptance criterion → its evidence command + expected output.
- Create or update `docs/TEST_MATRIX.md` mapping each spec requirement to:
  - Test type (unit / integration / static-check)
  - Test file path
  - Command to run it

**Acceptance:**
- `test -f docs/stories/init-package-scaffold.md && test -f docs/TEST_MATRIX.md` → exit 0
- Story file links GitHub issue #2 via the literal string `nano-step/open-design-mcp/issues/2`

---

## T-14: Run full validation ladder + record evidence

**Depends:** T-1 through T-12

**Do:**
- On a clean checkout, run the full HARNESS validation ladder (per docs/HARNESS.md table for `lane:normal` + `change-type:infrastructure`):
  - `npm ci`
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `bash scripts/vendor-check.sh`
  - `npm run test:integration` (per HARNESS, lane:normal requires `test:integration`)
- Capture each command's exit code and abbreviated output into `docs/evidence/init-package-scaffold-validation.md`.

**Acceptance:**
- Every command exits 0
- Evidence file committed with timestamps and exit codes

---

## T-15: Review gate

**Depends:** T-14

**Do:**
- Per HARNESS lane:normal × change-type:infrastructure: single Oracle review.
- Spawn Oracle subagent with: full git diff vs `master`, proposal.md, design.md, all specs/*, tasks.md, evidence file.
- Oracle produces Review Verdict (PASS/FAIL) per acceptance criterion with evidence citations.
- If FAIL: fix gaps and re-run T-14 + T-15.

**Acceptance:**
- Review Verdict = PASS with all 17 acceptance criteria (across 3 spec files) cited as evidence
- Verdict pasted into GitHub issue #2 as a comment

---

## T-16: PR + bot review + merge

**Depends:** T-15

**Do:**
- Push branch `feat/init-package-scaffold` (or work on master directly for solo project — TBD by repo policy).
- Open PR with body `Closes #2`.
- If Gemini Code Assist bot is wired: triage every substantive comment per HARNESS rules.
- After bot approval: merge.

**Acceptance:**
- PR merged into master
- Issue #2 auto-closed
- `git log --oneline` shows scaffold commit on master

---

## T-17: openspec archive

**Depends:** T-16

**Do:**
- Run `openspec archive init-package-scaffold`.
- Verify the change folder is moved out of `openspec/changes/`.
- Update `docs/HARNESS_BACKLOG.md` if any friction was encountered.
- Add an entry to `docs/decisions/` for the locked decisions (D1-D12 from design.md).

**Acceptance:**
- `openspec list --json | jq '.changes[] | select(.name == "init-package-scaffold")'` returns nothing (active changes do not include it)
- archived/specs directories contain the new requirements
