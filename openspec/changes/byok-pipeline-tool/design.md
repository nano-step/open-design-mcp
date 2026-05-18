# Design: byok-pipeline-tool

## Context

First activation of the actual MCP feature surface. Until this lands, the server has 0 tools. This change wraps the 5 OD daemon HTTP endpoints as MCP tools and threads the vendored `composeSystemPrompt` into the BYOK pipeline.

Research synthesis: `~/.nano-brain/memory/2026-05-17-byok-pipeline-tool-research-synthesis.md`

## Locked Decisions

### B1: Tool granularity — 5 tools (not fewer, not more)

```
od_list_projects     → GET /api/projects
od_get_project       → GET /api/projects/:id + GET /api/projects/:id/files (merged)
od_generate_design   → POST /api/proxy/<provider>/stream (with composeSystemPrompt)
od_save_artifact     → POST /api/artifacts/save
od_lint_artifact     → POST /api/artifacts/lint
```

**Rationale:** Maps 1:1 to OD's API verbs. Read-only tools (`list_projects`, `get_project`) are safe defaults clients can call without env vars beyond `OD_DAEMON_URL`. Write tools (`save_artifact`) and AI tools (`generate_design`) require their respective env vars.

**Rejected alternatives:**
- Single `od` tool with subcommand — discoverable in `tools/list` is harder
- Merge save+lint into one (`save_with_lint`) — couples write to read, blocks pre-flight lint use case

### B2: Env var validation — split between startup-fail-fast and lazy-per-call

```typescript
// src/config.ts
const coreEnvSchema = z.object({
  OD_DAEMON_URL: z.string().url(),
  OD_API_TOKEN: z.string().default(''),   // empty string = no auth header
});

const byokEnvSchema = z.object({
  BYOK_BASE_URL: z.string().url(),
  BYOK_API_KEY: z.string().min(1),
  BYOK_MODEL: z.string().min(1),
  BYOK_PROVIDER: z.enum(['openai', 'anthropic', 'azure', 'google', 'ollama']).default('openai'),
});

export const coreConfig = coreEnvSchema.parse(process.env);  // throws at startup

export function getByokConfig(): z.infer<typeof byokEnvSchema> {
  return byokEnvSchema.parse(process.env);  // throws lazily, caught by od_generate_design handler
}
```

**Rationale:** Read-only tools shouldn't crash the server if BYOK is unconfigured. Many OpenCode users will only configure `OD_DAEMON_URL` initially and explore via `od_list_projects` before setting up BYOK keys.

**Rejected:** Fail-fast everything at startup — would break the discovery experience.

### B3: SSE parser is OD-specific, not generic

OD daemon emits a wrapped format, NOT raw OpenAI SSE:

```
event: start
data: {"model": "claude-3-5-sonnet-20241022"}

event: delta
data: {"delta": "Hello "}

event: delta
data: {"delta": "world"}

event: end
data: {}
```

Errors arrive as:
```
event: error
data: {"message": "Invalid API key", "code": "UNAUTHORIZED"}
```

```typescript
// src/sse-parser.ts
export interface OdSseStart { type: 'start'; model?: string }
export interface OdSseDelta { type: 'delta'; delta: string }
export interface OdSseEnd   { type: 'end' }
export interface OdSseError { type: 'error'; message: string; code?: string }
export type OdSseEvent = OdSseStart | OdSseDelta | OdSseEnd | OdSseError;

export async function* parseOdSse(body: ReadableStream<Uint8Array>): AsyncGenerator<OdSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';  // keep incomplete trailing block
      for (const block of blocks) {
        const evt = parseBlock(block);
        if (evt) yield evt;
      }
    }
    if (buffer.trim()) {
      const evt = parseBlock(buffer);
      if (evt) yield evt;
    }
  } finally {
    reader.releaseLock();
  }
}
```

**Rationale:** Generic SSE libs (`eventsource-parser`) understand the W3C spec; OD's format is a tiny subset. 30 lines of code is more maintainable than a dep.

### B4: Streaming → server-side accumulate + progress notifications

MCP protocol does not support streaming responses. Pattern:

```typescript
let accumulated = '';
let deltaCount = 0;
for await (const evt of parseOdSse(response.body!)) {
  if (evt.type === 'delta') {
    accumulated += evt.delta;
    deltaCount++;
    if (deltaCount % 25 === 0 && progressToken) {
      await server.server.notification(
        { method: 'notifications/progress', params: { progress: deltaCount, progressToken } },
        { relatedRequestId: extra?.requestId }
      );
    }
  }
  if (evt.type === 'error') {
    return { content: [{ type: 'text', text: evt.message }], isError: true };
  }
  if (evt.type === 'end') break;
}
return { content: [{ type: 'text', text: accumulated }] };
```

