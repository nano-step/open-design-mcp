# Tasks: project-lifecycle-tools

Lane:normal × user-feature → single PR with Oracle review gate.

## T-1: Pre-flight

- `git status` clean on `feat/project-lifecycle-tools`
- All existing tests pass (142 unit + 23 integration)
- `openspec validate project-lifecycle-tools --strict --no-interactive` → valid
- Read `vendor/od-contracts/src/api/projects.ts` — confirm presence/absence of `CreateProjectRequest`, `CreateProjectResponse`, `UpdateProjectRequest` types

## T-2: Vendor types (only if missing)

If the create/update request types aren't in the vendored contracts, define minimal local types in `src/od-client.ts`:

```ts
export interface CreateProjectRequest {
  id: string;
  name: string;
  skillId?: string | null;
  designSystemId?: string | null;
  pendingPrompt?: string | null;
  customInstructions?: string | null;
  metadata?: { kind?: string; fidelity?: string } | null;
}
export interface CreateProjectResponse {
  project: { id: string; name: string; /* ...other fields from ProjectDetail */ };
  conversationId: string;
}
export interface UpdateProjectRequest {
  name?: string;
  customInstructions?: string | null;
  metadata?: { kind?: string; fidelity?: string; linkedDirs?: string[] };
}
```

**Verify:** `npm run typecheck` clean.

## T-3: Add `createProject`, `updateProject`, `deleteProject` to `OdClient`

In `src/od-client.ts`:

```ts
async createProject(req, signal) { return this.postJson('/api/projects', req, signal); }
async updateProject(id, patch, signal) {
  // PATCH method — need to add patchJson helper if not already present
}
async deleteProject(id, signal) {
  // DELETE method — need deleteJson helper
}
```

Add private `patchJson` and `deleteJson` helpers mirroring `getJson` / `postJson`. Each composes the same `headers()` (auth + content-type).

**Verify:** `npm run typecheck` clean.

## T-4: Unit tests for `OdClient` (9 new cases)

In `src/__tests__/od-client.test.ts`:

| Method | Happy | 404 | 400 |
|---|---|---|---|
| `createProject` | mock returns 200 → returns project + conversationId | n/a (no id-based 404 on POST) | mock returns 400 `BAD_REQUEST` → throws `OdHttpError` with status 400 |
| `updateProject` | mock returns 200 → returns project | mock returns 404 → throws `OdHttpError` 404 | mock returns 400 → throws `OdHttpError` 400 |
| `deleteProject` | mock returns 200 `{ok: true}` → returns `{ok: true}` | mock returns 404 → throws 404 | n/a (no body validation on DELETE) |

That's 7 happy/404/400 cases. Plus 2 verifying the new helpers use correct HTTP methods (`PATCH` for update, `DELETE` for delete) — peek at the `fetch` call args.

**Verify:** `npm test -- od-client.test` → all green (was 16 → ≥25).

## T-5: Tool — `od_create_project` (`src/tools/create-project.ts`)

- Zod input schema with id regex, name min(1), optional skillId/designSystemId/pendingPrompt/customInstructions/kind/fidelity
- Handler:
  1. Map flat inputs to nested `metadata` if `kind`/`fidelity` present
  2. Call `client.createProject(body, signal)`
  3. On success: return text summary `Created project "<name>" (id: <id>). Conversation: <conversationId>` + structuredContent
  4. On error: `mapErrorToToolResult(err, client.authMode)`
- Unit test at `src/__tests__/tools/create-project.test.ts` — happy / 400 / 401 / network error

**Verify:** `npm test -- create-project.test` → all green.

## T-6: Tool — `od_update_project` (`src/tools/update-project.ts`)

- Zod input schema with `projectId` required + at-least-one-field `.refine()`
- Handler: flatten kind/fidelity/linkedDirs into `metadata`, call `client.updateProject(projectId, patch, signal)`, error mapping via `mapErrorToToolResultWith404`
- Unit test — happy / 404 / 400 / empty-patch validation error

**Verify:** `npm test -- update-project.test` → all green.

## T-7: Tool — `od_delete_project` (`src/tools/delete-project.ts`)

- Zod input schema: `{projectId: z.string()}`
- Description prominently warns "PERMANENTLY delete"
- Handler: call `client.deleteProject(projectId, signal)`, return text `Deleted project: <id>` on success
- Unit test — happy / 404 / 401

**Verify:** `npm test -- delete-project.test` → all green.

## T-8: Wire into `src/tools/index.ts`

Add three new `register*` calls. Order: list, get, create, update, delete, save, lint, generate (rough mental flow).

**Verify:** `npm run build` exit 0.

## T-9: Update existing integration test count assertion

`tests/integration/initialize-handshake.test.ts`:

- Change any `=== 5` or `.length === 5` assertion to `=== 8`
- Add the three new tool names to the expected-name list

**Verify:** `npm run test:integration -- initialize-handshake` → all green.

## T-10: New integration test — full CRUD cycle

`tests/integration/tools-lifecycle.test.ts`:

- Spawn mock OD with handlers for POST/PATCH/DELETE on `/api/projects` and `/api/projects/:id`
- Spawn MCP server with `OD_DAEMON_URL` pointing at mock
- Call `od_create_project` → assert returned conversationId
- Call `od_update_project` on that id → assert new name
- Call `od_delete_project` → assert `{ok: true}`
- Confirm mock received all three with correct HTTP methods + bodies

**Verify:** `npm run test:integration -- tools-lifecycle` → 1 file, all tests green.

## T-11: Mock helper extension (if needed)

If `tests/integration/helpers/od-mock-server.ts` doesn't already support PATCH and DELETE, extend it additively. Confirm during implementation by reading the file first.

**Verify:** existing integration tests still pass (no regression).

## T-12: README update

Add new sub-section "Project lifecycle tools" under the existing Tools table. List the three new tools with one-line descriptions. Update the tools count in the intro paragraph from "5 MCP tools" to "8 MCP tools".

**Verify:** `grep -c "od_create_project\|od_update_project\|od_delete_project" README.md` ≥ 3.

## T-13: Full validation ladder (clean env per HB-7)

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `bash scripts/vendor-check.sh`
6. `npm run test:integration`

Capture to `docs/evidence/project-lifecycle-tools/validation.md`. All 6 exit 0.

## T-14: Live smoke

`docs/evidence/project-lifecycle-tools/smoke-test.md`:

1. Pick a probe id: `lifecycle-smoke-<unix-ts>`
2. Run `od_create_project` with name `Lifecycle Smoke Test`
3. Run `od_update_project` on that id with `name: "Lifecycle Smoke Test (updated)"`
4. Run `od_delete_project` on that id
5. Run `od_list_projects` and confirm the probe id is GONE
6. Paste transcript

## T-15: Self code-review

Per HARNESS § Review Gate. Confirm:

- Every changed line traces to proposal/design
- No `as any`, `@ts-ignore`, `@ts-expect-error`
- No new dependencies
- Tool descriptions clear, especially `od_delete_project` destructive warning
- Tests cover all 3 modes via existing mapper (no new direct tests needed — covered transitively by errors.test.ts)

## T-16: Oracle review

Lane:normal × user-feature → single Oracle on the diff. Required verdict: PASS.

## T-17: Push + PR + CI + merge + archive

- Push branch `feat/project-lifecycle-tools` as kokorolx
- Open PR referencing #28 with body matching the established template
- Wait for CI Node 20+22 green
- Squash-merge as kokorolx
- Pull master, `openspec archive project-lifecycle-tools` (with spec application, not `--skip-specs`)
- Commit + push the archive
