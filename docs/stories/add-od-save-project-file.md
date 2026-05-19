---
github_issue: "#53"
openspec_change: add-od-save-project-file
lane: normal
change_type: user-feature
status: review-passed
---

# US-053 Add `od_save_project_file` MCP Tool

## Status

in-progress

## GitHub Issue

`nano-step/open-design-mcp#53` — https://github.com/nano-step/open-design-mcp/issues/53

## Lane

normal

## OpenSpec Change

`openspec/changes/add-od-save-project-file/`

## Product Contract

The MCP server exposes a 10th tool, `od_save_project_file`, that wraps the OD daemon's `POST /api/projects/:id/files` endpoint. Callers can persist a file (typically HTML from `od_generate_design`) **inside** an existing project so it appears in `od_get_project.files[]` and renders in the daemon's project UI. This closes the `generate → lint → save → display` loop entirely within MCP, eliminating the need for callers to drop to direct daemon HTTP calls.

The new tool is distinct from `od_save_artifact` (which writes to the daemon's **global** artifact store and is not project-scoped per documented #46 behavior). Two save tools with two clear scopes; the tool description guides selection.

## Relevant Product Docs

- `README.md` § Tools (10-row table)
- `.opencode/skills/od-workflow/SKILL.md` § Tool mapping
- `.opencode/skills/od-workflow/references/workflow-examples.md`

## Acceptance Criteria

(Verbatim from `openspec/changes/add-od-save-project-file/specs/tools/spec.md`)

1. `tools/list` returns 10 tools (the existing 9 + `od_save_project_file`).
2. Tool description distinguishes project-scoped vs global save (mentions `od_save_artifact` explicitly).
3. Happy path: `od_save_project_file` POSTs to `<OD_DAEMON_URL>/api/projects/<id>/files` with body `{name, content}`. Result includes daemon-returned `size`, `kind`, and `artifactManifest.entry`. `structuredContent.file` matches vendor `ProjectFile` shape. Subsequent `od_get_project` shows file in `files[]`.
4. 404 daemon response → `isError: true`, text contains "Project not found: <id>" and hints at `od_create_project`. Uses centralized `mapErrorToToolResultWith404`.
5. Path-separator-in-name rejected pre-flight by zod with clear message.
6. Content size cap (5 MB UTF-8 bytes, measured via `Buffer.byteLength`) enforced pre-flight.
7. Overwrite: calling with an existing name updates the file (daemon last-writer-wins). Tool does not pre-flight GET.
8. Distinct from `od_save_artifact`: artifacts go to global path; project files appear in `od_get_project.files[]`.

## Design Notes

- Client method: `OdClient.saveProjectFile(projectId, body, signal)` → `Promise<ProjectFileResponse>` (vendor type)
- Wraps `this.postJson<ProjectFileResponse>('/api/projects/.../files', body, signal)` — uses existing helper at `src/od-client.ts:244-265`
- Tool registration: `registerSaveProjectFile(server, client)` follows pattern at `src/tools/save-artifact.ts:54-67`
- Error mapping: `mapErrorToToolResultWith404(err, '...', client.authMode)` from `src/tools/errors.ts:51-59`
- AbortSignal: required at client level; tool composes via `AbortSignal.any([timeout, extra?.signal])`
- Types: vendor `ProjectFile` and `ProjectFileResponse` imported from `vendor/od-contracts/src/api/files.ts:32-51` (NOT re-defined)

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | 8 new tests in `src/__tests__/tools/save-project-file.test.ts` covering happy path, 404, 401, network-unreachable, AbortSignal forwarding, path separator, size cap, empty content. Expect 199 + 8 = 207 unit tests total. |
| Integration | 1 new test in `tests/integration/tools-save-project-file.test.ts` using `startMockOdServer`. Expect 27 + 1 = 28 integration tests total. |
| E2E | Not applicable — MCP server has no E2E surface; integration test covers the user's entry point. |
| Platform | N/A — stdio MCP, single binary. |
| Release | User-flow test against live internal daemon: upload landing.html to `od-mcp-landing-page` project, verify `od_get_project` shows file in `files[]`. |

## Change Type

`user-feature` — adds a new MCP tool to the public surface.

## Testing Checklist

- [ ] User-flow test covers primary changed behavior (file: `tests/integration/tools-save-project-file.test.ts`)
- [x] Error/edge path tested — high-risk only (N/A — lane:normal, but we DO test 404 + 401 + network unreachable per Oracle N5)
- [ ] E2E not applicable — reason: stdio MCP has no E2E surface; integration test = user entry point
- [ ] Smoke test for non-user-facing change — N/A, this is user-facing
- [ ] All listed tests pass (output pasted in Evidence)

## Review

- Reviewer agent: oracle (fresh review agent, HARNESS Step 8)
- Reviewer ≠ implementer: yes (Sisyphus-Junior implemented; orchestrator coordinated; oracle reviewed)
- Verdict: **PASS**
- Date: 2026-05-19
- Commit: 445039c

| Acceptance Criterion | Evidence | Status |
| --- | --- | --- |
| 1. tools/list returns 10 | `initialize-handshake.test.ts:63-77` + 4 other integration tests assert `toHaveLength(10)` | ✓ |
| 2. Description distinguishes scopes | `save-project-file.ts:83-84` explicit "Unlike od_save_artifact..." | ✓ |
| 3. Happy path round-trip | Unit test 1 + integration test (byte-level body match) + live userflow (32,400 bytes) | ✓ |
| 4. 404 custom text via centralized mapper | Unit test 2 + handler at `save-project-file.ts:69-73` uses `mapErrorToToolResultWith404` | ✓ |
| 5. Path-separator rejected | Unit test 6 + schema at `save-project-file.ts:19` | ✓ |
| 6. 5 MB content cap (byte-length) | Unit test 7 (5,242,884-byte emoji string) + schema at `save-project-file.ts:25` | ✓ |
| 7. Overwrite/last-writer-wins | Grep confirmed no pre-flight GET; live overwrite 13→32400 bytes | ✓ |
| 8. Distinct from od_save_artifact | userflow-test.md shows file in `od_get_project.files[]` | ✓ |

**Validation ladder** (independently re-run by oracle in clean env): 7/7 PASS — lint, typecheck, 207 unit, build, vendor-check, 29 integration, openspec strict.

## PR Bot Review

- PR URL: TBD
- Bot rounds: 0
- Outstanding comments: TBD
- Bot approved: TBD

## Harness Delta

None proposed yet. If the implementation surfaces friction (e.g. the integration helper needs extension), document here and propose follow-up in `docs/HARNESS_BACKLOG.md`.

## Evidence

(Pending — will be filled after validation + user-flow + review.)

### Origin (from landing-page dogfood, 2026-05-19)

The gap was discovered during full-page generation dogfood:

- Generated `docs/evidence/landing-page-dogfood/landing.html` (32,400 bytes, properly closed)
- `od_save_artifact` saved to global `/app/.od/artifacts/<ts>-<id>/` (per documented #46)
- Project UI viewer needed file in project's `files[]` — empty after save
- Hand-rolled curl to `POST /api/projects/<id>/files` made the file appear in `od_get_project.files[]` and rendered correctly

The daemon endpoint is provably working. This story wraps it in MCP.
