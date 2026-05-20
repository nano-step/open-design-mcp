# Test Matrix

Maps every spec requirement to its verification command. Reviewers use this during the HARNESS Review Gate to confirm each acceptance criterion has running, repeatable proof.

> **Convention**:
> - **Static** = file existence / content / format check (grep, test, node -e).
> - **Unit** = vitest test in `src/__tests__/`.
> - **Integration** = vitest test in `tests/integration/` exercising the built binary.
> - **CI** = step in `.github/workflows/ci.yml`.

## Stories

| Story | Status | Lane | Change Type |
|---|---|---|---|
| [US-001 init-package-scaffold](stories/init-package-scaffold.md) | in-progress | normal | infrastructure |
| [US-060 add-design-system-workflow](stories/add-design-system-workflow.md) | shipped (v0.17.0) | normal | user-feature |
| [US-067 add-github-pages-site](stories/add-github-pages-site.md) | shipped (v0.18.0) | normal | user-feature |

---

## US-060 add-design-system-workflow

### Spec: design-system

| Requirement | Scenario | Test Type | Test File / Command | Acceptance link |
|---|---|---|---|---|
| Artifact shape (4 marker slots) | Happy path round-trip | Unit | `src/__tests__/tools/extract-design-system.test.ts` (cases: valid manifest, byte-identical CSS) | spec/design-system §Artifact Shape |
| Missing style block → isError | Each of od-tokens / od-components / od-layout missing | Unit | `src/__tests__/tools/extract-design-system.test.ts` (3 cases) | spec/design-system §Extraction |
| Manifest schema v1 accepted, v2 rejected | Version literal validation | Unit | `src/__tests__/types/design-system.test.ts` + `extract-design-system.test.ts` | spec/design-system §Manifest |
| BYOK generation happy path | Valid HTML output passes extractor | Unit | `src/__tests__/tools/generate-design-system.test.ts` (case: valid HTML returns no isError) | spec/design-system §Generate |
| Post-stream validation failure → isError + 2 items | Generator emits artifact missing slot | Unit | `src/__tests__/tools/generate-design-system.test.ts` (case: missing marker slot) | spec/design-system §Generate |
| Update semantic + delta modes | Version bumped, schema valid | Unit | `src/__tests__/tools/update-design-system.test.ts` (semantic + delta cases) | spec/design-system §Update |
| bumpVersion increments data-od-version | 3→4, absent throws | Unit | `src/__tests__/tools/update-design-system.test.ts` (case: bumpVersion) | spec/design-system §Update |

### Spec: tools

