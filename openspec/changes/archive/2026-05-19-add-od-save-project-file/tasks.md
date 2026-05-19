# Tasks: add-od-save-project-file

> Revised after deep-design pass — all task references updated to match the corrected design.

## 1. Client method

1. [ ] `src/od-client.ts`:
   - [ ] Extend the existing vendor-types import (currently at line 25) to add `ProjectFile, ProjectFileResponse` from `../vendor/od-contracts/src/api/files.js`.
   - [ ] Add interface `SaveProjectFileRequest` ({ name, content }) — the ONLY locally-defined type.
   - [ ] Add method `OdClient.saveProjectFile(projectId, body, signal): Promise<ProjectFileResponse>`.
     - Implementation MUST use the existing `this.postJson<ProjectFileResponse>()` helper at lines 244-265.
     - URL: `/api/projects/${encodeURIComponent(projectId)}/files`.
     - `signal: AbortSignal` is REQUIRED (not optional) — match every other client method.
   - [ ] Update the route doc-block at lines 1-17: bump from 9 endpoints to 10, add `POST /api/projects/:id/files → saveProjectFile`.

## 2. Tool module

2. [ ] Create `src/tools/save-project-file.ts`:
   - [ ] Define `const MAX_CONTENT_BYTES = 5 * 1024 * 1024;`.
   - [ ] Define zod `inputSchema`:
     - `projectId`: string, 1–128, regex `/^[A-Za-z0-9._-]+$/`
     - `name`: string, 1–255, no `/` or `\` (no leading-dot rule)
     - `content`: string, `.min(1, 'content must not be empty')`, byte-length cap via `Buffer.byteLength(c, 'utf8') <= MAX_CONTENT_BYTES`
   - [ ] Export `saveProjectFileInputSchema` and `SaveProjectFileArgs`.
   - [ ] Export `makeSaveProjectFileHandler(client: OdClient)`:
     - Compose signal via `AbortSignal.any([AbortSignal.timeout(30_000), extra?.signal ?? ...])`.
     - On success: return `{ content: [{ type: 'text', text: '…' }], structuredContent: { file } }`.
     - On error: call `mapErrorToToolResultWith404(err, 'Project not found: <id> (call od_create_project first)', client.authMode)`. **Do NOT hand-roll error mapping.**
   - [ ] Export `registerSaveProjectFile(server: McpServer, client: OdClient): void`:
     - Use `server.registerTool('od_save_project_file', { description: '…', inputSchema: inputSchema.shape }, handler)`.
     - Use the shape pattern, NOT `zodToJsonSchema()` (doesn't exist).

## 3. Server registration

3. [ ] `src/server.ts`:
   - [ ] Import `registerSaveProjectFile`.
   - [ ] Call it after the other 9 `register*` calls.
   - [ ] Confirm `tools/list` returns 10.

## 4. Unit tests (8 in `src/__tests__/tools/save-project-file.test.ts`)

Mirror `src/__tests__/tools/save-artifact.test.ts:1-101` patterns.

4. [ ] **Test 1 — happy path**: mock `client.saveProjectFile` returns `{ file: <canonical ProjectFile> }`; assert text includes "Saved: index.html", "size: 32400", "project 'demo'"; assert `structuredContent.file` round-trips.
5. [ ] **Test 2 — 404 → "Project not found" custom text**: mock throws `OdHttpError(404)`; assert `isError: true`, text contains "Project not found: demo".
6. [ ] **Test 3 — 401 → auth-mode hint**: mock throws `OdHttpError(401)`; assert text contains the auth hint produced by `mapErrorToToolResult` (e.g. "OD daemon returned 401 Unauthorized" + auth-mode note).
7. [ ] **Test 4 — network unreachable**: mock throws `TypeError('fetch failed')`; assert text contains "OD daemon unreachable".
8. [ ] **Test 5 — AbortSignal forwarding**: pass `extra.signal` via `AbortController`; abort it mid-call; assert the client method received an aborted signal (or the call rejects with `AbortError`).
9. [ ] **Test 6 — path separator rejected**: invoke with `name: "foo/bar.html"`; assert zod fails with message containing "path separators".
10. [ ] **Test 7 — content size cap**: invoke with content of byte-length `MAX_CONTENT_BYTES + 1` (use multibyte chars to verify byte-length not char-length); assert zod rejects.
11. [ ] **Test 8 — empty content rejected**: invoke with `content: ""`; assert zod `.min(1)` fires.

## 5. Integration test (1 new file)

12. [ ] `tests/integration/tools-save-project-file.test.ts`:
   - [ ] Use `startMockOdServer` from `tests/integration/helpers/od-mock-server.ts`.
   - [ ] Mock daemon handles `POST /api/projects/:id/files` returning a canonical `ProjectFileResponse` body. Record the received body for assertion.
   - [ ] Spawn the MCP via the existing stdio harness.
   - [ ] Call `od_save_project_file` via JSON-RPC `tools/call` with `{projectId, name: "index.html", content: "<html>...</html>"}`.
   - [ ] Assert daemon received POST body matches EXACTLY (byte-level JSON parse + deep-equal).
   - [ ] Assert tool result text contains "Saved: index.html".
   - [ ] Assert `tools/list` returns 10 tools (was 9).

## 6. Documentation

13. [ ] `README.md`:
   - [ ] Tools table: add 10th row for `od_save_project_file` (verb `write`, env `OD_DAEMON_URL`, description distinguishing it from `od_save_artifact`).
   - [ ] Status line: "9 MCP tools live" → "10 MCP tools live".
   - [ ] Add a short paragraph below the table pairing `od_save_project_file` and `od_save_artifact` (project-scoped vs global; when to use which).

14. [ ] `.opencode/skills/od-workflow/SKILL.md`:
   - [ ] Tool mapping table: add `od_save_project_file`.
   - [ ] Workflow steps: after lint (step 4), add optional step 4b for "save into project so it renders in the daemon UI"; explain choice between this and `od_save_artifact`.

15. [ ] `.opencode/skills/od-workflow/references/workflow-examples.md`:
   - [ ] Add at least one example that calls `od_save_project_file` and shows the file appearing in `od_get_project.files[]`.

## 7. Spec delta

16. [ ] `openspec/changes/add-od-save-project-file/specs/tools/spec.md`:
   - [ ] 1 ADDED requirement.
   - [ ] 6 scenarios: tool registered (count=10), happy path round-trip, 404→custom text, path-separator rejected, content size cap, overwrite/last-writer-wins.

## 8. Validation ladder (clean env: `unset OD_* BYOK_*`)

17. [ ] `npm run lint` ✅
18. [ ] `npm run typecheck` ✅
19. [ ] `npm test` ✅ (expect ≥199 + 8 = 207)
20. [ ] `npm run build` ✅
21. [ ] `bash scripts/vendor-check.sh` ✅
22. [ ] `npm run test:integration` ✅ (expect ≥27 + 1 = 28)
23. [ ] `npx openspec validate add-od-save-project-file --strict --no-interactive` ✅

## 9. User-flow test

24. [ ] Live test: against the dogfood project `od-mcp-landing-page` on the internal daemon, call `od_save_project_file` with the dogfooded landing HTML from `docs/evidence/landing-page-dogfood/landing.html`.
25. [ ] Assert `od_get_project` shows the new file in `files[]`.
26. [ ] Optionally re-upload to the hosted daemon (`https://od.thnkandgrow.com`) and verify viewable at `/api/projects/<id>/files/index.html`.
27. [ ] Paste the command output to story Evidence section.

## 10. Review Gate

28. [ ] Spawn fresh `oracle` review (lane:normal × user-feature × 1 risk flag).
29. [ ] Reviewer ≠ implementer. Verdict must be PASS before archive.

## 11. Ship

30. [ ] Commit: `feat: add od_save_project_file MCP tool (closes #53)`
31. [ ] Push branch as kokorolx via temp token URL
32. [ ] Open PR against master, `Closes #53`, assignee kokorolx
33. [ ] Wait for CI green
34. [ ] Squash-merge --admin (per established harness pattern)

## 12. Archive

35. [ ] `openspec archive add-od-save-project-file --yes`
36. [ ] Commit + rebase + push archive commit
37. [ ] Update `docs/TEST_MATRIX.md` with new test entries
38. [ ] Verify issue #53 auto-closed via PR `Closes #53`
