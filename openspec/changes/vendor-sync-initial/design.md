# Design: vendor-sync-initial

> **Revision**: v2. Resolves Metis findings (`bg_2aaef543`): A-1 (HB-3 says `resources/list` not `tools/call` — design realigned), A-2 (timeout — assertion 2s, vitest framework timeout 5s), M-1 (gitignore `.vendor-backup-*`), M-2 (remove `.gitkeep` post-sync), VS-7 step 1 clarification (visible-in-git-status, not staged), TG-1/TG-2/TG-4 (strengthen `vendor-check.sh` invariants).

## Context

This change executes the `scripts/vendor-sync.sh` machinery that was designed and shipped (but never executed) in `init-package-scaffold`. All architectural decisions (D1-D14) from that earlier change remain in force.

This design document only records **delta decisions** specific to this change's execution. For background on the vendor strategy, closure, and Apache 2.0 compliance approach, see [`openspec/changes/archive/2026-05-17-init-package-scaffold/design.md`](../../changes/archive/2026-05-17-init-package-scaffold/design.md) and [`docs/decisions/init-package-scaffold.md`](../../../docs/decisions/init-package-scaffold.md).

## Delta Decisions

### VS-1: Run sync script as-shipped (no in-flight script edits)

The `vendor-sync.sh` script was reviewed and approved at Oracle Review Gate T-15 in `init-package-scaffold`. We execute it without modification in this change.

