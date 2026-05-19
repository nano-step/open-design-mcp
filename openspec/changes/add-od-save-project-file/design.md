# Design: add-od-save-project-file

**Companion to**: `proposal.md`
**Issue**: [#53](https://github.com/nano-step/open-design-mcp/issues/53)
**Deep-design status:** REVISED after Metis + Oracle gap analysis (2026-05-19). Both reports identified the same 2 BLOCKING issues (type duplication, hand-rolled error mapping) plus 9 non-blocking refinements. All folded into this revision.

## Goals

1. Close the `generate → lint → save → display` loop entirely within MCP tools.
2. Match the daemon's POST `/api/projects/:id/files` shape verbatim — no client-side translation.
3. Disambiguate from `od_save_artifact` so future agents pick the right tool.
4. Add minimal new surface: 1 typed client method + 1 tool module + tests + docs.
5. **Reuse vendor types and centralized error mapping; do not duplicate.**

## Non-goals

- Binary file uploads (`multipart/form-data`).
- Multi-file batch uploads.
- File deletion / rename via MCP.
- Auto-save coupling with `od_generate_design`.

## Architecture

### Layer 1 — `OdClient.saveProjectFile`

New method on the existing typed HTTP client. Sits next to `listFiles` (`src/od-client.ts:112-120`) so all project-file CRUD lives together.

**Use vendor types (BLOCKING fix B1):**
- `ProjectFile` and `ProjectFileResponse` already exist in `vendor/od-contracts/src/api/files.ts:32-51`.
- `ArtifactManifest` exists in `vendor/od-contracts/src/api/artifacts.ts:94-129`.
- These types are MORE precise than anything we'd hand-write (12-value `ProjectFileKind` union, `version: 1` literal, `JsonValue` metadata, includes `stubGuardWarning?` for the daemon's regression-stub case).
- `od-client.ts:25` already imports `ProjectFilesResponse` from the same module — we extend that import.

**Use `postJson<T>` (Oracle N3):**
- `OdClient` has a private `postJson<T>(path, body, signal)` helper at `src/od-client.ts:244-265` used by every POST method.
- It handles `headers()` (auth), JSON serialization, and uniform error throwing.
- Do NOT use raw `fetch`.

**Mandatory `AbortSignal` (Oracle N1):**
- Every other client method takes `signal: AbortSignal` required (e.g. `listProjects(signal)` at `od-client.ts:98`, `saveArtifact(req, signal)` at `od-client.ts:182`).
- Optional→required composition happens in the tool layer (see Layer 2).

```typescript
// src/od-client.ts (additions)

// Extend existing vendor import at line 25 to add ProjectFile + ProjectFileResponse:
import type {
  ProjectFile,
  ProjectFileResponse,
  ProjectFilesResponse,  // already imported today
} from '../vendor/od-contracts/src/api/files.js';

/**
 * Request body for POST /api/projects/:id/files.
 * Only this type is defined locally — the response uses the vendor's
 * canonical ProjectFile / ProjectFileResponse types.
 */
export interface SaveProjectFileRequest {
  name: string;     // e.g. "index.html"; daemon stores at <projectDir>/<name>
  content: string;  // string content (HTML/text); daemon writes UTF-8
}

class OdClient {
  // ... existing methods ...

  async saveProjectFile(
    projectId: string,
    body: SaveProjectFileRequest,
    signal: AbortSignal,
  ): Promise<ProjectFileResponse> {
    return this.postJson<ProjectFileResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/files`,
      body,
      signal,
    );
  }
}
```

Also update the route doc-block at `src/od-client.ts:1-17`: bump documented endpoints from 9 to 10 and add `POST /api/projects/:id/files → saveProjectFile`.

### Layer 2 — Tool module `src/tools/save-project-file.ts`

Match the established pattern from `src/tools/save-artifact.ts` (the closest analog — also a write-shaped tool with content payload). Key facts verified during deep-design:

- Pattern is `export function registerSaveProjectFile(server: McpServer, client: OdClient): void` (Oracle N4) — NOT a handler+definition pair.
- Registration uses `inputSchema: inputSchema.shape` (the zod `.shape` property) — NOT `zodToJsonSchema()` (Oracle N2).
- Error mapping uses centralized `mapErrorToToolResultWith404` from `src/tools/errors.ts:51-59` (BLOCKING fix B2). Inline custom handling LOSES 401 auth hints, 429 rate-limit, 5xx prefix, and network diagnostics.
- Tool layer composes the AbortSignal: `AbortSignal.any([AbortSignal.timeout(30_000), extra?.signal ?? ...])` per `save-artifact.ts:32-35`.

```typescript
// src/tools/save-project-file.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import { mapErrorToToolResultWith404 } from './errors.js';