**Rationale:** Every 25 deltas gives a heartbeat without overwhelming the channel. `progressToken` is opt-in by client; if unset, we silently skip.

### B5: composeSystemPrompt invocation for od_generate_design

```typescript
import { composeSystemPrompt } from '../../vendor/od-contracts/src/prompts/system.js';
import type { ProjectMetadata } from '../../vendor/od-contracts/src/api/projects.js';

const systemPrompt = composeSystemPrompt({
  metadata: { kind: args.kind ?? 'prototype' } as ProjectMetadata,
  userInstructions: args.userInstructions,
  projectInstructions: args.projectInstructions,
  streamFormat: 'plain',   // suppresses tool-call narration — we're in API mode
});
```

**Rationale:** v0.4 ships the minimum viable composition. Tool input schema accepts:
- `kind: 'prototype' | 'deck' | 'template' | 'design-system' | 'image' | 'video' | 'audio'` (required, defaults to `prototype`)
- `userInstructions?: string`
- `projectInstructions?: string`
- `prompt: string` (the user's actual ask)
- `messages?: ChatMessage[]` (multi-turn history, optional)

**Rejected for v0.4:** Skill body, design system body, memory body — require additional OD endpoint calls to fetch. v0.5 expands.

### B6: AbortController + timeout composition

```typescript
const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS ?? '60000', 10);
const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
if (extra?.signal) signals.push(extra.signal);
const combined = AbortSignal.any(signals);
const res = await fetch(url, { method: 'POST', headers, body, signal: combined });
```

**Rationale:** 60s default (vs the 30s suggested by librarian). AI generation can legitimately take 45-50s for complex prompts. Configurable via env var.

### B7: OD client returns typed responses

```typescript
// src/od-client.ts
export class OdClient {
  constructor(private base: string, private token: string = '') {}

  async listProjects(signal: AbortSignal): Promise<ProjectsResponse> { ... }
  async getProject(id: string, signal: AbortSignal): Promise<ProjectDetailResponse> { ... }
  async listFiles(id: string, signal: AbortSignal): Promise<ProjectFilesResponse> { ... }
  async proxyStream(req: ProxyStreamRequest, provider: ProviderId, signal: AbortSignal): Promise<Response> { ... }
  async saveArtifact(req: SaveArtifactRequest, signal: AbortSignal): Promise<SaveArtifactResponse> { ... }
  async lintArtifact(html: string, signal: AbortSignal): Promise<ArtifactLintResponse> { ... }
}
```

Types: `ProjectsResponse`, `ProjectDetailResponse`, etc. — imported from `vendor/od-contracts/src/api/*.js` (already vendored).

**Rationale:** Single class, typed responses, easy to mock in tests. `OD_API_TOKEN` is empty string by default → no `Authorization` header sent (loopback OD does not require auth).

### B8: Error mapping table

| Source | MCP behavior |
|---|---|
| HTTP 401 from OD | `isError: true`, text: `"OD auth failed — check OD_API_TOKEN"` |
| HTTP 403 from OD | `isError: true`, text: `"OD rejected request (SSRF protection?)"` |
| HTTP 404 from OD on `/projects/:id` | `isError: true`, text: `"Project not found: <id>"` |
| HTTP 429 from OD | `isError: true`, text: `"Rate limited — retry shortly"` |
| HTTP 5xx from OD | `isError: true`, text: `"OD daemon error: <statusText>"` |
| Network error / timeout | `isError: true`, text: `"OD daemon unreachable: <reason>"` |
| Zod validation fail on input | Throw `McpError(-32602, ...)` — SDK handles |
| Missing BYOK env vars on `od_generate_design` | `isError: true`, text: `"BYOK not configured: missing BYOK_BASE_URL/BYOK_API_KEY/BYOK_MODEL"` |
| SSE `event: error` | `isError: true`, text: `<event.message>` |

**Rationale:** Tool-level errors (`isError: true`) are LLM-recoverable (the model sees the message and can fix its inputs). MCP error codes are reserved for protocol-level failures (validation, server crash).

### B9: Tool input schemas (locked)

All use Zod, exported from each tool file.

```typescript
// list-projects
inputSchema: z.object({})

// get-project
inputSchema: z.object({
  projectId: z.string().min(1).describe('Project ID from od_list_projects'),
})

// generate-design
inputSchema: z.object({
  prompt: z.string().min(1).describe('Design request from the user'),
  kind: z.enum(['prototype','deck','template','design-system','image','video','audio'])
    .optional()
    .default('prototype'),
  userInstructions: z.string().optional(),
  projectInstructions: z.string().optional(),
})

// save-artifact
inputSchema: z.object({
  identifier: z.string().regex(/^[a-z0-9-]+$/).min(3).max(64)
    .describe('URL-safe slug, lowercase with dashes'),
  title: z.string().min(1).max(200),
  html: z.string().min(1).describe('Full HTML document'),
})

// lint-artifact
inputSchema: z.object({
  html: z.string().min(1).describe('Full HTML document to lint'),
})
```

### B10: Output schemas — only on read tools (skip for generate/save/lint v0.4)

`od_list_projects` and `od_get_project` return structured data (project list with id/name/status). Define `outputSchema` so MCP clients can validate. The other 3 tools return plain text (generated content / save URL / lint findings as prose) — text content only, no structured output for v0.4.

**Rationale:** Structured output is most useful when the LLM caller wants to programmatically navigate. For generation tools, the LLM consumes the text directly. v0.5 can add structured outputs for save/lint if needed.

### B11: Integration tests — local HTTP mock, NOT live OD

```typescript
// tests/integration/helpers/od-mock-server.ts
export function startOdMockServer(): Promise<{ url: string; close: () => void }> {
  // node:http server that responds to /api/projects, /api/projects/:id, etc.
  // Each test sets up the responses it expects.
}
```

Reasons NOT to call live OD daemon in CI:
- OD daemon won't be available in GitHub Actions
- Tests would be non-deterministic
- Slow CI

**Live smoke test** is a manual ladder, documented in `docs/evidence/byok-pipeline-tool/smoke-test.md`. Maintainer runs once per release.

### B12: One file per tool

```
src/
├── server.ts                       # imports + calls registerAllTools()
├── config.ts                       # env validation
├── od-client.ts                    # OD HTTP client
├── sse-parser.ts                   # OD SSE parser
└── tools/
    ├── index.ts                    # registerAllTools(server, deps)
    ├── list-projects.ts
    ├── get-project.ts
    ├── generate-design.ts
    ├── save-artifact.ts
    └── lint-artifact.ts
```

**Rationale:** Each tool file owns its Zod schema, handler, and unit tests. `index.ts` orchestrates registration. Server stays thin.

### B13: composeSystemPrompt is vendored, NOT in npm dist tarball

`package.json` `files` field already excludes `vendor/od-contracts/src/*.ts` and includes only `dist/`. Build emits `dist/vendor/od-contracts/src/prompts/system.js`, which IS included. Verify by `npm pack --dry-run` before commit.

### B14: Logging — stderr only, no key leaks

`console.error()` allowed (already in lint config). Critical rule: **never log `BYOK_API_KEY`, even truncated**. Log:
- Tool name + duration on every call
- HTTP status from OD
- Error class on failure
- NEVER: env vars containing `KEY`, `TOKEN`, `SECRET`

Optionally add a log sanitizer (`maskSecrets(record)`) but not in v0.4.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OD daemon unreachable during test | high | low | Mock OD via local HTTP server in `tests/integration/helpers/od-mock-server.ts`. Live smoke is manual. |
| `composeSystemPrompt` output too large (>100KB) for some MCP transports | medium | medium | Document size in README. Don't fix in v0.4 — defer to v0.5 with explicit `maxPromptBytes` config. |
| BYOK key accidentally logged | medium | high | Lint rule `no-console: ['error', { allow: ['error', 'warn'] }]` already in place. Add unit test that verifies no `console.log` exists in handler files. |
| SSE chunk boundary in middle of `event:` line | medium | medium | Parser keeps `buffer` of incomplete trailing block; tested explicitly. |
| AI provider 429 emits as OD `event: error` | medium | low | Mapped per B8 — `isError: true` with retry guidance. |
| User invokes `od_generate_design` without BYOK env vars | high | low | Lazy `getByokConfig()` throws on missing vars → handler catches → returns `isError: true` with config instructions. |
| `OD_DAEMON_URL` set to invalid URL | low | high | Zod `.url()` validation at startup → server crashes with clear error. |
| 60s timeout too short for long generations | medium | medium | Configurable via `REQUEST_TIMEOUT_MS` env var. |

## Open Questions

These need Metis/Oracle input:

- **Q1:** Should we add a `od_health` tool (ping `/`) for connectivity probing? Scope-creep risk vs UX win. Recommendation: NO for v0.4, add if requested.
- **Q2:** Should integration tests EVER hit the live OD daemon? Recommendation: NO in CI; documented manual smoke test only.
- **Q3:** Default `BYOK_PROVIDER`: `openai` (broadest compatibility) or none-required (force user choice)? Recommendation: default `openai`.
- **Q4:** Tool error responses include OD error code in structuredContent for clients that want it, or just text? Recommendation: just text for v0.4.

## Out of scope (locked from research)

- Real streaming to MCP client (protocol limitation)
- Skill body / design system pass-through to composeSystemPrompt (v0.5)
- Memory body pass-through (v0.5+)
- Multi-project parallel calls
- Caching layer
- `od_health` ping tool
- Sampling / Resources / Prompts capabilities (still tools-only)
- HB-5 dynamic `serverInfo.version` (still hardcoded)
