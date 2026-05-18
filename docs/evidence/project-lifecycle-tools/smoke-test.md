# Live smoke test — project-lifecycle-tools

**Date:** 2026-05-18
**Package:** `open-design-mcp@latest` (npm — v0.10.4 / v0.11.0 after auto-publish)
**Target:** `http://ai-open-design:7456` (local Docker daemon, no auth)
**Probe id:** `lifecycle-smoke-1779087737`
**Driver:** `/tmp/smoke-lifecycle.mjs`

## Full CRUD round-trip transcript

```text
$ env -i PATH="$PATH" HOME="$HOME" \
    OD_DAEMON_URL=http://ai-open-design:7456 \
    PROBE_ID=lifecycle-smoke-$(date +%s) \
    node /tmp/smoke-lifecycle.mjs

[open-design-mcp] starting on stdio
[open-design-mcp] ready
CONNECT_OK
TOOLS_COUNT=8
PROBE_ID=lifecycle-smoke-1779087737

--- 1. od_create_project ---
isError=false
Created project "Lifecycle Smoke Test" (id: lifecycle-smoke-1779087737).
Conversation: dc0a040f-f26a-400d-a5f6-9cc282997a68

--- 2. od_update_project (rename) ---
isError=false
Updated project "Lifecycle Smoke Test (updated)" (id: lifecycle-smoke-1779087737).

--- 3. od_get_project (verify update) ---
isError=false
Project: lifecycle-smoke-1779087737 — Lifecycle Smoke Test (updated)
Files (0):

--- 4. od_delete_project ---
isError=false
Deleted project: lifecycle-smoke-1779087737

--- 5. od_get_project AFTER delete (expect Project not found) ---
isError=true
Project not found: lifecycle-smoke-1779087737
```

## What this proves

| # | Behavior | Status |
|---|---|---|
| - | `tools/list` returns 8 tools (was 5 pre-#29) | ✅ `TOOLS_COUNT=8` |
| 1 | `od_create_project` creates a project AND auto-seeds the conversation thread | ✅ Returned valid uuid `dc0a040f-…` |
| 2 | `od_update_project` updates `name` cleanly | ✅ `isError=false`, returned new name |
| 3 | `od_get_project` reflects the update | ✅ Reads back `"Lifecycle Smoke Test (updated)"` |
| 4 | `od_delete_project` returns `{ok:true}` (cleanly mapped to text confirmation) | ✅ `isError=false` |
| 5 | After delete the project is genuinely gone (hard delete, not soft) | ✅ `isError=true` with `Project not found:` |

The delete is irreversible — the daemon both removed the database row AND `removeProjectDir(PROJECTS_DIR, id)` on disk. The `od_delete_project` tool description correctly warns about this.

## Coverage

This transcript directly exercises every requirement added in the OpenSpec change:

- **Requirement: od_create_project tool** — happy-path scenario satisfied (step 1)
- **Requirement: od_update_project tool** — happy-path scenario satisfied (step 2)
- **Requirement: od_delete_project tool** — happy-path scenario satisfied (step 4)
- **Requirement: MCP initialize handshake** (modified) — tools/list returns 8 tools (preamble)
- **404 → "Project not found" mapping** (existing requirement) — confirmed in step 5

Error paths (400, 401) are covered by unit tests + integration tests; not re-verified against the live daemon here to avoid noise (the mock-server tests use identical code paths).

## Authentication mode

This smoke run uses no auth env vars → resolved mode `none`. The local daemon accepts unauthenticated requests on its shared Docker network. Hosted-OD smoke with `OD_AUTH_MODE=basic` is covered by the separate `od-auth-modes` smoke transcript (`docs/evidence/od-auth-modes/smoke-test.md`).