const MAX_CONTENT_BYTES = 5 * 1024 * 1024; // 5 MB client-side safety rail

const inputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._-]+$/, 'must match daemon project id regex /^[A-Za-z0-9._-]{1,128}$/'),
  name: z
    .string()
    .min(1)
    .max(255)
    .refine((n) => !n.includes('/') && !n.includes('\\'), {
      message: 'name must not contain path separators',
    }),
  // Note: leading-dot refinement REMOVED per Metis N7 — no daemon evidence; reintroduce only with proof.
  content: z
    .string()
    .min(1, 'content must not be empty')
    .refine((c) => Buffer.byteLength(c, 'utf8') <= MAX_CONTENT_BYTES, {
      message: `content exceeds ${MAX_CONTENT_BYTES} bytes (5 MB)`,
    }),
});

export { inputSchema as saveProjectFileInputSchema };
export type SaveProjectFileArgs = z.infer<typeof inputSchema>;

export function makeSaveProjectFileHandler(client: OdClient) {
  return async (args: SaveProjectFileArgs, extra?: { signal?: AbortSignal }) => {
    const signal = AbortSignal.any([
      AbortSignal.timeout(30_000),
      extra?.signal ?? new AbortController().signal,
    ]);
    try {
      const res = await client.saveProjectFile(
        args.projectId,
        { name: args.name, content: args.content },
        signal,
      );
      const f = res.file;
      const lines = [
        `Saved: ${f.name} → project '${args.projectId}'`,
        `  size: ${f.size} bytes`,
        `  kind: ${f.kind}`,
      ];
      if (f.artifactManifest?.entry) {
        lines.push(`  entry: ${f.artifactManifest.entry}`);
      }
      if (f.stubGuardWarning) {
        lines.push(`  stub-guard warning: ${f.stubGuardWarning.code}`);
      }
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        structuredContent: { file: f },
      };
    } catch (err) {
      return mapErrorToToolResultWith404(
        err,
        `Project not found: ${args.projectId} (call od_create_project first)`,
        client.authMode,
      );
    }
  };
}

