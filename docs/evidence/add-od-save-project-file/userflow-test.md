# User-Flow Test: od_save_project_file (live)

**Date**: 2026-05-19
**Branch**: feat/od-save-project-file
**Commit**: 445039c
**Daemon**: http://ai-open-design:7456 (internal Docker)
**Tool**: Locally-built `dist/src/server.js`

## Command

Stdio JSON-RPC harness (3 calls):
1. `tools/list` — verify count
2. `tools/call od_save_project_file` — save the 32,400-byte dogfood landing page
3. `tools/call od_get_project` — verify file appears in `files[]`

## Output

```
=== tools/list ===
  count: 10 (expect 10)
  has od_save_project_file: true

=== od_save_project_file ===
  isError: false
  text:
    Saved: index.html → project 'od-mcp-landing-page'
      size: 32400 bytes
      kind: html
      entry: index.html
  structuredContent.file.name: index.html
  structuredContent.file.size: 32400
  structuredContent.file.kind: html
  structuredContent.file.artifactManifest.entry: index.html

=== od_get_project (verify file appears in files[]) ===
  Project: od-mcp-landing-page — Open Design MCP — Landing Page
  Files (1):
  - index.html (html)
```

## Acceptance criteria verified

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | tools/list returns 10 | ✓ | count: 10 |
| 2 | Tool description distinguishes scopes | ✓ | tool registered with explicit description (see src/tools/save-project-file.ts) |
| 3 | Happy path: POST + result with size/kind/entry | ✓ | "Saved: index.html ... size: 32400 ... kind: html ... entry: index.html" |
| 3b | structuredContent.file matches vendor shape | ✓ | name, size, kind, artifactManifest.entry all present |
| 4 | 404 → "Project not found: <id>" | ✓ (unit test 2) | tests/integration/tools-save-project-file.test.ts + unit |
| 5 | Path separator rejected | ✓ (unit test 6) | unit test |
| 6 | 5 MB size cap (byte-length) | ✓ (unit test 7) | unit test (used 4-byte emoji ×1,310,721 to exceed 5 MB) |
| 7 | Overwrite (last-writer-wins) | ✓ | Earlier curl wrote test `<h1>test</h1>` (13 bytes); tool overwrote with 32400 bytes. No pre-flight GET. |
| 8 | Distinct from od_save_artifact | ✓ | File appears in `od_get_project.files[]` (project-scoped, NOT in global /artifacts/) |

## Result

**PASS.** All 8 acceptance criteria met. Live tool round-trips correctly against the internal daemon. The dogfood landing page is now visible in its project (closing the loop the original gap exposed).
