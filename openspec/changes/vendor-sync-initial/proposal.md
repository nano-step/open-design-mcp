# Proposal: vendor-sync-initial

> **Revision**: v2. Aligned with HB-3 verbatim (test target is `resources/list`, NOT `tools/call`). Added 2 implementation-detail tasks (gitignore vendor-sync byproducts; strengthen vendor-check.sh invariants). See design.md VS-5, VS-9, VS-10. Resolves Metis findings (`bg_2aaef543`).

**Lane × Change Type:** `lane:normal × change-type:infrastructure`
**Risk Flags:** 1 (mechanical-execution-of-existing-script)
**Issue:** [#4](https://github.com/nano-step/open-design-mcp/issues/4)

## Why

`vendor/od-contracts/src/` was deliberately left as an empty placeholder in `init-package-scaffold` (per design.md D6 split between scaffold and sync-execution changes). The next change (`byok-pipeline-tool`) needs to `import { composeSystemPrompt }` from `vendor/od-contracts/src/prompts/system.ts` to build BYOK system prompts with full upstream fidelity. Without this change, the next change cannot start.

We deferred sync execution from `init-package-scaffold` for three reasons:
1. Keep scaffold change diffable (no large vendored-source diffs muddying scaffold review)
2. Decouple "script exists and is correct" from "script has been executed against pinned SHA"
3. Give us a clean change in which to strengthen integration tests per HB-3

## What Changes

1. **Execute** `bash scripts/vendor-sync.sh 7766582f0bd75d2dce31b2f9db01a482af801897` (the SHA pinned in `init-package-scaffold` D5).

2. **Vendor 13 .ts files** into `vendor/od-contracts/src/` matching the closure from D6:
   - Runtime (7): `prompts/{system,official-system,discovery,directions,deck-framework,media-contract}.ts`, `api/projects.ts`
   - Type-only (6): `api/{chat,files,comments,research,artifacts}.ts`, `common.ts`
   - Explicitly excluded: `src/index.ts` (poisonous barrel — per D6)

3. **Patch `chat.ts`** for Node16 ESM compatibility:
   - Upstream uses extensionless imports: `import { ... } from './files'`
   - Node16 ESM requires `.js` suffix: `import { ... } from './files.js'`
   - The `vendor-sync.sh` script applies this patch automatically (3 imports: `./files`, `./comments`, `./research`)
   - Add Apache 2.0 §4(b) MODIFICATION header to the top of `chat.ts` (template from D14)

4. **Populate `VENDORED_FROM.md` Modifications section** with a log entry naming the file, the change, and the rationale (extensionless imports → Node16 compatibility).

5. **Strengthen integration tests** per HB-3 verbatim (see design VS-5):
   - New test: calling `resources/list` (unadvertised capability) returns JSON-RPC error code `-32601`
   - New test: sending SIGINT to the server process causes graceful shutdown (exit code 0 within 2 seconds, no zombie process)

6. **Add `.gitignore` entries** for `.vendor-backup-*` and `.vendor-diff-report-*` artifacts created by `vendor-sync.sh` (see VS-9).

7. **Strengthen `scripts/vendor-check.sh`** with file-count assertion, sed-patch verification, and Modifications-log assertion (see VS-10). Backward-compatible — still passes against current scaffold AND post-sync state.

8. **Remove `vendor/od-contracts/src/.gitkeep`** after sync (no longer needed once 13 real files exist).

9. **Validation ladder** must exit 0 on all 6 commands (lint, typecheck, test, build, vendor-check, integration).

## Non-Goals

- **No new MCP tools.** `tools/list` still returns `[]` after this change. Tool implementations come in `byok-pipeline-tool`.
- **No env var consumption.** `OD_DAEMON_URL`, `OD_API_TOKEN`, `BYOK_*` env vars remain unread (still v0.x scaffold).
- **No upstream SHA bump.** Locked to `7766582` by D5; the next sync is a separate change.
- **No re-design of vendor strategy.** D1-D14 from `init-package-scaffold` remain in force.
- **No package.json `files` field update.** Already correct (ships only compliance metadata, not source).
- **No new dependency.** Vendor closure is self-contained (no external runtime deps in the closure per D7).
- **No `serverInfo.version` dynamic read (HB-5).** Deferred to a separate change.

## Lane Justification

`lane:normal` (2 risk flags out of 4 threshold):
1. Script execution against external state (upstream repo clone) — but SHA is locked, so deterministic
2. ~~Multi-service coordination~~ — N/A
3. ~~User-facing surface change~~ — N/A (still 0 tools)
4. New test coverage — minor (HB-3 integration tests)

Below `lane:high-risk` threshold (≥4 flags or hard gate). No hard gates trigger.

## Acceptance Summary

See `tasks.md` for the full T-1..T-N task breakdown with verifications. High-level acceptance:

- `vendor/od-contracts/src/` contains exactly 13 `.ts` files
- `chat.ts` has §4(b) MODIFICATION header + patched imports
- `VENDORED_FROM.md` Modifications section is populated
- 6/6 validation ladder commands exit 0
- 2 new integration tests pass (-32601 + SIGINT)
- CI green on Node 20 + Node 22 matrix
- Oracle Review Gate: PASS
