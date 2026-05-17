# Design: init-package-scaffold

> **Revision history**
> - **v1** (commit fa311dc) — initial proposal, passed `openspec validate --strict`.
> - **v2** (this revision) — incorporates HARNESS deep-design verdicts from Metis (`bg_20408de7`) + Oracle (`bg_17c5c2f9`). 7 BLOCKING gaps fixed across D6 (rootDir + closure + module resolution), new D13 (package.json shape locked), Apache 2.0 modifications template, and spec/task corrections.

## Architecture

```
open-design-mcp/  (npm package, stdio MCP server)
│
├── package.json           ESM, type:"module", bin → dist/src/server.js, engines node>=20
├── tsconfig.json          target ES2022, module Node16, strict, rootDir "."
├── eslint.config.js       flat config (ESLint 9.x), TS-aware
├── vitest.config.ts       node env, globals, v8 coverage
├── vitest.integration.config.ts   integration tests (spawn built binary)
├── .nvmrc                 "20" (local dev convenience)
├── .github/workflows/ci.yml   validate:quick + integration on push + PR
│
├── src/
│   ├── server.ts          MCP stdio entry point (#!/usr/bin/env node)
│   ├── tools/             (folder placeholder, empty in this PR)
│   ├── od-client.ts       (stub: thin undici HTTP wrapper, void export)
│   ├── pipeline.ts        (stub: orchestrator placeholder, void export)
│   └── __tests__/
│       └── server.test.ts shebang + console.log static checks
│
├── tests/
│   └── integration/
│       └── initialize-handshake.test.ts   spawn dist/src/server.js, send JSON-RPC initialize
│
├── vendor/
│   └── od-contracts/
│       ├── LICENSE              Apache 2.0 copied from upstream@7766582
│       ├── NOTICE               §4(d) attribution
│       ├── VENDORED_FROM.md     pinned SHA 7766582 + 13-file list
│       ├── README.md            usage + re-sync instructions
│       └── src/                 (empty in scaffold PR; vendor-sync-initial change copies files)
│           └── .gitkeep         keeps folder under version control
│
├── scripts/
│   ├── vendor-sync.sh     shallow+sparse clone, copy 13 files, post-sync patch chat.ts, update VENDORED_FROM.md
│   └── vendor-check.sh    LICENSE/NOTICE/VENDORED_FROM/SHA-format invariants
│
├── docs/                  (existing from harness install)
├── openspec/              (existing)
├── .opencode/             (existing)
├── LICENSE                Apache 2.0 (this repo)
├── NOTICE                 attribution to nexu-io/open-design
└── README.md              package usage + vendor disclosure
```

After `npm run build`, the layout becomes:

```
dist/
├── src/
│   ├── server.js          executable, with shebang (chmod +x)
│   ├── tools/
│   ├── od-client.js
│   ├── pipeline.js
│   └── __tests__/        (test sources compiled too but unused at runtime)
└── vendor/
    └── od-contracts/
        └── src/           (empty in scaffold PR; populated by vendor-sync-initial)
```

The `bin` field points at `dist/src/server.js`. Future `src/` code imports vendored modules via `'../../vendor/od-contracts/src/prompts/system.js'` — that relative path resolves identically in source and in `dist/` because tsc preserves the directory shape under the rootDir.

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

**Build script** (final form in D13, here for the rationale):
```bash
"build": "tsc && shx chmod +x dist/src/server.js"
```

`shx chmod +x` is needed because tsc does not preserve executable bits. The path is `dist/src/server.js` (not `dist/server.js`) because `rootDir: "."` in tsconfig preserves the `src/` segment in the output tree — see D6 "Compilation strategy" for why this is required to compile vendored files in the same invocation.

### D5 — Node minimum: 20

**Decision**: `"engines": { "node": ">=20" }`. CI tests on Node 20 and 22.

