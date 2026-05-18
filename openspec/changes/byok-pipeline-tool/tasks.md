# Tasks: byok-pipeline-tool

Ordered execution plan. High-risk lane → larger task list with explicit verification gates.

## PR slicing (decided 2026-05-18)

Per HARNESS.md high-risk lane policy, work ships as 6 small single-issue PRs (not one monolithic PR). Self code-review on every PR; Oracle review gate on PR-E.

| Slice | Sub-issue | Tasks covered | Risk |
|---|---|---|---|
| PR-A: config + SSE parser | [#7](https://github.com/nano-step/open-design-mcp/issues/7) | T-1, T-2, T-3 | low |
| PR-B: typed OD HTTP client | [#8](https://github.com/nano-step/open-design-mcp/issues/8) | T-4 | low |
| PR-C: read-only tools | [#9](https://github.com/nano-step/open-design-mcp/issues/9) | T-5, T-6, T-10 (partial), T-11, T-12, T-13 (partial) | medium |
| PR-D: write tools | [#10](https://github.com/nano-step/open-design-mcp/issues/10) | T-8, T-9, T-10 (partial), T-13 (partial) | medium |
| PR-E: BYOK streaming + Oracle gate | [#11](https://github.com/nano-step/open-design-mcp/issues/11) | T-7, T-13 (partial), T-19 | **high** |
| PR-F: live smoke + README + v0.4.0 + archive | [#12](https://github.com/nano-step/open-design-mcp/issues/12) | T-14, T-15, T-16, T-17 (per-PR), T-18 (per-PR), T-20 | low |

T-17 (atomic commits) and T-18 (push + open PR) are per-slice operations folded into each PR rather than batched at the end. Epic [#6](https://github.com/nano-step/open-design-mcp/issues/6) closes when #12 lands.

## T-1: Pre-flight baseline

Confirm master is clean + branch ready.

- `git status` clean on `feat/byok-pipeline-tool`
- `bash scripts/vendor-check.sh` → `vendor-check: ok`
- All existing tests still pass (`npm test` 7 unit, `npm run test:integration` 5 integration)
- `openspec change validate byok-pipeline-tool --strict --no-interactive` → valid

## T-2: Config module (`src/config.ts`)

- Zod schema split: `coreEnvSchema` (validated at startup) + `byokEnvSchema` (validated lazily)
- Export `coreConfig` (frozen object) + `getByokConfig()` function
- Unit test: `src/__tests__/config.test.ts` — happy path + each invalid permutation

**Verify:** `npm test -- config.test` → all green; `npm run typecheck` clean.

## T-3: SSE parser (`src/sse-parser.ts`)

- `OdSseEvent` union type + `parseOdSse(body: ReadableStream)` async generator
- Handles start/delta/end/error events
- Buffer trailing partial blocks correctly across reads
- Unit test: `src/__tests__/sse-parser.test.ts` covers:
  - Single-event stream (start + delta + end)
  - Multi-delta stream (5+ deltas)
  - Error event mid-stream
  - Chunk boundary in middle of `data:` line
  - Empty stream
  - Multi-line `data:` payloads

**Verify:** `npm test -- sse-parser.test` → all green.

## T-4: OD client (`src/od-client.ts`)

- `OdClient` class with 6 methods: `listProjects`, `getProject`, `listFiles`, `proxyStream`, `saveArtifact`, `lintArtifact`
- Each method takes `AbortSignal` parameter (composable with timeout)
- Authorization header only if `OD_API_TOKEN` non-empty
- Unit test: `src/__tests__/od-client.test.ts` mocks `globalThis.fetch` for each endpoint

**Verify:** `npm test -- od-client.test` → all green; `npm run typecheck` clean.

## T-5: Tool — `od_list_projects` (`src/tools/list-projects.ts`)

- Export `registerListProjects(server, client)` function
- Zod `inputSchema: z.object({})`, `outputSchema` defines `projects: Project[]`
- Handler: call `client.listProjects(signal)`, return text summary + structuredContent
- Error mapping per B8
- Unit test: `src/__tests__/tools/list-projects.test.ts` — happy path + 5xx + network error

**Verify:** `npm test -- list-projects.test` → all green.

## T-6: Tool — `od_get_project` (`src/tools/get-project.ts`)

- Zod `inputSchema: z.object({projectId: z.string()})`
- Handler: call BOTH `client.getProject(id)` and `client.listFiles(id)` in parallel, merge
- 404 mapping → `isError: true` with "Project not found"
- Unit test similar coverage

**Verify:** `npm test -- get-project.test` → all green.

## T-7: Tool — `od_generate_design` (the big one) (`src/tools/generate-design.ts`)

- Zod `inputSchema` per B9 (prompt, kind, userInstructions, projectInstructions)
- Handler steps:
  1. Call `getByokConfig()` — catch ZodError → return `isError: true` with "BYOK not configured"
  2. Build `messages: [{role: 'user', content: prompt}]`
  3. Call `composeSystemPrompt({metadata: {kind}, userInstructions, projectInstructions, streamFormat: 'plain'})`
  4. Build `ProxyStreamRequest: {baseUrl, apiKey, model, systemPrompt, messages}`
  5. Compose AbortSignal (timeout + extra.signal)
  6. Call `client.proxyStream(req, provider, signal)` → Response with stream body
  7. Pipe through `parseOdSse(response.body)`:
     - On `start`: maybe log model
     - On `delta`: accumulate text, emit progress every 25th delta
     - On `error`: return `isError: true` with message
     - On `end`: break loop
  8. Return `{content: [{type: 'text', text: accumulated}]}`
- Unit test: `src/__tests__/tools/generate-design.test.ts`:
  - Mocks `client.proxyStream` to return a `ReadableStream<Uint8Array>` of synthetic SSE
  - Tests happy path, BYOK missing, SSE error event, mid-stream timeout

**Verify:** `npm test -- generate-design.test` → all green.

## T-8: Tool — `od_save_artifact` (`src/tools/save-artifact.ts`)

- Zod `inputSchema` per B9 (identifier regex, title, html)
- Handler: call `client.saveArtifact(req)`, return text with path + url
- Unit test

**Verify:** `npm test -- save-artifact.test` → all green.

## T-9: Tool — `od_lint_artifact` (`src/tools/lint-artifact.ts`)

- Zod `inputSchema: z.object({html: z.string().min(1)})`
- Handler: call `client.lintArtifact(html)`, return `agentMessage` as text
- Unit test

**Verify:** `npm test -- lint-artifact.test` → all green.

## T-10: Tool index (`src/tools/index.ts`)

- Export `registerAllTools(server, client)` that calls each tool's `register*` function
- Each tool file owns its registration; index just orchestrates

**Verify:** `npm run typecheck` clean.

## T-11: Wire into server (`src/server.ts`)

- Import + call `registerAllTools(server, new OdClient(coreConfig.OD_DAEMON_URL, coreConfig.OD_API_TOKEN))`
- No other changes; `setRequestHandler(ListToolsRequestSchema, ...)` from v0.1 should be REMOVED (tools are now registered properly via SDK)
- Run `npm run build` — verify `dist/src/tools/*.js` produced

**Verify:** `npm run build` exit 0; build artifacts present.

## T-12: OD mock server for integration tests (`tests/integration/helpers/od-mock-server.ts`)

- Node `http` server on ephemeral port
- Accepts route handlers via API: `mock.on('GET', '/api/projects', () => ({status: 200, body: {...}}))`
- SSE streaming support: `mock.onStream('POST', '/api/proxy/openai/stream', async function*() { yield 'event: delta\ndata: {"delta":"hi"}\n\n' })`
- Returns `{url, close}`
- Unit test for the mock itself (sanity check)

**Verify:** `npm run typecheck` clean.

## T-13: Integration tests — tools/list count + error codes

- `tests/integration/tools-list-count.test.ts` — connect via SDK Client, assert `tools.length === 5`, each has description + inputSchema
- `tests/integration/tool-error-codes.test.ts` — call each tool with invalid input, assert -32602 (Zod validation) and isError:true for runtime errors

**Verify:** `npm run test:integration` → ≥7 tests pass.

## T-14: Live smoke test doc (`docs/evidence/byok-pipeline-tool/smoke-test.md`)

- Document commands to run against `http://ai-open-design:7456`:
  1. `od_list_projects` → expect 3+ projects (we know the daemon has them)
  2. `od_get_project` with a known id → expect project + files
  3. `od_generate_design` with prompt "create a simple HTML page that says hello" → expect non-empty text
  4. `od_save_artifact` with the generated HTML
  5. `od_lint_artifact` with same HTML
- Capture transcript from one successful run + paste into doc

**Verify:** doc exists, includes real transcript with timestamps.

## T-15: README update

- New "MCP Tools" section listing all 5 tools with brief descriptions
- New "Environment Variables" expanded with BYOK setup
- OpenCode MCP config example uses the new env vars

**Verify:** `cat README.md | grep -c "^### od_"` ≥ 5; doc reads fluently.

## T-16: Full validation ladder + evidence doc

Run all 6 commands, capture to `docs/evidence/byok-pipeline-tool/validation.md`:
1. `npm run lint`
2. `npm run typecheck`
3. `npm test` (≥20 unit tests)
4. `npm run build`
5. `bash scripts/vendor-check.sh`
6. `npm run test:integration` (≥7 integration tests)

**Verify:** All 6 exit 0. Evidence captured.

## T-17: Atomic commits

Commit structure:
1. `feat(config): add Zod env var validation` — src/config.ts + tests
2. `feat(sse): add OD-specific SSE parser` — src/sse-parser.ts + tests
3. `feat(od): add typed OD HTTP client` — src/od-client.ts + tests
4. `feat(tools): register 5 MCP tools (list, get, generate, save, lint)` — all tool files + their unit tests + tools/index.ts
5. `feat(server): wire registerAllTools into bootstrap` — src/server.ts
6. `test(integration): od mock server + tools/list count + error codes` — tests/integration/*
7. `docs: add tool documentation + smoke test transcript` — README + evidence/

**Verify:** `git log --oneline | head -7` shows clean conventional commits.

## T-18: Push + open PR

- Push branch
- Open PR with body referencing #6, evidence link, validation summary
- Watch CI Node 20+22 matrix → must be green

**Verify:** CI both matrix entries success.

## T-19: Oracle Review Gate (high-risk mandates this)

Fire Oracle with full repo context:
- 5 tools registered, each with correct Zod schema
- composeSystemPrompt invoked with streamFormat=plain
- SSE parser handles all 4 event types
- Env vars validated correctly (startup vs lazy)
- Error mapping per B8
- No BYOK key in any log
- No live OD calls in CI
- All anti-patterns clean (as any, ts-ignore, console.log in src/, etc.)
- Test count: ≥20 unit + ≥7 integration
- Smoke test transcript present

Oracle MUST return PASS. If REVISE, address findings + re-fire with session_id.

## T-20: Merge + archive + verify v0.4.0

- Squash-merge PR (continuous-release fires)
- Wait for Publish Stable run → v0.4.0 on npm
- `npm view open-design-mcp version` → `0.4.0`
- Smoke test from npm against live OD daemon
- `openspec archive byok-pipeline-tool` + commit
- Verify issue #6 auto-closes
- Update memory: `~/.nano-brain/memory/2026-05-17-byok-pipeline-tool-shipped.md`
