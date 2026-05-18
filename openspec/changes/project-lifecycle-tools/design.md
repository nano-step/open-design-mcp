# Design: project-lifecycle-tools

## A. Context

After `od-auth-modes` (#24) and `fix-401-mode-aware-hint` (#27), `open-design-mcp` is at v0.10.3 with 5 MCP tools all working against both local and hosted Open Design daemons. The next gap a user hits: **cannot create a project without leaving the IDE**.

The Open Design daemon already exposes CRUD on projects via:

- `POST /api/projects` — create + auto-seed conversation
- `PATCH /api/projects/:id` — update name / customInstructions / metadata
- `DELETE /api/projects/:id` — hard delete

This change wraps those three endpoints as three new MCP tools. No new transport layer, no new auth surface — just standard write-side CRUD on top of the existing `OdClient`.

## B. Design Decisions

### B1. Tool naming + input schemas

| Tool | Input |
|---|---|
| `od_create_project` | `{id, name, skillId?, designSystemId?, pendingPrompt?, customInstructions?, kind?, fidelity?}` |
| `od_update_project` | `{projectId, name?, customInstructions?, kind?, fidelity?, linkedDirs?}` |
| `od_delete_project` | `{projectId}` |

**Why a flat surface (not nested `metadata`):** Most MCP clients flatten user inputs; nesting `kind`/`fidelity` under `metadata` would force callers to construct nested objects from prompts. The tool maps flat → daemon-nested internally.

**Why a separate `od_delete_project` (vs an `action` field):** MCP best-practice is one tool per verb. A unified `od_manage_project` with `{action: 'create' | 'update' | 'delete'}` would mask the destructive nature of delete and complicate input validation. Three tools, three intents, clear blast radius.

### B2. id-regex mirroring

Daemon enforces `/^[A-Za-z0-9._-]{1,128}$/` on `POST /api/projects`. We mirror it in the tool's Zod schema:

```ts
id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/, {
  message: 'id must match /^[A-Za-z0-9._-]{1,128}$/ (alphanumerics, dot, underscore, hyphen)',
}),
```

**Why mirror instead of delegating to daemon validation:** A user typing `"my new project"` deserves a friendly error before the network round-trip. The daemon's response (`{error: {message: "invalid project id"}}`) wouldn't tell them *why* their id is invalid.

### B3. customInstructions limit (5000 chars)

Mirrored client-side identically to `id` regex — same rationale: better user experience, fail-fast.

### B4. Privileged metadata fields

Tool input schemas explicitly **do not include** `baseDir`, `fromTrustedPicker`, `importedFrom`. If a user constructs a metadata object that somehow includes them (shouldn't be possible through our schema), the daemon's 400 rejection flows through `mapErrorToToolResult` and the user sees the daemon's reason verbatim.

We do **not** add client-side runtime checks for these fields — the schema disallows them at the type level, and the daemon enforces at runtime. Belt-and-suspenders would just add maintenance cost.

### B5. Flat → nested mapping inside the handler

The tool handler converts flat inputs to the daemon's expected nested shape:

```ts
// inside od_create_project handler
const body: CreateProjectRequest = {
  id: args.id,
  name: args.name,
  skillId: args.skillId,
  designSystemId: args.designSystemId,
  pendingPrompt: args.pendingPrompt,
  customInstructions: args.customInstructions,
  metadata: (args.kind || args.fidelity)
    ? { kind: args.kind, fidelity: args.fidelity }
    : undefined,
};
```

**Why optional `metadata`:** Daemon accepts `null` or undefined. Sending an empty `{}` would still create an empty metadata bag — harmless but noisier than necessary.

### B6. od_update_project — at-least-one-field requirement

The Zod schema uses `.refine()` to require at least one mutable field beyond `projectId`:

```ts
const updateProjectInput = z.object({...}).refine(
  (v) => v.name !== undefined || v.customInstructions !== undefined ||
         v.kind !== undefined || v.fidelity !== undefined ||
         v.linkedDirs !== undefined,
  { message: 'at least one of name/customInstructions/kind/fidelity/linkedDirs is required' }
);
```

**Why enforce this:** A no-op PATCH `{}` is a wasted network call and an empty intent — the user almost certainly forgot to specify what to update. Better to fail fast with a clear message.

### B7. od_delete_project — irreversibility warning in tool description

```ts
description:
  'PERMANENTLY delete a project. The Open Design daemon removes the database row AND the on-disk project directory. This cannot be undone. Requires only OD_DAEMON_URL.'
```

**Why prominent caps in the description:** MCP clients surface tool descriptions to the LLM that decides whether to invoke. Making destructiveness obvious reduces the chance of an LLM-driven accidental delete.

### B8. Error mapping (reuses existing helpers)

| HTTP | Helper |
|---|---|
| 404 | `mapErrorToToolResultWith404(err, "Project not found: " + id, client.authMode)` |
| 400 | `mapErrorToToolResult(err, client.authMode)` — text already contains daemon's message via `OdHttpError.bodySnippet` |
| 401/403/429/5xx | `mapErrorToToolResult(err, client.authMode)` |

**Why pass through daemon's 400 message:** For `POST /api/projects`, the daemon emits messages like `"invalid project id"`, `"name required"`, `"baseDir can only be set via POST /api/import/folder"`. These are the most actionable error texts available and we should not paraphrase them.

### B9. Type imports from vendored contracts

Add to `vendor/od-contracts/src/api/projects.ts` usage:

```ts
import type {
  ProjectsResponse,
  ProjectDetailResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  UpdateProjectRequest,
} from '../vendor/od-contracts/src/api/projects.js';
```

**Risk: vendored types may not exist.** First implementation step is to read `vendor/od-contracts/src/api/projects.ts` and confirm. If the create/update request types aren't vendored, we either (a) vendor them via the existing `scripts/vendor-sync.sh` mechanism or (b) define minimal local types. The implementer decides at that step.

### B10. Integration test strategy

Two integration tests:

1. **`tools-lifecycle.test.ts`** — full happy-path cycle: `create` → `update` → `delete`, all against the mock OD daemon. Asserts the conversationId from `create` is returned, the patched fields appear in the `update` response, and `delete` returns `{ok: true}`.
2. **Update existing `initialize-handshake.test.ts`** — change the `tools/list` count assertion from `=== 5` to `=== 8`.

The mock OD server (`tests/integration/helpers/od-mock-server.ts`) currently has handlers registered per-test via `mock.handle('GET', '/api/projects', ...)`. The PATCH and DELETE methods need to work — verify during implementation; if not supported, extend the mock helper (additively).

### B11. Live smoke

`docs/evidence/project-lifecycle-tools/smoke-test.md` documents one create + update + delete cycle against `http://ai-open-design:7456` with a probe id like `lifecycle-smoke-<timestamp>`. The smoke driver is the same `/tmp/smoke-driver.mjs` extended to invoke the new tools.

### B12. Spec deltas

One delta on `server-bootstrap` (3 new requirements — one per tool) and one delta on `build-and-ci` (update unit + integration test counts).

### B13. PR slicing

`lane:normal × user-feature` → single Oracle review on one PR. No need to slice further:

1. `feat(od-client): add createProject/updateProject/deleteProject methods` + tests
2. `feat(tools): register od_create_project, od_update_project, od_delete_project`
3. `test(integration): full lifecycle + tools/list count update`
4. `docs: README + smoke evidence`

Four atomic commits on one PR.

### B14. Out of scope

- Conversation tools (`od_list_conversations`, `od_get_conversation_history`) — separate change.
- `od_get_project` regression around new fields — no regression expected (read endpoint unchanged).
- Concurrency / race conditions — daemon is single-process; out of scope.
- Project listing pagination — separate concern.

## C. Open questions

None. All daemon-side behavior verified by live probe (2026-05-18). All client-side validation rules mirror the daemon's enforced rules.