**Rationale**:
- Node 18 lacks `globalThis.crypto` by default (breaks SDK's Web Crypto usage for any future OAuth-aware tools). Documented SDK pitfall.
- Node 20 is current LTS as of 2026-05; Node 22 also LTS.
- All canonical MCP servers require Node 20+.

### D6 — Vendor layout: `vendor/od-contracts/`

**Decision**: Vendor a subset of `nexu-io/open-design@7766582` (Apache 2.0) into `vendor/od-contracts/src/`.

**Files in scope (this PR creates structure only; `vendor-sync-initial` change copies content)** — 13 files, transitive closure of `composeSystemPrompt` verified against upstream:

| Category | File | Imports |
|---|---|---|
| Runtime | `prompts/system.ts` | (entry) |
| Runtime | `prompts/official-system.ts` | — |
| Runtime | `prompts/discovery.ts` | `directions.js` |
| Runtime | `prompts/directions.ts` | — |
| Runtime | `prompts/deck-framework.ts` | — |
| Runtime | `prompts/media-contract.ts` | — |
| Runtime | `api/projects.ts` | `chat.js` |
| Type-only | `api/chat.ts` | `files`, `comments`, `research` (extensionless — must patch — see "Post-sync patch") |
| Type-only | `api/files.ts` | `common.js`, `artifacts.js` |
| Type-only | `api/comments.ts` | (none in closure) |
| Type-only | `api/research.ts` | (none in closure) |
| Type-only | `api/artifacts.ts` | `common.js` |
| Type-only | `common.ts` | — |

**Excluded** (from v1):
- `index.ts` — poisonous barrel re-exports 30+ unvendored modules (`errors.js`, `tasks.js`, `examples.js`, `sse/*`, `analytics/*`, plugin/critique). Our code never imports from this barrel; we hit subpaths directly. (Oracle F2.)

**Total**: 13 files, ~155 KB. External npm deps: **none** (`composeSystemPrompt` does not import `zod` despite the contracts package declaring it).

**Post-sync patch** — required because upstream uses `moduleResolution: "Bundler"` and 3 imports in `chat.ts` omit `.js` extensions, which fails our Node16 module resolution (Oracle F3, TS2835):

```typescript
// chat.ts (after vendor-sync.sh runs, lines 1-2 + line 8):
// MODIFICATION (open-design-mcp): Added .js extensions to relative imports
// for Node16 moduleResolution compatibility. See vendor/od-contracts/VENDORED_FROM.md
// modifications log. Original: import type { ProjectFile } from './files';
import type { ProjectFile } from './files.js';
import type { ResearchOptions } from './research.js';
// ... and the comments import on line 7
```

`vendor-sync.sh` applies this patch automatically after rsync via a `sed -i` rule (deterministic, idempotent) and appends a modifications log entry to `VENDORED_FROM.md`. This satisfies Apache 2.0 §4(b) ("cause any modified files to carry prominent notices stating that you changed the files") — see "Apache 2.0 modifications template" below.

**Compilation strategy** — single `tsconfig.json` covers both `src/` and `vendor/`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "rootDir": ".",
    "outDir": "./dist",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "declaration": false,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "vendor/od-contracts/src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "tests/**/*"]
}
```

Why `rootDir: "."` not `"./src"`: tsc rejects emit when a referenced file falls outside `rootDir` (TS6059). Widening to `"."` lets a single tsc invocation compile both `src/` and `vendor/od-contracts/src/` into a parallel `dist/src/` + `dist/vendor/od-contracts/src/` tree. Relative imports between them are preserved 1:1 in the output, so `import './../../vendor/od-contracts/src/prompts/system.js'` works at both compile time and runtime. (Oracle F1.)

The downside: the binary path moves from `dist/server.js` to `dist/src/server.js`. The `bin` field, build script, and integration test are updated accordingly (D13 + tasks T-3, T-5, T-10).

**Alternatives considered**:
- `git subtree`: rejected — pulls full upstream history (200+ MB), can't cherry-pick by path.
- `git submodule`: rejected — checkout downloads full upstream working tree, painful for contributors.
- `npm install github:nexu-io/open-design#sha`: rejected — upstream `packages/contracts/package.json` is `"private": true`, not published, and is a monorepo subpath.
- Two tsconfigs (`tsconfig.json` for src/, `tsconfig.vendor.json` for vendor/): rejected — doubles build invocations and complicates `tsc --noEmit` for typecheck.
- TypeScript path mapping (`"@od-contracts/*"`): rejected — requires `tsconfig-paths` resolver at runtime or post-build rewriting. Adds complexity for no clear benefit.
- Manual copy + sync script with single tsconfig and `rootDir: "."`: **chosen** — surgical, audit-friendly, license-compliant, single-build.

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

### D13 — package.json locked shape

**Decision**: The exact `package.json` produced by T-3 SHALL match the shape below. This section is the authoritative source for the package.json contents — task T-3 references this section, not D6 (which only covers vendor strategy).

```json
{
  "name": "open-design-mcp",
  "version": "0.1.0",
  "description": "MCP stdio server bridging coding agents to Open Design daemon (BYOK flow with full systemPrompt fidelity).",
  "license": "Apache-2.0",
  "mcpName": "io.github.nano-step/open-design-mcp",
  "author": "kokorolx <kokoro.lehoang@gmail.com>",
  "homepage": "https://github.com/nano-step/open-design-mcp",
  "bugs": "https://github.com/nano-step/open-design-mcp/issues",
  "repository": {
    "type": "git",
    "url": "https://github.com/nano-step/open-design-mcp.git"
  },
  "type": "module",
  "bin": { "open-design-mcp": "dist/src/server.js" },
  "engines": { "node": ">=20" },
  "files": [
    "dist",
    "vendor/od-contracts/LICENSE",
    "vendor/od-contracts/NOTICE",
    "vendor/od-contracts/VENDORED_FROM.md",
    "LICENSE",
    "NOTICE",
    "README.md"
  ],
  "scripts": {
    "build": "tsc && shx chmod +x dist/src/server.js",
    "prepare": "npm run build",
    "lint": "eslint src --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "watch": "tsc --watch",
    "vendor:sync": "bash scripts/vendor-sync.sh",
    "vendor:check": "bash scripts/vendor-check.sh"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "undici": "^7.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@vitest/coverage-v8": "^2.1.8",
    "eslint": "^9.0.0",
    "shx": "^0.3.4",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.1.8"
  }
}
```