| Requirement | Scenario | Test Type | Test File / Command | Acceptance link |
|---|---|---|---|---|
| Tool count 10 → 13 | All registrations present | Integration | `tests/integration/initialize-handshake.test.ts` (asserts toolList.length=13) | spec/tools §Registration |
| `designSystemMode` arg on od_generate_design | Strict / advisory / off contract wording | Unit | `src/__tests__/tools/generate-design.test.ts` (tests #33–#36) | spec/tools §generate-design |
| Auto-inject advisory fallback when content unavailable | Linked file found but no content | Unit | `src/__tests__/tools/generate-design.test.ts` (test: falls back to advisory comment) | spec/tools §generate-design (known limitation) |
| DS001–DS005 lint rules (incl. SVG skip + ignore-next-line) | Each rule positive + negative | Unit | `src/__tests__/tools/design-system-lint.test.ts` | spec/tools §lint-artifact |
| `designSystemSummary` on od_compose_brief | Inserted between brand-spec and page-prompt; byte-identical when omitted | Unit | `src/__tests__/tools/compose-brief.test.ts` (cases: ordering, omission) | spec/tools §compose-brief |
| Backward compatibility — all new args optional | Omitting all new args produces pre-v0.17 output | Unit | All test files above with backward-compat cases | spec/tools §Compatibility |
| Wrapper-injection NOT vendor | `vendor/od-contracts/` untouched | Static | `git diff vendor/od-contracts/ HEAD~N` empty + `npm run vendor:check` ok | spec/tools §Vendor |

---

## US-001 init-package-scaffold

### Spec: server-bootstrap

| Requirement | Scenario | Test Type | Test File / Command | Acceptance link |
|---|---|---|---|---|
| Executable stdio MCP server | Built binary is executable via node | Static + Integration | `test -x dist/src/server.js && head -1 dist/src/server.js` | AC-5 |
| Executable stdio MCP server | Binary registered in package.json bin field | Static | `node -e "const p=require('./package.json'); process.exit(p.bin['open-design-mcp']==='dist/src/server.js'?0:1)"` | AC-3.2 |
| MCP initialize handshake | Initialize returns server metadata | Integration | `tests/integration/initialize-handshake.test.ts` (case: `initialize`) | AC-6.1 |
| MCP initialize handshake | notifications/initialized accepted silently | Integration | `tests/integration/initialize-handshake.test.ts` (case: `notifications/initialized`) | AC-6.3 |
| MCP initialize handshake | tools/list returns empty array | Integration | `tests/integration/initialize-handshake.test.ts` (case: `tools/list`) | AC-6.2 |
| MCP initialize handshake | Unknown method returns JSON-RPC error | Integration | `tests/integration/initialize-handshake.test.ts` (case: `resources/list` → -32601) | AC-6.4 |
| Logging discipline | Startup messages go to stderr | Integration | Server subprocess stderr captured; assertion `stderr contains "[open-design-mcp] ready"` | AC-7.1 |
| Logging discipline | No console.log in our authored source | Static | `git grep -n "console.log" src/ && exit 1 || exit 0` | AC-7.2 |
| Clean shutdown on signals | SIGINT triggers graceful exit | Integration | `tests/integration/initialize-handshake.test.ts` (kill subprocess with SIGINT, assert exit code 0 within 2s) | AC-6.5 |
| Clean shutdown on signals | SIGTERM triggers graceful exit | Integration | Same as SIGINT case but kill with SIGTERM | AC-6.5 |
| Engines and runtime | package.json engines | Static | `node -e "const p=require('./package.json'); process.exit(p.engines.node==='>=20'?0:1)"` | AC-3.2 |
| Engines and runtime | ESM module type | Static | `node -e "const p=require('./package.json'); process.exit(p.type==='module'?0:1)"` | AC-3.2 |

### Spec: vendor-layout

| Requirement | Scenario | Test Type | Test File / Command | Acceptance link |
|---|---|---|---|---|
| Vendor folder structure | Required files exist after scaffold | Static | `for f in LICENSE NOTICE VENDORED_FROM.md README.md; do test -s vendor/od-contracts/$f \|\| exit 1; done` | AC-2.1, AC-2.2, AC-2.3, AC-2.4 |
| Vendor folder structure | src subtree placeholder | Static | `test -d vendor/od-contracts/src && test -f vendor/od-contracts/src/.gitkeep && [ -z "$(find vendor/od-contracts/src -name '*.ts')" ]` | AC-2.5 |
| Upstream pin metadata | Pin contents | Static | `grep -qE "^Upstream Commit SHA: [a-f0-9]{40}$" vendor/od-contracts/VENDORED_FROM.md && grep -q "7766582f0bd75d2dce31b2f9db01a482af801897" vendor/od-contracts/VENDORED_FROM.md` | AC-2.3 |
| Upstream pin metadata | File list matches design D6 | Static | `for path in src/prompts/system.ts src/prompts/official-system.ts src/prompts/discovery.ts src/prompts/directions.ts src/prompts/deck-framework.ts src/prompts/media-contract.ts src/api/projects.ts src/api/chat.ts src/api/files.ts src/api/comments.ts src/api/research.ts src/api/artifacts.ts src/common.ts; do grep -q "$path" vendor/od-contracts/VENDORED_FROM.md \|\| exit 1; done && ! grep -q "src/index.ts" vendor/od-contracts/VENDORED_FROM.md` | AC-2.3 |
| Top-level repository attribution | Top-level LICENSE | Static | `test -s LICENSE && grep -q "Apache License" LICENSE && grep -q "kokorolx <kokoro.lehoang@gmail.com>" LICENSE` | AC-1.1 |
| Top-level repository attribution | Top-level NOTICE references vendor | Static | `test -s NOTICE && grep -q "vendor/od-contracts/NOTICE" NOTICE` | AC-1.2 |
| Top-level repository attribution | README vendor disclosure section | Static | `grep -qE "^## (Vendored Dependencies\|Attribution)" README.md && grep -q "nexu-io/open-design" README.md` | AC-1.3 |
| Sync script behavior | Refuses to run on dirty vendor | Static | Manual test in T-8 dev evidence (stage uncommitted change in vendor/, run script, expect exit !=0) | AC-10.1 |
| Sync script behavior | Resolves HEAD/tag to full SHA | Static | `bash -n scripts/vendor-sync.sh` + code review | AC-10.2 |
| Sync script behavior | Updates VENDORED_FROM.md atomically | Static | Code review (T-8 acceptance) | (post-PR) |
| Sync script behavior | Sparse + shallow clone | Static | `grep -q "filter=blob:none" scripts/vendor-sync.sh && grep -q "sparse" scripts/vendor-sync.sh` | AC-10.3 |
| Vendor integrity check in CI | Detects missing license | Static | `mv vendor/od-contracts/LICENSE /tmp/lic.bak && (bash scripts/vendor-check.sh; rc=$?; mv /tmp/lic.bak vendor/od-contracts/LICENSE; [ $rc -ne 0 ])` | AC-8.5 |
| Vendor integrity check in CI | Detects missing notice | Static | Same pattern as above for NOTICE | AC-8.5 |
| Vendor integrity check in CI | Detects SHA format violation | Static | Same pattern as above with mangled VENDORED_FROM.md | AC-8.5 |
| Vendor integrity check in CI | Passes on clean scaffold | Static | `bash scripts/vendor-check.sh` → exit 0, stdout contains `vendor-check: ok` | AC-8.5 |
| Published artifact whitelist | npm pack contents | Static | `npm pack --dry-run --json \| jq '.[0].files[].path' \| sort > /tmp/pack.txt && grep -q "dist/" /tmp/pack.txt && ! grep -q "vendor/od-contracts/src/.*\.ts" /tmp/pack.txt && ! grep -q "^src/" /tmp/pack.txt` | AC-3.4 |

### Spec: build-and-ci

| Requirement | Scenario | Test Type | Test File / Command | Acceptance link |
|---|---|---|---|---|
| validate:quick command works on fresh checkout | Fresh install green pipeline | CI + Local | `npm ci && npm run lint && npm run typecheck && npm test && npm run build` | AC-8.1, AC-8.2, AC-8.3, AC-5.1 |
| Lint configuration | eslint.config.js exists | Static | `test -f eslint.config.js && node -e "require('./eslint.config.js')"` | AC-8.1 |
| Lint configuration | Zero warnings policy | Static + Lint | `grep -q "max-warnings 0" package.json` + `npm run lint` exits 0 | AC-8.1 |
| TypeScript configuration | Strict mode + Node16 | Static | `node -e "const t=require('./tsconfig.json'); for (const [k,v] of Object.entries({strict:true,target:'ES2022',module:'Node16',moduleResolution:'Node16',rootDir:'.',outDir:'./dist',skipLibCheck:true})) if(t.compilerOptions[k]!==v){console.error(k,'!=',v,'got',t.compilerOptions[k]);process.exit(1)}"` | AC-4.1 |
| TypeScript configuration | Compilation scope includes vendor | Static | `node -e "const t=require('./tsconfig.json'); const i=t.include; process.exit((i.includes('src/**/*')&&i.includes('vendor/od-contracts/src/**/*'))?0:1)"` | AC-4.2 |
| TypeScript configuration | Scaffold typecheck does not require vendor source | Typecheck | `npm run typecheck` exits 0 with empty vendor/od-contracts/src/ | AC-8.2 |
| TypeScript configuration | SHALL NOT preclude future vendor imports | Manual (code review) | T-15 reviewer confirms `vendor-sync-initial` could land without further tsconfig changes | (deferred AC) |
| Test runner is vitest | vitest.config.ts | Static | `test -f vitest.config.ts && node -e "(async()=>{const m=await import('./vitest.config.ts').catch(()=>null);process.exit(m?0:1)})()"` (or grep-based check) | AC-8.3 |
| Test runner is vitest | At least one bootstrap test passes | Unit | `npm test` — `src/__tests__/server.test.ts` passes | AC-8.3 |
| GitHub Actions CI workflow | Workflow file exists | Static | `test -f .github/workflows/ci.yml && grep -q "on:" .github/workflows/ci.yml` | AC-9.1 |
| GitHub Actions CI workflow | CI runs matrix on Node 20 and 22 | CI | After push, GitHub Actions UI shows matrix [20, 22] both green | AC-9.2 |
| GitHub Actions CI workflow | No deploy step in this PR | Static | `! grep -q "npm publish" .github/workflows/ci.yml` | AC-9.4 |
| Build produces executable | build script | Static | `node -e "const p=require('./package.json'); process.exit(p.scripts.build==='tsc && shx chmod +x dist/src/server.js'?0:1)"` | AC-3.6 |
| Build produces executable | Shebang preserved | Static + Build | `npm run build && head -1 dist/src/server.js` → `#!/usr/bin/env node` | AC-5.2, AC-5.3 |
| Integration test placeholder | vitest.integration.config.ts exists | Static | `test -f vitest.integration.config.ts` | AC-8.4 |
| Integration test placeholder | At least one integration test exists | Integration | `npm run test:integration` after build → exits 0 | AC-8.4 |
| Integration test placeholder | Integration test command | Static | `node -e "const p=require('./package.json'); process.exit(p.scripts['test:integration']==='vitest run --config vitest.integration.config.ts'?0:1)"` | AC-3.6 |

---

## US-067 add-github-pages-site

### Spec: pages-site

| Requirement | Scenario | Test Type | Test File / Command | Acceptance link |
|---|---|---|---|---|
| Deployed via GH Actions from master | Push to master triggers deploy | Static | `grep -E "branches:\s*\[master\]" .github/workflows/pages.yml` | spec/pages-site §Site is deployed via GitHub Actions from master |
| Deployed via GH Actions from master | PR does NOT deploy | Static | `grep -c pull_request .github/workflows/pages.yml` → 0 | spec/pages-site §Pull request does not deploy |
| Concurrency prevents mid-flight cancel | Serialized queue | Static | `grep -E "cancel-in-progress:\s*false" .github/workflows/pages.yml` | spec/pages-site §Concurrency prevents mid-flight cancellation |
| Changelog mechanically derived from CHANGELOG.md | Editing CHANGELOG updates site | Static | `grep -c '{{CHANGELOG_CONTENT}}' site/changelog.html.template` → 1 | spec/pages-site §Changelog page is mechanically derived |
| Version headings addressable by URL fragment | `<h3 id="0-17-0">` rendered | Unit | `src/__tests__/build-site.test.ts` (case: id="0-17-0") | spec/pages-site §Version headings are addressable |
| Unreleased section anchor | `<h3 id="0-17-0-unreleased">` rendered | Static | `grep 'id="0-17-0-unreleased"' dist/site/changelog.html` after `npm run build:site` | spec/pages-site §Unreleased section gets a stable anchor |
| Duplicate version slugs cause build failure | Throw on collision | Unit | `src/__tests__/build-site.test.ts` (case: throws on duplicate slugs) | spec/pages-site §Duplicate version slugs |
| Exactly one `<h1>` on changelog page | Single h1 chrome | Unit | `src/__tests__/build-site.test.ts` (case: produces exactly one `<h1>`) | spec/pages-site §Changelog page contains exactly one `<h1>` |
| Build deterministic and offline | Local build produces all files | Unit | `src/__tests__/build-site.test.ts` (case: emits all six expected files) | spec/pages-site §Build is deterministic and reproducible locally |
| Build deterministic and offline | Offline-safe | Static | `scripts/build-site.mjs` uses only `node:fs`/`node:path`/`marked` — no network | spec/pages-site §Build is offline-safe |
| Build fails loudly on unsubstituted tokens | No token leakage | Unit | `src/__tests__/build-site.test.ts` (case: substitutes every template token) | spec/pages-site §Build fails loudly on unsubstituted tokens |
| Site weight ≤ 100 KB raw on-disk | Total size budget | Unit | `src/__tests__/build-site.test.ts` (case: keeps the total weight under 100 KB) | spec/pages-site §Site weight stays under 100 KB |
| Test discoverable by vitest config | Suite runs with `npm test` | Static + Unit | Path `src/__tests__/build-site.test.ts` matches `vitest.config.ts` include glob; vitest output lists the suite | spec/pages-site §Test is discoverable by the existing vitest config |
| Site assets excluded from npm tarball | `npm pack` does not include `dist/site/*` | Unit | `src/__tests__/build-site.test.ts` (case: does not ship dist/site/ in the npm tarball) | spec/pages-site §Site assets are excluded from the published npm tarball |
| Site fully usable with JS disabled | No external scripts | Static | `grep -E '<script src=' site/*.html dist/site/*.html` → 0 matches | spec/pages-site §No external scripts |
| Site fully usable with JS disabled | Inline scripts small or absent | Static | `grep -c '<script' site/*.html dist/site/*.html` → 0 | spec/pages-site §Inline scripts are small or absent |
| Pages workflow permissions are minimal | Exactly 3 keys | Static | YAML-parse `.github/workflows/pages.yml` — top-level `permissions:` has `contents: read`, `pages: write`, `id-token: write` only | spec/pages-site §Pages workflow has minimum required permissions |
| README badge links to live site | URL appears at top | Static | `head -3 README.md \| grep -c "https://nano-step.github.io/open-design-mcp/"` → ≥1 | spec/pages-site §README badge links to live site |

### Live-site smoke checks (post-deploy)

| Check | Command | Expected |
|---|---|---|
| Landing page reachable | `curl -fsS -o /dev/null -w "%{http_code}" https://nano-step.github.io/open-design-mcp/` | `200` |
| Changelog reachable | `curl -fsS -o /dev/null -w "%{http_code}" https://nano-step.github.io/open-design-mcp/changelog.html` | `200` |
| Anchor deep-link | `curl -fsS https://nano-step.github.io/open-design-mcp/changelog.html \| grep -c 'id="0-17-0"'` | ≥1 |

---

## Cross-cutting

| Concern | Where validated |
|---|---|
| Apache 2.0 §4(a)-(d) compliance | AC-1, AC-2 (LICENSE/NOTICE/VENDORED_FROM artifacts + top-level disclosure) |
| HARNESS validation ladder for `lane:normal` × `change-type:infrastructure` | AC-8 (validate:quick + integration; no E2E required per HARNESS table) |
| Public-API-contracts hard gate (MCP tool surface) | AC-6 (initialize handshake + empty tools/list — establishes the contract baseline) |
| Force-push exception (pre-PR author rewrite) | Issue #2 comment documenting the exception; HARNESS_BACKLOG entry T-17 |

## Validation Output

Raw command transcripts captured in `docs/evidence/init-package-scaffold/validation.md` after T-14.
