# Proposal: init-package-scaffold

> Open Design MCP has a GitHub repo and engineering harness but no code yet — every downstream feature is blocked until the npm package scaffolding, MCP server entry point, vendor layout, and CI gate exist.

## Problem

The repo currently contains only `docs/`, `openspec/`, and `.opencode/` skill bindings. There is no `package.json`, no TypeScript config, no source tree, no CI workflow, and no place to land MCP tool implementations. Any tool work would either invent these conventions ad-hoc per PR or block on a circular review.

Without a scaffold:
- We cannot run `validate:quick` (no lint/typecheck/test commands wired)
- We cannot land a single tool without also landing build config in the same PR (huge diff, hard to review)
- The vendor strategy for `@open-design/contracts` has no agreed-upon location, which means the first BYOK tool PR would have to relitigate that decision
- New contributors (human or AI) have no signal about ESM/CommonJS, build tool, or test runner choice

The scaffold change consolidates every "first decision" into one reviewable bundle, then unblocks parallel tool work afterward.

## Goal

Land a working, lint-clean, test-passing TypeScript MCP server skeleton that:
- Boots over stdio
- Responds to MCP `initialize` with an empty tool list
- Exits cleanly on SIGINT/SIGTERM
- Passes `validate:quick` (lint + typecheck + test)
- Builds to a runnable `dist/server.js` with a `#!/usr/bin/env node` shebang
- Pins the upstream Apache 2.0 vendor source commit in `vendor/od-contracts/VENDORED_FROM.txt`
- Carries a `NOTICE` file with attribution to `nexu-io/open-design`
- Runs CI on every PR via GitHub Actions

## Non-goals

- **No actual MCP tools.** Tool definitions, BYOK pipeline, HTTP client to OD daemon — all separate changes.
- **No vendor source copy.** This change creates the empty `vendor/od-contracts/` folder with `VENDORED_FROM.txt`, `LICENSE`, and a placeholder `README.md`. The actual subtree copy of `contracts/src/prompts/*.ts` lands in a dedicated `vendor-sync-initial` change so the diff is auditable.
- **No npm publish.** Stays at version `0.1.0` in `package.json`; publish lane is its own change after MVP tools land.
- **No release tooling** (changesets, semantic-release): defer until 1.0.
- **No Docker image.** Distribution model is `npx`; container packaging is a later optimization.
- **No telemetry or analytics.** MCP servers shipped via `npx` should be silent on stdout (stdio is MCP traffic).

## Why this scope is right

This is a "land the infrastructure, then sprint" pattern. Every subsequent issue (vendor sync, tool implementations, BYOK pipeline) becomes a focused PR because the scaffold answered the boring-but-load-bearing questions: module system, build target, test runner, lint rules, CI shape, vendor location, attribution discipline.

Splitting the scaffold further (e.g., separate PRs for build config vs lint vs CI) would create ordering bugs — you cannot land an eslint config before TypeScript is configured, and you cannot land CI before the lint/test commands exist.

## Hard gates triggered

Per `docs/HARNESS.md`:

| Hard gate | Why triggered | Mitigation |
|---|---|---|
| **public-api-contracts** | MCP tool schema surface defined in this PR (server name, capability advertisement) | Server initially advertises empty tools list; schema growth tracked per-tool in dedicated changes. |
| **external-providers** | Future BYOK pipeline calls external AI providers via OD's `/api/proxy/*` route — scaffold establishes the env var contract (`OD_DAEMON_URL`, `OD_API_TOKEN`, `BYOK_*`) | Document env vars in README; no secrets in code or test fixtures. |

Not triggered: `auth` (no user auth in this PR), `data-model` (no persistence), `audit-security` (no logging of user data this PR).

## Lane classification

**Lane: normal.** Touches `public-api-contracts` hard gate but the surface in this PR is just the server bootstrap (empty tools list). Normal lane requires:
- `validate:quick` (lint + typecheck + test) — green
- `test:integration` (vitest integration) — green (minimal: server boots and responds to `initialize`)
- Single Oracle review

**Change type: infrastructure.** Per HARNESS.md table, infra changes:
- Skip E2E (no user surface yet)
- Smoke test sufficient: `node dist/server.js` accepts `initialize` JSON-RPC via stdin
- Self-verify allowed, but we'll do Oracle review anyway because of the `public-api-contracts` gate

## Links

- GitHub issue: [#2 init-package-scaffold](https://github.com/nano-step/open-design-mcp/issues/2)
- Parent: [#1 harness bootstrap](https://github.com/nano-step/open-design-mcp/issues/1)
- Upstream pinned commit: [`nexu-io/open-design@7766582`](https://github.com/nexu-io/open-design/commit/7766582f0bd75d2dce31b2f9db01a482af801897) (2026-05-17, contracts v0.7.0)
- Decision memo: `~/.nano-brain/memory/2026-05-17-open-design-mcp-decision.md`
