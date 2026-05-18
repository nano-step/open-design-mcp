# Proposal: byok-pipeline-tool

**Lane × Change Type:** `lane:high-risk × change-type:user-feature`
**Risk Flags:** 4 (external-providers, user-facing-surface, env-var-reads, multi-service-coordination)
**Issue:** [#6](https://github.com/nano-step/open-design-mcp/issues/6)

## Why

`open-design-mcp@0.3.0` exposes zero MCP tools — `tools/list` returns `[]`. MCP clients (OpenCode, Claude Code, Cursor) see the server as functional but useless. This change activates the actual feature surface by wrapping the OD daemon's HTTP API as 5 MCP tools, including the BYOK pipeline that proxies AI generation through OD with full upstream `composeSystemPrompt()` fidelity.

This is the **single most important change** in the project's roadmap. Until it ships, `open-design-mcp` is a scaffold.

## What Changes

### 5 new MCP tools registered via `server.registerTool()`

1. **`od_list_projects`** (read-only) — wraps `GET /api/projects` → returns project list with id, name, status, metadata
2. **`od_get_project`** (read-only) — wraps `GET /api/projects/:id` + `GET /api/projects/:id/files`, merges into one response (project meta + artifact list)
3. **`od_generate_design`** (BYOK streaming) — composes systemPrompt via vendored `composeSystemPrompt()`, POSTs to `/api/proxy/<provider>/stream` on OD daemon, accumulates SSE delta events into a single text response
4. **`od_save_artifact`** (write) — wraps `POST /api/artifacts/save` with `{identifier, title, html}` → returns saved path + URL
5. **`od_lint_artifact`** (validation) — wraps `POST /api/artifacts/lint` with `{html}` → returns findings + agentMessage

### New env var contract (5 vars)

| Var | Purpose | Required | Validation strategy |
|---|---|---|---|
| `OD_DAEMON_URL` | OD HTTP endpoint | yes (all tools) | fail-fast at startup |
| `OD_API_TOKEN` | OD bearer (optional, default empty) | no | parse at startup |
| `BYOK_BASE_URL` | AI provider base URL | only for `od_generate_design` | lazy (fail per-call if missing) |
| `BYOK_API_KEY` | AI provider key | only for `od_generate_design` | lazy |
| `BYOK_MODEL` | model id | only for `od_generate_design` | lazy |
| `BYOK_PROVIDER` | one of `openai`/`anthropic`/`azure`/`google`/`ollama` (default `openai`) | no (default) | lazy |

### New files

- `src/config.ts` — Zod env var schema, split into `core` (validated at startup) and `byok` (validated lazily)
- `src/od-client.ts` — typed HTTP client wrapping all 5 OD daemon endpoints (uses `fetch` + `AbortSignal.timeout`)
- `src/sse-parser.ts` — minimal SSE parser for OD's `event: <name>\ndata: <json>\n\n` wire format (NOT a generic SSE parser — specific to OD's wrapped format)
- `src/tools/list-projects.ts` — `od_list_projects` registration + handler
- `src/tools/get-project.ts` — `od_get_project`
- `src/tools/generate-design.ts` — `od_generate_design` (the big one)
- `src/tools/save-artifact.ts` — `od_save_artifact`
- `src/tools/lint-artifact.ts` — `od_lint_artifact`
- `src/tools/index.ts` — registers all 5 tools on the server (called from `src/server.ts`)

### Modified files

- `src/server.ts` — import + call `registerAllTools(server)`; no other changes
- `README.md` — Tools section listing all 5 with env var requirements + example MCP client config

### New tests