**Rationale for each field choice** (cross-references):
- `name`, `license`, `repository`, `homepage`, `bugs`: identity per npm convention.
- `mcpName`: emerging convention from `modelcontextprotocol/servers` repo, used by future tool registries.
- `type: "module"`, `engines.node: ">=20"`: D3, D5.
- `bin`: D6 (compiled binary path is `dist/src/server.js` after rootDir fix).
- `files`: ship `dist/` (compiled code + vendored compiled JS) plus the vendor LICENSE/NOTICE/VENDORED_FROM as proof of attribution. Source `.ts` excluded — consumers don't need them. Top-level `LICENSE`, `NOTICE`, `README.md` always include via npm default but listed explicitly for safety.
- `dependencies` — `@modelcontextprotocol/sdk` ^1.29.0 (D1), `undici` for HTTP client (used in future BYOK pipeline change but listed now so we can stub the import in T-5; no code reads from network in this PR), `zod` ^3.23.8 (used by SDK and by future tool schemas).
- `devDependencies` — `typescript-eslint` is the modern flat-config package (replaces separate `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`); `shx` provides cross-platform `chmod`; `@vitest/coverage-v8` enables coverage reporting.

**Caret vs tilde semver** — `@modelcontextprotocol/sdk: "^1.29.0"` is used (not `~1.29.0`). The SDK is in active development; minor versions ship features but the team has not historically broken subpath imports. Oracle F4 confirms canonical MCP servers use caret. If a future minor breaks our usage, we pin downward and document in a follow-up change.

### D14 — Apache 2.0 modifications template

When a vendored file is modified (only `chat.ts` initially, per D6 post-sync patch), a header comment SHALL be prepended to the file:

```typescript
// MODIFICATION (open-design-mcp):
// Added explicit `.js` extensions on relative imports for Node16
// moduleResolution. The upstream uses `moduleResolution: "Bundler"`
// which permits extensionless imports; our package uses Node16 which
// forbids them (TS2835).
// Original lines (verbatim):
//   import type { ProjectFile } from './files';
//   import type { ... } from './comments';
//   import type { ResearchOptions } from './research';
// Modified by: open-design-mcp vendor-sync.sh
// Modification date: <ISO timestamp>
// Patent grant and license terms unchanged — these edits remain
// under the original Apache License 2.0 per §4 of the license.

// (upstream copyright header below — preserved verbatim per §4(c))
```

`VENDORED_FROM.md` carries a `## Modifications` section listing every modified file and the rationale, kept in sync by `vendor-sync.sh`. This satisfies Apache 2.0 §4(b).

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
- ✅ File list for vendor → 13 files (v2: includes `artifacts.ts`, excludes `index.ts`)
- ✅ tsc rootDir + vendor compilation strategy → single tsconfig, `rootDir: "."`, binary at `dist/src/server.js` (v2, fixes Oracle F1)
- ✅ Upstream extensionless imports → `chat.ts` patched via `vendor-sync.sh` post-sync sed rule (v2, fixes Oracle F3)
- ✅ MCP protocol version → SDK 1.29 reports `LATEST_PROTOCOL_VERSION = '2025-11-25'`, `DEFAULT_NEGOTIATED_PROTOCOL_VERSION = '2025-03-26'` (used in concrete spec scenarios)

## Decision log (links to evidence)

- Memory: `~/.nano-brain/memory/2026-05-17-open-design-mcp-research-synthesis.md`
- Background research sessions:
  - `bg_b6636dd4` — MCP SDK best practices
  - `bg_98e157fe` — Apache 2.0 vendoring patterns
  - `bg_fa2cf09e` — File transitive closure mapping
- Deep-design (HARNESS gate) sessions:
  - `bg_20408de7` — Metis scope/risk analysis (verdict: REVISE — 4 blocking gaps)
  - `bg_17c5c2f9` — Oracle architecture review (verdict: REVISE-DESIGN — 3 blocking gaps incl. F1 rootDir, F2 closure, F3 module resolution)
- Revision applied in v2 (this document):
  - D6 rewritten to specify compilation strategy + post-sync patch
  - D13 added (package.json locked shape)
  - D14 added (Apache 2.0 modifications template)
  - Specs updated: concrete protocolVersion, vendor reachability weakened to "SHALL NOT preclude"
  - Tasks updated: T-2 acceptance no longer depends on T-7, T-3 full devDeps list, T-3b adds `.nvmrc`