**If the script produces unexpected output** (sed pattern doesn't match, modification log not written, etc.), the fix is: revert the change, open a follow-up issue against the script, fix it in a separate change, then retry this one.

**Rationale:** Conflating script-fix with script-execution makes both diffs noisy and reverts harder. One change = one purpose.

### VS-2: Commit vendored source files unmodified except for §4(b) patch

The 13 `.ts` files are copied verbatim from upstream `nexu-io/open-design@7766582`. The ONLY modification permitted in this change is the `chat.ts` extensionless-imports patch performed by `vendor-sync.sh`. No other reformatting, no prettier, no lint auto-fix, no comment cleanup.

**Rationale:** Apache 2.0 §4(b) requires a clear log of modifications. Mixing the imports patch with cosmetic edits would obscure the audit trail.

### VS-3: §4(b) MODIFICATION header — actual text produced by `vendor-sync.sh`

For `chat.ts` only, `scripts/vendor-sync.sh` prepends this header (verbatim from the script's PATCH_HEADER variable at lines 124-131). The original upstream content immediately follows; original copyright notices are preserved per §4(c):

```ts
// MODIFICATION (open-design-mcp):
// Added explicit `.js` extensions on relative imports for Node16
// moduleResolution. The upstream uses `moduleResolution: "Bundler"`
// which permits extensionless imports; this package uses Node16 which
// forbids them (TS2835). Patent grant + license terms unchanged.
// Modified by: scripts/vendor-sync.sh
// Modification date: <ISO-8601 timestamp at sync time>
```

**Greppable invariant:** `head -25 chat.ts | grep -q 'MODIFICATION (open-design-mcp)'` SHALL return exit 0 post-sync.

**Rationale:** Header is self-contained, machine-greppable for audit, names the modifier (the script — a reproducible authority), and explicitly carries the date per §4(b). The compact form (no decorative banner) keeps source diffs readable.

**Note on v1 drift:** v1 of this design specified a `MODIFICATION NOTICE (Apache License 2.0, Section 4(b))` header with explicit author email and Apache 2.0 cross-reference. That text does NOT match what `vendor-sync.sh` actually emits (the script was finalized in `init-package-scaffold` before this design was written). Per VS-1 (run script as-shipped), this revision aligns the design to the script, not the other way around. The compact form still satisfies Apache 2.0 §4(b) (modification notice present, dated, and attributable).

### VS-4: VENDORED_FROM.md Modifications section — actual text produced

`scripts/vendor-sync.sh` (lines 174-176) writes this Modifications section template:

```markdown
## Modifications

- `src/api/chat.ts` — Added `.js` extensions on relative imports for Node16 moduleResolution (see in-file MODIFICATION header).
```

**Greppable invariant:** `grep -q '^- \`src/api/chat\.ts\`' VENDORED_FROM.md` SHALL return exit 0 post-sync.

**Rationale:** Audit log readable, back-references the in-file header for full context, uses the full vendored path `src/api/chat.ts` (not just `chat.ts`) so multi-file syncs in the future can disambiguate.

**Note on v1 drift:** v1 of this design described a bolded entry `**chat.ts**` with date and rationale. That does NOT match what the script produces. Per VS-1, this revision aligns the design to the script. The greppable invariant in `scripts/vendor-check.sh` was updated to match.

### VS-5: HB-3 test coverage — exactly two new integration tests

Per **HB-3 verbatim** (`docs/HARNESS_BACKLOG.md`), we add **exactly two** new integration tests to `tests/integration/initialize-handshake.test.ts`:

1. **`resources/list` returns -32601** — using the official MCP `Client` + `StdioClientTransport`, complete `initialize` handshake, then call `client.listResources()`. Server does NOT advertise the `resources` capability, so the SDK SHALL surface an error with `code === -32601` (Method not found). Asserts:
   - The thrown error's `error.code === -32601` (exact integer, not string)
   - The test does NOT use `client.callTool({ name: "nonexistent_tool" })` — that exercises tool-level dispatch within an advertised capability, which is conceptually different from the HB-3 invariant (protocol-level method dispatch for unadvertised capability)

2. **SIGINT triggers graceful shutdown** — spawn the built binary directly via `child_process.spawn` (NOT via `StdioClientTransport`, because we need raw control over signals). Wait for stderr line `[open-design-mcp] ready` to confirm the signal handler is registered. Send `SIGINT` to the child. Assert:
   - The child emits `exit` event with `code === 0` within **2000 milliseconds** (behavioral assertion)
   - After exit, `process.kill(child.pid, 0)` throws `ESRCH` (process truly gone, not just detached)
   - The vitest per-test timeout is **5000 ms** (framework safety net, ≠ behavioral assertion)

**Out of scope for this change:** SIGTERM, SIGHUP, malformed JSON-RPC frames, concurrent client connections, ping/pong heartbeats, the `tools/call` unknown-tool variant. Those go into a future "harden-integration-tests" change if needed.

**Rationale:** Two focused tests directly mapped to HB-3 acceptance. The `tools/call` variant is already covered by the ad-hoc real-MCP-client smoke test (`/tmp/od-mcp-realtest/test-mcp.mjs`) we used to verify v0.2.1 publish; adding it again here would duplicate coverage and violate Metis MUST NOT (>2 tests).

### VS-6: Pre-flight vendor-check.sh BEFORE running vendor-sync.sh

Before executing the sync, run `bash scripts/vendor-check.sh` once and confirm it exits 0 against the current scaffold state. If it doesn't, the scaffold itself is broken and this change cannot proceed.

**Rationale:** Establishes baseline. Surfaces scaffold regressions before vendor-sync execution muddies the diff.

### VS-7: Post-sync verification sequence (deterministic order)

After `vendor-sync.sh` completes, run in this exact order. Note: "visible in `git status`" means the files appear in working tree (untracked or modified), NOT staged in the index. The script does not `git add`.

1. `git status` — confirm 13 new `.ts` files VISIBLE as untracked in `vendor/od-contracts/src/` + 1 modified `vendor/od-contracts/VENDORED_FROM.md`. Backup/diff artifacts (`.vendor-backup-*`, `.vendor-diff-report-*`) MAY also be visible — they are added to `.gitignore` (see VS-9).
2. `git diff --stat vendor/od-contracts/VENDORED_FROM.md` — confirm Modifications section delta
3. `find vendor/od-contracts/src -name '*.ts' | wc -l` SHALL output `13` (exact count assertion)
4. `head -25 vendor/od-contracts/src/api/chat.ts | grep -c 'MODIFICATION NOTICE'` SHALL output `1` (header present)
5. `grep -c "from './files.js'" vendor/od-contracts/src/api/chat.ts` SHALL output `1` or higher (sed patch actually applied — protects against silent no-op per Metis R-1)
6. `grep -c '^- \*\*chat\.ts\*\*' vendor/od-contracts/VENDORED_FROM.md` SHALL output `1` (Modifications log entry exists)
7. `rm vendor/od-contracts/src/.gitkeep` (no longer needed once 13 real files exist — keep tree clean per Metis M-2)
8. `bash scripts/vendor-check.sh` — confirm invariants still hold (now includes file-count + chat.ts grep checks per VS-10)
9. `npm run typecheck` — confirm vendor sources compile under Node16 ESM resolution. If this fails with TS2835, the `.js` extension patch silently no-op'd (escalation: revert, fix script in separate change).
10. `npm test` (unit) — 7 tests still green
11. `npm run build` — `dist/vendor/od-contracts/src/api/projects.js` and `dist/vendor/od-contracts/src/prompts/system.js` exist
12. `npm run test:integration` — 3 existing integration tests still pass (BEFORE adding new tests)
13. Add the 2 new HB-3 tests to `tests/integration/initialize-handshake.test.ts` (in same file per Metis DD-2)
14. `npm run lint && npm run typecheck` — confirm new test code passes both
15. `npm run test:integration` again — 5 integration tests pass total
16. `bash scripts/vendor-check.sh` one final time

**Rationale:** Sequence catches regressions at the earliest possible step. Adding HB-3 tests AFTER vendor sync ensures their behavior reflects the post-sync codebase. Steps 3–6 are explicit assertions guarding against silent failures Metis flagged (R-1, TG-1, TG-2, TG-4).

### VS-9: Gitignore vendor-sync byproducts (Metis M-1)

`scripts/vendor-sync.sh` creates timestamped artifacts in repo root:
- `.vendor-backup-<timestamp>/` — pre-sync vendor backup
- `.vendor-diff-report-<timestamp>.txt` — old↔new diff report

These are operational artifacts, not source-of-truth. Add to `.gitignore`:
```
# Vendor sync byproducts (created by scripts/vendor-sync.sh)
.vendor-backup-*/
.vendor-diff-report-*.txt
```

**Rationale:** Prevents accidental commits of multi-MB backups. Allows multiple syncs in a session without polluting `git status`.

### VS-10: Strengthen `scripts/vendor-check.sh` invariants (Metis TG-1/TG-2/TG-4)

The existing script checks LICENSE/NOTICE existence and SHA format. Add three new assertions to catch silent failures:

```bash
# (after existing checks, before final "vendor-check: ok")

# TG-1: File count assertion
expected_count=13
actual_count=$(find vendor/od-contracts/src -name '*.ts' -type f | wc -l | tr -d ' ')
if [[ "$actual_count" != "0" && "$actual_count" != "$expected_count" ]]; then
  echo "❌ Expected 0 (pre-sync) or $expected_count (post-sync) .ts files, found $actual_count" >&2
  exit 1
fi

# TG-2: chat.ts patch applied (only if vendor sources present)
if [[ -f vendor/od-contracts/src/api/chat.ts ]]; then
  if ! grep -q "from '\./files\.js'" vendor/od-contracts/src/api/chat.ts; then
    echo "❌ chat.ts missing .js suffix on relative imports — sed patch did not apply" >&2
    exit 1
  fi
  if ! head -25 vendor/od-contracts/src/api/chat.ts | grep -q 'MODIFICATION NOTICE'; then
    echo "❌ chat.ts missing Apache 2.0 §4(b) MODIFICATION header" >&2
    exit 1
  fi
fi

# TG-4: Modifications log entry (only if vendor sources present)
if [[ -f vendor/od-contracts/src/api/chat.ts ]]; then
  if ! grep -q '^- \*\*chat\.ts\*\*' vendor/od-contracts/VENDORED_FROM.md; then
    echo "❌ VENDORED_FROM.md Modifications section missing chat.ts entry" >&2
    exit 1
  fi
fi
```

The conditional `if [[ -f .../chat.ts ]]` means the script remains backward-compatible — passes against current scaffold (no chat.ts) AND post-sync state (chat.ts present, patched, logged).

**Rationale:** Defense-in-depth. Catches `vendor-sync.sh` silent no-ops (Metis R-1) at the CI gate, not just at code review.

### VS-8: Continuous-release version semantics for this change

This change's commit messages will use `feat(vendor):` prefix for the vendor-sync execution commit and `test:` for the HB-3 test commit. The shared-workflows semver detector will see `feat:` in range → bump = minor → produces `v0.3.0`.

**Rationale:** Vendoring upstream source IS a feature addition from the package perspective (consumers get new module surface area, even if not yet exposed through MCP tools). Minor bump is semver-appropriate.

**Alternative considered:** `chore(vendor):` → patch bump → 0.2.2. Rejected because vendored code DOES change the npm package contents materially (38 KB → ~80 KB). Patch bumps imply no functional change.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `vendor-sync.sh` sed pattern doesn't match upstream's chat.ts at the pinned SHA | low | high | SHA is locked; we verified earlier the file structure matches expected pattern. If it doesn't match: revert, fix script in separate change. |
| Vendored code uses syntax not supported by our tsconfig (target ES2022, module Node16) | low | high | Pre-flight `npm run typecheck` is a hard gate. If typecheck fails: revert, decide whether to bump tsconfig or patch vendored file. |
| Vendored code imports a runtime dep we don't have in `dependencies` | low | medium | `npm run build` catches this. Closure was analyzed in D7 — should be self-contained. If new dep needed: revert, add dep in scope-correction. |
| HB-3 SIGINT test is flaky (timing-dependent) | medium | low | Use generous 5-second timeout per test. If still flaky: mark as `.skip` and open follow-up issue (not a blocker for this change). |
| Continuous-release publishes 0.3.0 before review is complete | medium | medium | Use `[skip ci]` in WIP commits (NOT the final feat commit). Only the final commit message triggers the release pipeline. |

## Open Questions

None. All architectural decisions inherited from `init-package-scaffold` D1-D14.