export function registerSaveProjectFile(server: McpServer, client: OdClient): void {
  const handler = makeSaveProjectFileHandler(client);
  server.registerTool(
    'od_save_project_file',
    {
      description:
        "Persist a file (typically HTML from od_generate_design) INSIDE a project so it appears in od_get_project.files[] and renders in the daemon UI. Unlike od_save_artifact (which writes to a global, project-unaware artifact store), this tool wraps POST /api/projects/:id/files. Use this when you want your generated design to show up under the project's UI viewer; use od_save_artifact for a global, shareable artifact URL. Daemon limit: ~5 MB content. Requires OD_DAEMON_URL.",
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}
```

### Layer 3 — Server registration

`src/server.ts` — add one import and one registration call alongside the existing 9 tools. The pattern is established.

```typescript
// src/server.ts (additions)
import { registerSaveProjectFile } from './tools/save-project-file.js';
// ... after the other 9 register* calls ...
registerSaveProjectFile(server, client);
```

After registration, `tools/list` returns 10 tools.

### Layer 4 — Tests

**Unit (7 tests in `src/__tests__/tools/save-project-file.test.ts`):**

Patterns mirrored from `src/__tests__/tools/save-artifact.test.ts`:

1. **Happy path** — mock `client.saveProjectFile` to return canonical `ProjectFileResponse`, assert text includes `Saved: index.html`, `size: 32400`, `project 'demo'`, and `structuredContent.file` matches.
2. **404 → "Project not found" custom text** — mock throws `OdHttpError(404)`; assert `isError: true`, text contains `Project not found: demo`.
3. **401 → auth-mode hint** (Oracle N5) — mock throws `OdHttpError(401)`; assert text includes the auth hint produced by `mapErrorToToolResult`. Pattern: `save-artifact.test.ts:51-65`.
4. **Network unreachable → diagnostic prefix** (Oracle N5) — mock throws `TypeError('fetch failed')`; assert text contains "OD daemon unreachable".
5. **AbortSignal forwarding** (Oracle N5) — assert the signal passed via `extra.signal` triggers an abort on the client method. Pattern: `save-artifact.test.ts:82-101`.
6. **Path separator rejected** — invoke with `name: "foo/bar.html"`; assert zod parse fails with message containing "path separators".
7. **Content size cap** — invoke with `content` of byte length `MAX_CONTENT_BYTES + 1`; assert zod rejects.
8. **Empty content rejected** — invoke with `content: ""`; assert zod `.min(1)` fires.

**Integration (1 test in new file `tests/integration/tools-save-project-file.test.ts`):**

Use the existing helper at `tests/integration/helpers/od-mock-server.ts` (definitively exists per Metis N8). Test scenarios:

- Spawn MCP via stdio.
- Mock daemon implements `POST /api/projects/:id/files` returning the canonical `ProjectFileResponse` shape.
- Call `od_save_project_file` via JSON-RPC `tools/call`.
- Assert:
  - Mock daemon received `POST /api/projects/demo/files` with EXACT body `{"name":"index.html","content":"<html>..."}` (byte-level comparison).
  - Tool result text contains "Saved: index.html".
  - `tools/list` count is now 10 (assert in the same test, since boot is shared).

## Spec scenarios (revised — adds overwrite per Metis N6)

See `specs/tools/spec.md`. The revision adds a 6th scenario covering overwrite semantics: the daemon does last-writer-wins, so calling `od_save_project_file` twice with the same name SHOULD succeed and update the existing file. This is daemon-verified behavior; making it spec-explicit prevents implementers from defensively pre-checking existence.

## Hard gates triggered

- **Public contracts** (1 flag): adds a new tool name, schema, and behavior to the MCP server's public API.

No other hard gates (no auth, no data model, no audit, no migration).

## Alternatives considered

### Alt 1 — Extend `od_save_artifact` with optional `projectId`

**Rejected.** Would conflate two daemon endpoints (`POST /api/artifacts/save` and `POST /api/projects/:id/files`) under one tool. Their response shapes differ (global path/url vs project file record). Splitting at the MCP boundary maps cleanly to the daemon's own boundary.

### Alt 2 — Auto-save inside `od_generate_design` when `projectId` is set

**Rejected.** Breaks the lint-before-save workflow. Removes a meaningful checkpoint. Compose-ability matters more than convenience here.

### Alt 3 — Accept multipart / binary content

**Rejected for v1.** Daemon endpoint accepts JSON `{name, content: string}` only. Adding multipart requires a daemon change we don't control. Defer.

### Alt 4 — Define our own types instead of importing vendor types

**Rejected (deep-design BLOCKING fix B1).** The vendor module at `vendor/od-contracts/src/api/files.ts:32-51` already defines `ProjectFile`, `ProjectFileResponse`, and the 12-value `ProjectFileKind` union. Duplicating these is worse in every dimension: less precise types, drift risk, duplicate maintenance. `od-client.ts:25` already imports from this module.

### Alt 5 — Hand-roll error mapping inline

**Rejected (deep-design BLOCKING fix B2).** The codebase has centralized error mappers at `src/tools/errors.ts:21-45` (`mapErrorToToolResult`) and `:51-59` (`mapErrorToToolResultWith404`). Every existing write tool uses them. Hand-rolling loses: 401 auth-mode-aware hints (`errors.ts:10-19`), 429 rate-limit text, 5xx daemon prefix, and network-unreachable diagnostics.

## Real-world references

- Daemon route (provably working, returned 200 + canonical body during dogfood 2026-05-19): `POST /api/projects/<id>/files`.
- Vendor types: `vendor/od-contracts/src/api/files.ts:32-51` + `artifacts.ts:94-129`.
- Closest analog tool: `src/tools/save-artifact.ts` (commit `722db04`).
- Existing `OdClient.listFiles` (GET counterpart): `src/od-client.ts:112-120`.
- `postJson<T>` helper: `src/od-client.ts:244-265`.
- Centralized error mapper: `src/tools/errors.ts:21-45, 51-59`.
- 404 custom-text pattern: `src/tools/get-project.ts:79-83`.
- Test patterns: `src/__tests__/tools/save-artifact.test.ts:51-101`.
- Integration test helper: `tests/integration/helpers/od-mock-server.ts`.

## Migration / backward compatibility

- **None required.** Purely additive. No breaking changes to any of the existing 9 tools.
- Existing `od_save_artifact` callers see no change.
- MCP clients that don't know about `od_save_project_file` continue working.

## Resolved open questions (from initial design)

1. **Should `name` allow nested paths like `assets/logo.svg`?** **NO for v1.** Reject path separators. Re-open if a real use case appears.
2. **Should we expose `content-type` override?** **No.** Daemon infers from the file extension.
3. **What's the daemon's actual size cap?** **Unknown.** We add a 5 MB client-side rail. The 400 path surfaces daemon-side rejections (handled via centralized error mapper).
4. **Concurrent writes — what happens?** **Last-writer-wins** per dogfood evidence; spec scenario added to make this explicit.
5. **422 ARTIFACT_REGRESSION** (`vendor/od-contracts/src/api/files.ts:23-30`)? Daemon's stub-guard may return this. Handled via the generic mapper; surfaces a clear error to the caller. No special-casing needed for v1.
6. **Dotfile rejection?** **Removed** (Metis N7) — no daemon evidence justifies it. Add only with proof.
