# Proposal: project-lifecycle-tools

**Lane × Change Type:** `lane:normal × change-type:user-feature`
**Risk Flags:** 2 (new tool surface, write operations to remote daemon)
**Issue:** [#28](https://github.com/nano-step/open-design-mcp/issues/28)

## Why

`open-design-mcp@0.10.x` exposes 5 read/write tools but has **no way to create, update, or delete projects** via MCP. A coding agent can list, inspect, save artifacts, lint, and generate designs — but cannot create the project to put them in. Users must drop out of their IDE into the Open Design web UI just to make a new project, defeating the IDE-native value of this MCP.

OD daemon already exposes the endpoints (verified live 2026-05-18):

```
POST   /api/projects        → {project, conversationId}   (auto-seeds default conversation)
PATCH  /api/projects/:id    → {project}
DELETE /api/projects/:id    → {ok: true}
```

This is the smallest follow-up after `od-auth-modes` that unblocks the "create a new design from scratch" flow — a flow you cannot do today without leaving the editor.

## What Changes

### Three new MCP tools

| Tool | Verb | OD endpoint | Required input | Returns |
|---|---|---|---|---|
| `od_create_project` | write | `POST /api/projects` | `id`, `name` (+ optional `skillId`, `designSystemId`, `pendingPrompt`, `customInstructions`, `metadata.kind`, `metadata.fidelity`) | `{project, conversationId}` |
| `od_update_project` | write | `PATCH /api/projects/:id` | `projectId` + any of: `name`, `customInstructions`, `metadata.kind`, `metadata.fidelity`, `metadata.linkedDirs` | `{project}` |
| `od_delete_project` | write | `DELETE /api/projects/:id` | `projectId` | `{ok: true}` |

After this change the server registers **8 tools** (5 existing + 3 new).

### Three new methods on `OdClient`

```ts
async createProject(req: CreateProjectRequest, signal: AbortSignal): Promise<CreateProjectResponse>
async updateProject(id: string, patch: UpdateProjectRequest, signal: AbortSignal): Promise<ProjectDetailResponse>
async deleteProject(id: string, signal: AbortSignal): Promise<{ ok: true }>
```

### Input-schema constraints

`od_create_project`:

- `id` matches `/^[A-Za-z0-9._-]{1,128}$/` (daemon's exact regex — mirrored client-side for friendly error)
- `name` non-empty string
- `customInstructions` (if provided) ≤ 5000 chars
- Privileged metadata fields (`baseDir`, `fromTrustedPicker`, `importedFrom`) are **explicitly rejected client-side** with a friendly error pointing users at `POST /api/import/folder` (daemon enforces too, this is a usability shortcut)

`od_update_project`:

- `projectId` required
- At least one mutable field must be present in the patch
- Same `customInstructions` limit; same privileged-field rejection

### Error mapping

All three tools share the same mapping table:

| HTTP | Tool result |
|---|---|
| 400 `BAD_REQUEST` | `isError: true`, text quotes the daemon's message (so the user sees e.g. `"invalid project id"`) |
| 404 | `isError: true`, text `"Project not found: <id>"` (via existing `mapErrorToToolResultWith404`) |
| 401/403/429/5xx | existing `mapErrorToToolResult` (mode-aware after #25) |

### Files changed

| File | Change |
|---|---|
| `src/od-client.ts` | 3 new methods + their type imports |
| `src/tools/create-project.ts` | NEW — registration + handler |
| `src/tools/update-project.ts` | NEW |
| `src/tools/delete-project.ts` | NEW |
| `src/tools/index.ts` | Register the 3 new tools |
| `src/__tests__/od-client.test.ts` | 9 new cases (3 per method: happy / 404 / 400) |
| `src/__tests__/tools/create-project.test.ts` | NEW |
| `src/__tests__/tools/update-project.test.ts` | NEW |
| `src/__tests__/tools/delete-project.test.ts` | NEW |
| `tests/integration/tools-lifecycle.test.ts` | NEW — full create → update → delete cycle against mock OD |
| `tests/integration/helpers/od-mock-server.ts` | (only if extension needed for PATCH/DELETE — to be confirmed during implementation) |
| `README.md` | New "Project lifecycle tools" sub-section under Tools |
| `docs/evidence/project-lifecycle-tools/smoke-test.md` | NEW — live transcript against `http://ai-open-design:7456` |

## Out of scope

- Privileged metadata fields (`baseDir`, `fromTrustedPicker`, `importedFrom`, `pendingPrompt > 5000 chars`) — daemon-only via `POST /api/import/folder`
- `POST /api/import/folder` itself — separate change
- Bulk operations (`od_delete_many`, etc.)
- Project archive / soft-delete — daemon offers only hard delete
- Updating `skillId` / `designSystemId` post-creation — daemon's PATCH accepts only `name`, `customInstructions`, and parts of `metadata`; deliberately not modeling other fields
- Auto-creating a conversation thread on existing projects — separate `conversation-tools` change

## Risk

**normal.** Three new write endpoints, three new tools. Standard CRUD pattern — no streaming, no auth surface change, no credential handling. Touches `OdClient` (additively), `src/tools/` (3 new files + 1 registration), and tests.

Two specific risks tracked:

1. **Accidental destructive operations** — `od_delete_project` is irreversible (daemon does a hard delete + filesystem `removeProjectDir`). Mitigation: tool description prominently warns that delete is permanent; live smoke uses a probe-only id.
2. **Server-side validation drift** — if daemon adds new privileged metadata fields, our client-side reject list will lag. Mitigation: daemon enforces the same rules (we double-check, not single-source); 400 from daemon flows through to user with the daemon's message intact.

After this change, `tools/list` returns 8 tools. Existing integration tests assert `=== 5`; those are updated to `=== 8`.