- `src/__tests__/config.test.ts` — Zod schema validation (valid/invalid env shapes)
- `src/__tests__/sse-parser.test.ts` — OD-specific SSE parsing (start/delta/end/error events, partial chunks, multi-line data)
- `src/__tests__/od-client.test.ts` — mocked fetch for each OD endpoint (uses `vi.mock('node:fetch')` or local HTTP server)
- `src/__tests__/tools/list-projects.test.ts` — tool handler with mocked OD client
- `src/__tests__/tools/get-project.test.ts`
- `src/__tests__/tools/generate-design.test.ts` — mocked SSE stream from OD
- `src/__tests__/tools/save-artifact.test.ts`
- `src/__tests__/tools/lint-artifact.test.ts`
- `tests/integration/tools-list-count.test.ts` — full MCP handshake → `tools/list` returns 5 tools with correct schemas
- `tests/integration/tool-error-codes.test.ts` — call each tool with invalid input, assert correct MCP error codes

### Validation ladder remains 6 commands

No new ladder commands. Test count grows: 7 unit → ~25 unit, 5 integration → 7 integration.

## Non-Goals (v0.4.0 scope)

- **No skill body / design system pass-through** in `od_generate_design`. v0.4 only passes `metadata.kind` + `userInstructions` + `projectInstructions` to `composeSystemPrompt`. Full skill/DS context is v0.5.
- **No real streaming to MCP client** — MCP protocol doesn't support it. We accumulate full response server-side and emit progress notifications for heartbeat.
- **No live OD daemon calls in CI** — OD daemon won't be available in GitHub Actions. All tests use mocked OD client. Live smoke test is documented + manual.
- **No multi-project parallel calls** — one tool call = one OD interaction.
- **No caching** — every `od_list_projects` re-fetches from OD.
- **No artifact polling/streaming progress** — `od_generate_design` is synchronous from MCP's perspective.
- **No env var auto-detection** — `BYOK_PROVIDER` must be explicit if not `openai`.
- **No HB-5 fix** — `serverInfo.version` stays hardcoded for this change.

## Lane Justification

`lane:high-risk` (4 risk flags):
1. ✅ External providers gate triggered (BYOK = AI provider calls)
2. ✅ New user-facing surface (5 tools, first activation)
3. ✅ New env var reads (4-5 new vars depending on tool)
4. ✅ Multi-service coordination (MCP ↔ OD ↔ AI provider)

High-risk lane mandates:
- Parallel Metis + Oracle deep-design (this proposal triggers it)
- Pre-implementation review with cross-critique
- Larger test surface (~25 unit + 7 integration)
- Oracle Review Gate before merge

## Pre-design research (already complete)

| Agent | Task ID | Outcome |
|---|---|---|
| `explore` | `bg_4b89b6ac` | OD daemon API surface mapped — 5 endpoints, exact request/response shapes, SSE wire format documented |
| `explore` | `bg_f0891416` | `composeSystemPrompt` signature confirmed — sync, pure, all-optional params; closure compiles clean |
| `librarian` | `bg_92bb5469` | MCP SDK 1.29 tool registration patterns — `server.registerTool()` canonical, Zod schemas, no streaming, progress notifications |
| `librarian` | `bg_d1ad72a5` | BYOK best practices — fetch + AbortSignal, error mapping, two-layer auth, fail-fast env validation |

Synthesis: `~/.nano-brain/memory/2026-05-17-byok-pipeline-tool-research-synthesis.md`

## Acceptance Summary

1. `tools/list` returns 5 tools (list-projects, get-project, generate-design, save-artifact, lint-artifact)
2. Each tool has Zod `inputSchema` validated by SDK before handler runs
3. `od_generate_design` correctly composes systemPrompt via vendored composeSystemPrompt() with `streamFormat: 'plain'` to suppress tool-call narration
4. All 5 tools wrap OD endpoints with proper error mapping (401→isError, 429→isError, 5xx→isError, network→isError)
5. SSE parser handles all 4 event types from OD daemon (start, delta, end, error) including partial chunks across reads
6. Env vars validated at startup (core) or lazily (BYOK) per the table above
7. Test suite grows: ~25 unit tests + 7 integration tests
8. CI green on Node 20 + Node 22
9. Oracle Review Gate: PASS
10. Auto-published as v0.4.0 (feat → minor bump)
11. Manual smoke test against live OD daemon at `http://ai-open-design:7456` documented in evidence/
