# Design: init-package-scaffold

## Architecture

```
open-design-mcp/  (npm package, stdio MCP server)
│
├── package.json           ESM, type:"module", bin → dist/server.js, engines node>=20
├── tsconfig.json          target ES2022, module Node16, strict
├── eslint.config.js       flat config (ESLint 9.x), TS-aware
├── vitest.config.ts       node env, globals, v8 coverage
├── .github/workflows/ci.yml   validate:quick on push + PR
│
├── src/
│   ├── server.ts          MCP stdio entry point (#!/usr/bin/env node)
│   ├── tools/             (folder placeholder, empty in this PR)
│   ├── od-client.ts       (stub: thin undici HTTP wrapper)
│   ├── pipeline.ts        (stub: orchestrator placeholder)
│   └── __tests__/
│       └── server.test.ts initialize-handshake test
│
├── vendor/
│   └── od-contracts/
│       ├── LICENSE        Apache 2.0 from upstream
│       ├── NOTICE         §4(d) attribution
│       ├── VENDORED_FROM.md   pin SHA 7766582, list 13 files
│       └── README.md      usage + re-sync instructions
│       └── src/           (empty in this PR; vendor-sync-initial change copies files)
│
├── scripts/
│   ├── vendor-sync.sh     re-sync upstream subtree at given SHA
│   └── vendor-check.sh    verify vendor invariants (LICENSE/NOTICE exist, SHA matches)
│
├── docs/                  (existing from harness install)
├── openspec/              (existing)
├── .opencode/             (existing)
├── LICENSE                Apache 2.0 (this repo)
├── NOTICE                 attribution to nexu-io/open-design
└── README.md              package usage + vendor disclosure
```

## Decisions

### D1 — MCP SDK package: `@modelcontextprotocol/sdk` ^1.29.0

**Decision**: Depend on `@modelcontextprotocol/sdk` ^1.29.0.

**Alternative considered**:
- `@modelcontextprotocol/server` (split package): rejected — verified on npm `2026-05-17` is at `2.0.0-alpha.2` (pre-alpha, unstable surface). Canonical reference servers (`servers/src/memory`) still use `@modelcontextprotocol/sdk` ^1.29.0.
- `@modelcontextprotocol/sdk` v2.x: rejected — pre-alpha, breaking changes expected.

**Citation**: [`servers/src/memory/package.json`](https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/memory/package.json) commit on `2026-05-17`:
```json
"dependencies": { "@modelcontextprotocol/sdk": "^1.29.0" }
```

### D2 — Transport: stdio

**Decision**: Use `StdioServerTransport`. No HTTP/SSE option in this PR.

**Alternative considered**:
- HTTP/SSE transport: rejected. Distribution model is `npx open-design-mcp` spawned as subprocess by host agents (OpenCode, Claude Code, Cursor) — these always use stdio. HTTP would only be needed for cross-machine usage which is out of scope.

**Citation**: [MCP TypeScript SDK server docs](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/docs/server.md):
> "For local integrations where the client spawns the server as a child process, use `StdioServerTransport`."

### D3 — Module system: ESM (`"type": "module"`)

**Decision**: Native ESM with `.js` import specifiers, target ES2022, module Node16.

**Alternative considered**:
- CommonJS: rejected. All canonical MCP servers use ESM. ESM has faster cold-start (matters because MCP servers cold-boot every chat session) and aligns with TC39 direction.

**Citation**: [`servers/src/memory/package.json`](https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/memory/package.json) sets `"type": "module"`.

### D4 — Build tool: tsc (not tsup, not esbuild)

**Decision**: Pure `tsc` for build, no bundling.

**Rationale**:
- All canonical MCP servers use bare `tsc` (verified across `servers/src/memory`, `servers/src/filesystem`, `servers/src/github`).
- MCP servers ship to `npx` where install time dominates startup; we want a flat `node_modules/` with dependencies, not a bundled blob (npx caches `node_modules`, not bundles).
- Single entry point — no bundling benefit.
- tsc preserves shebang line natively when target file starts with `#!/usr/bin/env node`.

**Build script**:
```bash
"build": "tsc && shx chmod +x dist/server.js"
```

`shx chmod +x` is needed because tsc does not preserve executable bits.

