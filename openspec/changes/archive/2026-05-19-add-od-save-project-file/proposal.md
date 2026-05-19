# Proposal: add-od-save-project-file

**Lane × Change Type:** `lane:normal × change-type:user-feature`
**Risk Flags:** 1 (public-contracts — adds a new MCP tool)
**Issue:** [#53](https://github.com/nano-step/open-design-mcp/issues/53)
**Tracking:** #53

## Why

The v0.14.10 landing-page dogfood revealed a workflow gap: the MCP can generate a design (`od_generate_design`), lint it (`od_lint_artifact`), and save it globally (`od_save_artifact`), but cannot **attach it to the project** so it appears in the daemon UI's project viewer.

Today the loop breaks here:

1. `od_create_project` → project exists (empty files[])
2. `od_generate_design` → HTML in memory only
3. `od_save_artifact` → writes to **global** `/app/.od/artifacts/<ts>-<id>/` (per [#46](https://github.com/nano-step/open-design-mcp/issues/46) — saved artifacts intentionally do NOT appear in `od_get_project.files`)
4. **GAP** → no MCP tool can put the HTML into the project's `files[]`
5. User must drop to direct daemon HTTP calls to view their own generation in the project UI

The daemon endpoint already exists and was probed live during the dogfood:

```
POST /api/projects/<id>/files
Content-Type: application/json
Body: {"name":"index.html","content":"<html>..."}

Response 200:
{
  "file": {
    "name": "index.html",
    "path": "index.html",
    "size": 32400,
    "kind": "html",
    "mime": "text/html; charset=utf-8",
    "artifactKind": "html",
    "artifactManifest": {
      "version": 1, "kind": "html", "renderer": "html", "status": "complete",
      "exports": ["html","pdf","zip"]
    }
  }
}
```

The daemon's GET counterpart is already wired in `src/od-client.ts:7`:

```
GET /api/projects/:id/files → listFiles
```

We have a `listFiles` client method but no `saveFile` / `putFile` companion. Adding the POST wrapper + a tool that exposes it closes the loop.

## What changes

Three coordinated additions:

1. **`src/od-client.ts`** — add `saveProjectFile(projectId, file): Promise<ProjectFileResponse>` method that POSTs to `/api/projects/:id/files` with `{name, content}` body and parses the response. Define `ProjectFile` and `ProjectFileResponse` types matching the daemon's shape verbatim. Pin the route comment block (lines 7–17 of the file) with the new POST entry.

2. **`src/tools/save-project-file.ts`** — new tool module exposing `od_save_project_file` with zod input schema:
   ```typescript
   {
     projectId: string,    // existing project id (1–128 chars, daemon's regex)
     name: string,         // file name, e.g. "index.html" (1–255 chars; no path separators)
     content: string,      // file content (1–<configured-max> bytes)
   }
   ```
   Returns the daemon's `file` record verbatim (size, kind, manifest), wrapped in the standard MCP `content[]` text block.

3. **Tool registration** — register `od_save_project_file` in `src/server.ts` alongside the other 9 tools, raising the published count to **10**.

4. **Tests:**
   - Unit: 4 new tests in `src/__tests__/tools/save-project-file.test.ts` covering happy path, daemon error mapping (404 project not found, 400 bad request), zod input validation (missing fields, path separator in name).
   - Integration: 1 new test in `tests/integration/tools-projects.test.ts` (or new file) that boots the MCP, mocks the daemon's `POST /api/projects/:id/files` endpoint, and asserts the tool round-trips correctly.

5. **Docs:**
   - README tools table: add the 10th row.
   - README serverInfo / counts: update "9 MCP tools live" → "10 MCP tools live".
   - `.opencode/skills/od-workflow/SKILL.md`: add tool to the reference; note when to use `od_save_project_file` vs `od_save_artifact` (project-scoped vs global).

After this lands: the dogfood loop completes inside MCP — `generate → lint → save_project_file → get_project.files[]` shows the file → daemon UI renders it.

## Risk

- **Low.** Additive — no existing surface changes. Existing 9 tools unchanged.
- The daemon endpoint is provably working (verified via curl during dogfood: 200 OK, manifest returned).
- The two save tools (`od_save_artifact` and `od_save_project_file`) are intentionally distinct surfaces with different storage scopes. Disambiguation is in tool descriptions + the skill reference.
- New code path is a thin wrapper over an existing typed HTTP client method — same error mapping (`OdHttpError` → MCP error text) as the other write tools.

## Why not

- **Why not extend `od_save_artifact` with a `projectId` option?** Would break #46's documented contract (artifacts are global, by daemon design). Two endpoints have two different shapes; conflating them in one tool would force conditional logic and contradictory docs. Two clear tools is simpler.
- **Why not auto-save after `od_generate_design`?** Some callers want to lint/inspect first before persisting. Forcing persistence would remove a useful checkpoint. Explicit save keeps the workflow composable.
- **Why not accept binary content (base64 / buffer)?** Daemon's current endpoint is JSON-only and expects string content. We can lift this later if/when the daemon supports `multipart/form-data` uploads. Out of scope.
- **Why not accept multiple files at once?** YAGNI. Loop in the caller. Daemon endpoint is one-file-per-POST today.

## Out of scope

- File deletion (`DELETE /api/projects/:id/files/:name`) — separate issue if needed.
- File listing as a dedicated tool (already covered by `od_get_project` which merges files[]).
- Renaming / moving project files.
- Binary uploads.
- Per-file artifactManifest customization (manifest is daemon-inferred today).

## Acceptance criteria

- [ ] `OdClient.saveProjectFile(projectId, { name, content })` method exists in `src/od-client.ts`, POSTs to `/api/projects/:id/files`, returns the parsed `ProjectFileResponse`.
- [ ] `ProjectFile` and `ProjectFileResponse` types in `src/od-client.ts` match the daemon's shape (name, path, size, mtime, kind, mime, artifactKind, artifactManifest).
- [ ] Route documentation block at top of `src/od-client.ts` updated to include `POST /api/projects/:id/files → saveProjectFile`.
- [ ] `od_save_project_file` tool registered in `src/server.ts`. `tools/list` returns **10** tools.
- [ ] Tool input schema rejects: missing `projectId` / `name` / `content`, name with `/` or `\`, empty name, content exceeding configured max (default 5 MB).
- [ ] Tool returns the file's `size`, `kind`, and `artifactManifest.entry` in the response text.
- [ ] 404 from daemon → tool returns `isError: true` with text containing "project not found".
- [ ] 400 from daemon → tool returns `isError: true` with text containing the daemon's error message.
- [ ] README updated: tools table row added, count bumped to 10.
- [ ] `.opencode/skills/od-workflow/SKILL.md` updated: tool added with usage guidance (project-scoped vs global save).
- [ ] Validation ladder green: lint, typecheck, unit ≥199 (+4), build, vendor-check, integration ≥27 (+1), openspec validate --strict.
- [ ] Oracle review (lane:normal × user-feature × 1 risk flag).
- [ ] User-flow test: call the live tool against the dogfood project, assert the file appears in `od_get_project.files[]`.
