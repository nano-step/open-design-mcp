# Decisions: init-package-scaffold

Locked decisions from the first OpenSpec change. Refer back here when any future change is tempted to overturn one of these.

Source of truth: [`openspec/changes/init-package-scaffold/design.md`](../../openspec/changes/init-package-scaffold/design.md) decisions D1–D14. After archive, the change folder moves out of `openspec/changes/`; this file preserves the decision summary.

| ID | Decision | Why | Reversal cost |
|---|---|---|---|
| D1 | MCP SDK = `@modelcontextprotocol/sdk` ^1.29.0 | Canonical reference for every server in `modelcontextprotocol/servers`. v2 is pre-alpha. | Low — caret allows minor bumps; major requires migration plan. |
| D2 | Transport = stdio (`StdioServerTransport`) | Distribution is `npx open-design-mcp` spawned as subprocess by host agents. | High — switching to HTTP/SSE means a different entrypoint and lifecycle model. |
| D3 | Module system = ESM (`"type": "module"`), Node16 module resolution | All canonical MCP servers use ESM; faster cold-start. | High — touches every import statement and tsconfig. |
| D4 | Build tool = `tsc` (not tsup / esbuild) | Canonical pattern. Single entry, no bundling benefit. Preserves shebang. | Low — drop-in replacement possible. |
| D5 | Node minimum = 20 | Web Crypto for future OAuth; SDK convention. | Low — bump to 22 is one-line change. |
| D6 | Vendor layout: manual copy + sync script under `vendor/od-contracts/` | Surgical (200MB upstream → 13 files locally). Audit-friendly. `git subtree` and submodule rejected. tsconfig `rootDir: "."`, `include: ["src/**/*", "vendor/od-contracts/src/**/*"]`. | Medium — moving to subtree requires re-architecting LICENSE/NOTICE plumbing. |
| D7 | Apache 2.0 compliance via 4 artifacts: top-level LICENSE, top-level NOTICE, vendor/LICENSE, vendor/NOTICE | Explicit §4(a)–(d) compliance. Pattern matches Bun / Kubernetes. | Low — additive only; cannot reverse without removing vendor. |
| D8 | Sync script: shallow + sparse clone, post-sync patch for chat.ts, atomic VENDORED_FROM.md update | Reproducible, bandwidth-cheap, lawful. | Low — script is self-contained. |
| D9 | Testing = vitest, two configs (unit + integration) | Canonical for MCP servers; v8 coverage built-in. | Medium — affects all test files. |
| D10 | Lint = ESLint 9 flat config, `typescript-eslint` strict, `--max-warnings 0` | Modern config shape; zero-tolerance for warnings catches drift early. | Low. |
| D11 | CI = GitHub Actions, matrix Node 20+22, all steps required, no publish | Catches platform drift. Publish lane is its own change. | Low — workflow is one YAML. |
| D12 | Server bootstrap = empty tools list, stderr-only logging, SIGINT/SIGTERM clean shutdown | Smoke-testable. Establishes the protocol baseline for future tools. | Low. |
| D13 | `package.json` locked shape (see design.md D13) — `name`, `bin`, `engines`, `files`, scripts, dependencies, devDependencies all enumerated. Author: `kokorolx <kokoro.lehoang@gmail.com>` | Single source of truth — task T-3 references this. No ambiguity. | Low. |
| D14 | Apache 2.0 §4(b) "MODIFICATION" header template for any vendored file we patch | Required by license. Reproducibly applied by `vendor-sync.sh`. | Low. |

## Process decisions (not in design.md but locked by this change)

| Topic | Decision | Source |
|---|---|---|
| Engineering workflow | Every feature/fix/refactor goes through OpenSpec proposal → deep-design → specs → implement → validate → review → PR → archive. See [`docs/HARNESS.md`](../HARNESS.md). | First execution of HARNESS workflow end-to-end. |
| Force-push exception | Allowed pre-PR for author-identity rewrites only. Forbidden post-PR per HARNESS § Forbidden Practices #7. | Issue [#2 comment](https://github.com/nano-step/open-design-mcp/issues/2). |
| Deep-design re-check | Reuse subagent session_id (preserves full context) for re-verification after revision. ~10× cheaper than fresh review. | Sessions `bg_20408de7` (Metis) + `bg_17c5c2f9` (Oracle), then Metis re-check in same session. |

## Out of scope (future changes)

- `vendor-sync-initial`: first execution of `scripts/vendor-sync.sh`. Adds the 13 actual `.ts` files. Touches the §4(b) modifications log when patching `chat.ts`.
- BYOK pipeline: implements `od_generate_design` tool. First consumer of `OD_DAEMON_URL`, `OD_API_TOKEN`, `BYOK_*` env vars. Triggers `external-providers` hard gate.
- Tool implementations: 6 read tools (mirror official `od mcp`) + 4–6 write tools (create_project, generate_design, save_artifact, lint_artifact, etc.). Each its own OpenSpec change.
- npm publish (`0.1.0` → registry). Separate change with release procedure + tagging.
