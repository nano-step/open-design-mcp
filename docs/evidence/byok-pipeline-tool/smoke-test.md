# Smoke Test — byok-pipeline-tool

**Date**: 2026-05-18
**Driver**: `npm run build && node <smoke-driver.mjs>` (raw JSON-RPC over stdio)
**OD daemon**: `http://ai-open-design:7456` (production internal)
**BYOK proxy**: `https://ai-proxy.thnkandgrow.com/v1` with model `open-design`
**Server commit**: `b7db3a4` (PR-E head, pre-merge build matching v0.7.0 surface)

## Purpose

T-14 of [`openspec/changes/byok-pipeline-tool/tasks.md`](../../../openspec/changes/byok-pipeline-tool/tasks.md). Exercise all 5 MCP tools end-to-end against a real OD daemon + real BYOK provider. Mock-based integration tests cover wire-format correctness; this run proves the surface works against the systems users will actually point it at.

## Method

A standalone Node driver spawns `dist/src/server.js` with stdio piped, sends raw JSON-RPC, captures the response per tool. Output is sanitized via regex (`BYOK_API_KEY` literal + `sk-...` pattern) before being saved to this doc — no credential material is committed.

## Environment vars passed to the spawned server

| Var | Value (redacted) |
|---|---|
| `OD_DAEMON_URL` | `http://ai-open-design:7456` |
| `OD_API_TOKEN` | _(empty — daemon binds to loopback within the shared docker network)_ |
| `BYOK_BASE_URL` | `https://ai-proxy.thnkandgrow.com/v1` |
| `BYOK_API_KEY` | `<<BYOK_API_KEY_REDACTED>>` |
| `BYOK_MODEL` | `open-design` |
| `BYOK_PROVIDER` | `openai` (OpenAI-compatible proxy) |

## Results

### 1. `initialize` + `notifications/initialized`

```json
{
  "serverInfo": { "name": "open-design-mcp", "version": "0.1.0" },
  "protocolVersion": "2025-03-26",
  "capabilities": { "tools": { "listChanged": true } }
}
```

Note: `serverInfo.version: "0.1.0"` is the hard-coded literal in `src/server.ts` per HB-5 (separate change). Published npm version is `0.7.0`.

### 2. `tools/list`

```json
{
  "count": 5,
  "names": [
    "od_generate_design",
    "od_get_project",
    "od_lint_artifact",
    "od_list_projects",
    "od_save_artifact"
  ]
}
```

✅ Matches design §B1 exactly.

### 3. `od_list_projects`

3 projects returned from the live daemon:

```
3 project(s):
- fridge-mgmt-1778999695: Fridge Management — Responsive Web
- 494ed0a4-1295-4c70-ac25-7bca227c5a0f: Prototype · 5/17/2026
- probe-test: probe
```

`structuredContent.projects` includes id + name for each. ✅

### 4. `od_get_project` (against `fridge-mgmt-1778999695`)

```
Project: fridge-mgmt-1778999695 — Fridge Management — Responsive Web
Files (1):
- freshkeep.html (html)
```

Parallel fetch of project + files succeeded; merged response includes 1 artifact file. ✅

### 5. `od_lint_artifact` — minimal valid HTML

Input: `<!doctype html><html><body><h1>Smoke</h1></body></html>`

Output:
```
Lint: 0 findings.
```

Clean HTML accepted. ✅

### 6. `od_save_artifact`

Input:
- `identifier`: `smoke-test-1779080720` (timestamp-suffixed slug)
- `title`: `PR-F smoke artifact`
- `html`: minimal HTML with timestamp

Output:
```
Saved: smoke-test-1779080720 → /app/.od/artifacts/2026-05-18-05-05-20-smoke-test-1779080720/index.html
URL: /artifacts/2026-05-18-05-05-20-smoke-test-1779080720/index.html
```

Daemon persisted to disk, returned both the filesystem path and the web URL. ✅

### 7. `od_generate_design` (the BYOK pipeline)

Input:
- `prompt`: `"A simple landing page hero for a SaaS called "Smoke", with one CTA button."`
- `kind`: `prototype`

Output: **1982 chars** of accumulated SSE delta text. Excerpt (first 250 + last 250):

```
Got it — hero section for a SaaS called "Smoke," single CTA. A few quick questions before I build:

<question-form id="discovery" title="Quick brief — 30 seconds">
{
  "description": "Let me lock in the details before building the Smoke hero.",
  "questions": [
    {
      "id": "tagline",
      "label": "What does Smoke do? (one sentence or tagline)",
      ...
```

```
...
    {
      "id": "platform",
      "label": "Target platform",
      "type": "radio",
      "required": true,
      "options": [
        "Responsive web (desktop + mobile)",
        "Desktop web only"
      ]
    }
  ]
}
</question-form>
```

✅ The vendored `composeSystemPrompt()` produced upstream-fidelity output: the LLM correctly emitted Open Design's `<question-form>` discovery markup on turn 1 (matching the upstream charter rules in `vendor/od-contracts/src/prompts/system.ts`). End-to-end SSE accumulation through OD's `/api/proxy/openai/stream` works.

## Acceptance — T-14 success criteria

| Criterion | Status |
|---|---|
| All 5 tools callable end-to-end | ✅ |
| Read tools return live daemon data | ✅ (3 real projects) |
| Write tool persists artifact + returns path/url | ✅ |
| Lint tool returns findings (or "0 findings") | ✅ |
| BYOK pipeline streams via `composeSystemPrompt()` | ✅ (1982 chars, valid `<question-form>`) |
| No secret leakage in any output | ✅ (regex-sanitized; original key never appears) |
| Server boots with just `OD_DAEMON_URL` (BYOK lazy) | ✅ (verified by integration test `tests/integration/tools-byok.test.ts` "missing BYOK" case + reviewed by Oracle §B14) |

## Notes

- `OD_API_TOKEN` is empty against the internal daemon (loopback-equivalent on shared docker network). Hosted OD with basic auth — tracked as **HB-6** for a follow-up `od-auth-modes` OpenSpec change.
- The smoke driver does not run in CI; it requires real credentials. Re-run manually before each major release.
- Sanitized full output saved at `/tmp/od-smoke-results.json` during the smoke run, not committed.