### D5 — Node minimum: 20

**Decision**: `"engines": { "node": ">=20" }`. CI tests on Node 20 and 22.

**Rationale**:
- Node 18 lacks `globalThis.crypto` by default (breaks SDK's Web Crypto usage for any future OAuth-aware tools). Documented SDK pitfall.
- Node 20 is current LTS as of 2026-05; Node 22 also LTS.
- All canonical MCP servers require Node 20+.

### D6 — Vendor layout: `vendor/od-contracts/`

**Decision**: Vendor a subset of `nexu-io/open-design@7766582` (Apache 2.0) into `vendor/od-contracts/src/`.

**Files in scope (this PR creates structure only; vendor-sync-initial change copies content)**:
- Runtime (7): `prompts/system.ts`, `prompts/official-system.ts`, `prompts/discovery.ts`, `prompts/directions.ts`, `prompts/deck-framework.ts`, `prompts/media-contract.ts`, `api/projects.ts`
- Type-only (6): `api/chat.ts`, `api/files.ts`, `api/comments.ts`, `api/research.ts`, `common.ts`, `index.ts`
- Total: 13 files, 152.3 KB, 2,509 lines (transitive closure of `composeSystemPrompt`)
- External npm deps: **none** — `composeSystemPrompt` does not import `zod` despite contracts package declaring it.

**Alternatives considered**:
- `git subtree`: rejected — pulls full upstream history (200+ MB), can't cherry-pick by path.
- `git submodule`: rejected — checkout downloads full upstream working tree, painful for contributors.
- `npm install github:nexu-io/open-design#sha`: rejected — upstream `packages/contracts/package.json` is `"private": true`, not published, and is a monorepo subpath.
- Manual copy + sync script: **chosen** — surgical, audit-friendly, license-compliant.

### D7 — Apache 2.0 compliance

**Required artifacts in this PR**:
1. `vendor/od-contracts/LICENSE` — copy of Apache 2.0 (§4(a))
2. `vendor/od-contracts/NOTICE` — attribution per §4(d), template:
   ```
   This product includes software from open-design (https://github.com/nexu-io/open-design)
   Copyright (c) 2024-2026 Nexu Labs
   Licensed under Apache License 2.0
   ```
3. `vendor/od-contracts/VENDORED_FROM.md` — commit SHA, date, file list, sync instructions
4. Top-level `NOTICE` — references the vendor NOTICE
5. Top-level `LICENSE` — Apache 2.0 (our own repo license)
6. README disclosure section (vendor table — Bun/Kubernetes pattern)

**Future modifications**: If we ever modify a vendored file, that file gets a "MODIFICATIONS" header block per §4(b). No file is modified in this PR.

**Citation**: [Apache 2.0 §4](https://www.apache.org/licenses/LICENSE-2.0.txt).

### D8 — Sync script approach

**Decision**: Shallow clone upstream at pinned SHA, sparse-checkout `packages/contracts/src/{prompts,api,common.ts,index.ts}` only, rsync into `vendor/od-contracts/src/`, update `VENDORED_FROM.md`.

**Script lives at**: `scripts/vendor-sync.sh`.

**Adapted from**: Kubernetes' `hack/update-vendor.sh` + Bun's `scripts/bootstrap.sh` patterns. Key invariants:
- Refuse to run if `vendor/od-contracts/` has uncommitted changes
- Always pin to a full SHA (resolve HEAD/tags to SHA)
- Generate diff report so reviewers see exactly what upstream changed
- Update `VENDORED_FROM.md` atomically with each sync

**Validation script** `scripts/vendor-check.sh` runs in CI:
- `vendor/od-contracts/LICENSE` exists
- `vendor/od-contracts/NOTICE` exists
- `vendor/od-contracts/VENDORED_FROM.md` exists and contains a 40-char SHA
- No `.ts` file in vendor lacks an upstream copyright header

### D9 — Testing strategy

**Decision**: vitest with two test surfaces:

1. **Unit** (`src/__tests__/*.test.ts`) — pure function tests, no subprocess. Run in `validate:quick`.
2. **Integration** (`tests/integration/*.test.ts` with `vitest.integration.config.ts`) — spawns `node dist/server.js` as subprocess, uses `StdioClientTransport` from SDK to send JSON-RPC `initialize` request. Validates the smoke-test acceptance criterion.

**vitest.config.ts**:
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: { provider: 'v8' },
  },
});
```

**vitest.integration.config.ts**: separate file, includes `tests/integration/**`. Run via `npm run test:integration` (matches HARNESS validate:integration command).

### D10 — Lint: ESLint 9 flat config

**Decision**: `eslint.config.js` flat config, `@typescript-eslint` plugin, `--max-warnings 0` enforced.

**Rule baseline**: TypeScript recommended + strict + stylistic. No `eslint-config-airbnb` etc. — minimal rule set, fail on warnings.

### D11 — CI: GitHub Actions, single job

**Decision**: `.github/workflows/ci.yml` runs on push + PR:
1. Setup Node 20 + Node 22 (matrix)
2. `npm ci`
3. `npm run lint`
4. `npm run typecheck`
5. `npm test`
6. `npm run build`
7. `bash scripts/vendor-check.sh`

No deploy step (publish lane is its own future change).

### D12 — Server bootstrap behavior

**In this PR**, `src/server.ts`:
- Boots `McpServer` with `name: "open-design-mcp"`, `version: "0.1.0"`
- Registers zero tools (later changes register them)
- Connects to `StdioServerTransport`
- Handles SIGINT/SIGTERM cleanly (close transport, exit 0)
- Logs to stderr only: `[open-design-mcp] starting...` and `[open-design-mcp] ready`

This shape satisfies the smoke test: an MCP client can send `initialize`, receive a valid response with empty tools list, and the server exits cleanly on SIGINT.

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Upstream `composeSystemPrompt` signature changes after vendor-sync | Medium (rolling release model, no tags) | High (build break) | `vendor-check.sh` runs typecheck against vendored files; integration test exercises composer. Sync script generates diff so reviewers catch signature drift before commit. |
| `@modelcontextprotocol/sdk` v2 breaking changes | Low (6-month maintenance promise on v1) | Medium (rewrite of server.ts) | Pin to `^1.29.0`. Track v2 release notes; migrate in a dedicated change when v2 is stable. |
| Node 20 → Node 22 LTS migration breaks something | Low | Low | CI matrix already covers both. |
| Vendor folder triggers npm publish bloat | Low | Low | `"files"` whitelist in package.json restricts published artifacts to `dist/` + vendor LICENSE/NOTICE/VENDORED_FROM only — not vendored `.ts` sources (they're rebuilt). |
| Apache 2.0 attribution review fails legal audit | Low | High | Followed Bun/Kubernetes pattern; explicit §4(a)-(d) checklist in this design; vendor-check.sh enforces in CI. |
| OD daemon API drift (future BYOK changes) | Medium (not in this PR's scope) | Medium | Out of scope here. Integration tests will catch in BYOK pipeline PR. |

## Out of scope (not in this PR)

- Actual vendoring of contract files (vendor-sync-initial change does the first copy)
- MCP tool implementations
- BYOK pipeline (composeSystemPrompt invocation, /api/proxy stream)
- OD HTTP client functions
- npm publish
- README beyond stub usage section

## Open questions resolved during research

- ✅ SDK package name → `@modelcontextprotocol/sdk` (not `/server`, verified on npm)
- ✅ Transport → stdio (verified canonical pattern)
- ✅ Build tool → tsc (verified across all canonical servers)
- ✅ ESM vs CJS → ESM (verified canonical)
- ✅ Vendor approach → manual copy + sync script (research conclusion)
- ✅ Upstream SHA to pin → `7766582f0bd75d2dce31b2f9db01a482af801897` (resolved)
- ✅ External npm deps for composeSystemPrompt → none (verified via dependency trace)
- ✅ File list for vendor → 13 files, mapped (verified via transitive closure analysis)

## Decision log (links to evidence)

- Memory: `~/.nano-brain/memory/2026-05-17-open-design-mcp-research-synthesis.md`
- Background research sessions:
  - `bg_b6636dd4` — MCP SDK best practices
  - `bg_98e157fe` — Apache 2.0 vendoring patterns
  - `bg_fa2cf09e` — File transitive closure mapping
