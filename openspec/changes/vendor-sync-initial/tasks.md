# Tasks: vendor-sync-initial

> **Revision**: v2. Per Metis findings (`bg_2aaef543`): new T-2.5 (gitignore + strengthen vendor-check.sh), T-3 verification refined (exact-count + grep assertions), T-8 retargeted to `resources/list` per HB-3 verbatim.

Ordered execution plan. Each task has a verification command that MUST exit 0 (or produce the documented output) before the next task starts.

## T-1: Pre-flight baseline check

**Goal:** Confirm scaffold is healthy before running vendor-sync.

**Steps:**
1. `git status` — confirm clean working tree on branch `feat/vendor-sync-initial`
2. `bash scripts/vendor-check.sh` — confirm scaffold invariants hold (expect `vendor-check: ok`)
3. `npm run lint` — exit 0
4. `npm run typecheck` — exit 0
5. `npm test` — 7 unit tests pass
6. `npm run build` — produces `dist/src/server.js`
7. `npm run test:integration` — 3 integration tests pass

**Verification:** All 7 commands exit 0.

## T-2: Confirm upstream availability

**Goal:** Ensure the pinned upstream SHA is reachable.

**Steps:**
1. Run a sanity probe (e.g. `git ls-remote https://github.com/nexu-io/open-design.git`) to confirm network access works AND that commit `7766582f0bd75d2dce31b2f9db01a482af801897` exists.
2. Optionally pre-cache the upstream into `/tmp/opencode/open-design` for faster sync.

**Verification:** `git ls-remote` returns at least one ref. If using cached clone, `git -C /tmp/opencode/open-design log -1 --oneline 7766582` returns one line.

## T-2.5: Pre-sync hardening (Metis M-1 + VS-9 + VS-10)

**Goal:** Land defensive infrastructure BEFORE running vendor-sync, so the sync itself runs against the strengthened gates.

**Steps:**
1. Edit `.gitignore` — append:
   ```
   # Vendor sync byproducts (created by scripts/vendor-sync.sh)
   .vendor-backup-*/
   .vendor-diff-report-*.txt
   ```
2. Edit `scripts/vendor-check.sh` — add the 3 VS-10 conditional checks (file count, chat.ts patch, Modifications log) AFTER the existing checks, BEFORE the final `vendor-check: ok` line. The conditionals key on `[[ -f vendor/od-contracts/src/api/chat.ts ]]` so the script remains backward-compatible.
3. `bash scripts/vendor-check.sh` — must STILL exit 0 against pre-sync state (no .ts files yet)
4. `bash -n scripts/vendor-check.sh` — shell syntax valid

**Verification:**
- `cat .gitignore | grep -c '.vendor-backup-'` → `1`
- `bash scripts/vendor-check.sh; echo "exit=$?"` → ends with `exit=0`
- `bash -n scripts/vendor-check.sh; echo "syntax=$?"` → ends with `syntax=0`

**Commit boundary:** Stage `.gitignore` + `scripts/vendor-check.sh`. Commit message: `chore(vendor): harden vendor-check.sh + gitignore sync byproducts (Metis VS-9/VS-10)`. This commit is `chore:` (not feat) — triggers patch bump if pushed alone, but will be batched with the vendor-sync commit in the same push so semver detector sees the `feat:` and bumps minor anyway.

## T-3: Execute vendor-sync.sh

**Goal:** Copy 13 vendor files + patch chat.ts.

**Steps:**
1. Run `bash scripts/vendor-sync.sh 7766582f0bd75d2dce31b2f9db01a482af801897`
2. Observe stdout for the diff report (should mention 13 files copied, 1 modified with §4(b) header)
3. `git status` — confirm 13 new `.ts` files VISIBLE (untracked) in `vendor/od-contracts/src/`, plus modified `vendor/od-contracts/VENDORED_FROM.md`. `.vendor-backup-*` and `.vendor-diff-report-*` should be hidden by `.gitignore` (added in T-2.5).
4. `rm vendor/od-contracts/src/.gitkeep` (per Metis M-2 — no longer needed)

**Verification (Metis acceptance criteria — exact integer outputs):**
- `find vendor/od-contracts/src -name "*.ts" -type f | wc -l | tr -d ' '` → `13`
- `grep -c "from './files\.js'" vendor/od-contracts/src/api/chat.ts` → `1` or higher
- `head -15 vendor/od-contracts/src/api/chat.ts | grep -c 'MODIFICATION NOTICE'` → `1`
- `grep -c '^- \*\*chat\.ts\*\*' vendor/od-contracts/VENDORED_FROM.md` → `1`
- `ls vendor/od-contracts/src/.gitkeep 2>&1 | grep -c 'cannot access\|No such file'` → `1` (.gitkeep removed)
- `git status --porcelain | grep -E '^\?\? \.vendor-(backup|diff-report)' | wc -l | tr -d ' '` → `0` (gitignore working)

## T-4: Run vendor-check.sh

**Goal:** Confirm vendor invariants hold post-sync.

**Steps:**
1. `bash scripts/vendor-check.sh`

**Verification:** Exit 0. Output ends with `vendor-check: ok`.

## T-5: Type-check vendored sources

**Goal:** Confirm vendored .ts files compile under our tsconfig.

**Steps:**
1. `npm run typecheck`

**Verification:** Exit 0. Zero TypeScript errors.

**If this fails:** Read the error carefully. Common causes:
- Missing runtime dep → STOP, revert, open scope-correction issue. Do NOT add dep ad-hoc.
- Syntax/target mismatch → STOP, revert, escalate.
- chat.ts patch didn't apply correctly → STOP, revert, debug script.

## T-6: Build

**Goal:** Confirm tsc compiles vendor sources to dist/.

**Steps:**
1. `npm run build`

**Verification:**
- Exit 0
- `ls dist/vendor/od-contracts/src/api/projects.js` exists
- `ls dist/vendor/od-contracts/src/prompts/system.js` exists
- `head -1 dist/src/server.js` shows `#!/usr/bin/env node` shebang

## T-7: Run unit + existing integration tests

**Goal:** Confirm no regressions from vendor sources being in compile target.

**Steps:**
1. `npm test` — 7 unit tests
2. `npm run test:integration` — 3 existing integration tests (before HB-3 additions)

**Verification:** Both exit 0. 10 tests total pass.

## T-8: Add HB-3 integration tests

**Goal:** Add the two new integration tests per design.md VS-5 (HB-3 verbatim — `resources/list` and SIGINT).

**Steps:**
1. Open `tests/integration/initialize-handshake.test.ts`
2. Add test case `"rejects resources/list with -32601 (capability not advertised)"` — uses `Client` + `StdioClientTransport`, completes `initialize`, then calls `client.listResources()` and asserts the rejection has `error.code === -32601` (exact integer). DOES NOT use `tools/call({name: nonexistent_tool})` — that's a different invariant covered separately.
3. Add test case `"shuts down gracefully on SIGINT within 2 seconds"` — uses `child_process.spawn` directly (NOT `StdioClientTransport`), waits for stderr line containing `[open-design-mcp] ready`, sends `SIGINT`, asserts:
   - `child.exitCode === 0` (or `code === 0` in the `exit` event)
   - Elapsed time between SIGINT and exit < 2000 ms
   - After exit: `process.kill(child.pid, 0)` throws `ESRCH`
   - vitest test-level timeout: 5000 ms (framework safety net, NOT the behavioral assertion)

**Verification:**
- File reads correctly
- `npm run lint` exit 0
- `npm run typecheck` exit 0
- File contains exactly 2 NEW `it(...)` or `test(...)` blocks (verify via diff)

## T-9: Run full integration suite with HB-3 additions

**Goal:** Confirm 5 integration tests pass.

**Steps:**
1. `npm run test:integration`

**Verification:** Exit 0. Output shows ≥5 tests passing under `tests/integration/initialize-handshake.test.ts`.

## T-10: Full validation ladder

**Goal:** Final pre-commit gate.

**Steps:**
1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `bash scripts/vendor-check.sh`
6. `npm run test:integration`

**Verification:** All 6 exit 0. Capture output to `docs/evidence/vendor-sync-initial/validation.md`.

## T-11: Stage + commit

**Goal:** Two atomic commits for clear semver detection.

**Steps:**
1. Stage vendor + VENDORED_FROM changes: `git add vendor/od-contracts/`
2. Commit: `feat(vendor): vendor 13 OD contracts files at nexu-io/open-design@7766582`
   - Body: file list, modifications summary, validation evidence link, refs #4
3. Stage test changes: `git add tests/integration/`
4. Commit: `test(integration): add HB-3 coverage for -32601 + SIGINT graceful shutdown`
   - Body: scenarios per VS-5, refs #4

**Verification:** `git log --oneline -2` shows both commits with conventional-commit prefixes.

## T-12: Push + open PR

**Goal:** Trigger CI on PR.

**Steps:**
1. `git push -u origin feat/vendor-sync-initial`
2. Open PR via `gh pr create` with body including:
   - Closes #4
   - Validation evidence link
   - Two-commit rationale
   - HB-3 coverage notes

**Verification:** PR URL returned, CI starts. Watch with `gh run watch`.

## T-13: Oracle Review Gate

**Goal:** Independent verification before merge.

**Steps:**
1. Fire Oracle agent with full repo context, asking for verdict on:
   - Apache 2.0 §4(b) header text matches design VS-3 verbatim
   - Modifications log entry matches design VS-4
   - 13 files match D6 closure (no extras, no missing)
   - chat.ts imports all carry `.js` suffix
   - HB-3 tests assert correct error codes / signals
   - No accidental dependency additions
   - No regression in any of the 10+ test files

**Verification:** Oracle returns explicit `VERDICT: PASS` or actionable revisions. If revisions: address them, push fix commit, re-fire Oracle with `session_id`.

## T-14: Merge + archive

**Goal:** Land the change, update main specs, close issue.

**Steps:**
1. Wait for CI green on Node 20 + 22 matrix
2. `gh pr merge --squash --delete-branch`
3. `git checkout master && git pull --tags`
4. Verify continuous-release published `open-design-mcp@0.3.0` to npm (likely; minor bump from `feat:`)
5. `openspec archive vendor-sync-initial`
6. `git add openspec/ && git commit -m "chore(openspec): archive vendor-sync-initial"`
7. `git push origin master`
8. Confirm issue #4 closed (auto via `Closes #4` in PR body)

**Verification:**
- `npm view open-design-mcp version` returns ≥ `0.3.0`
- `openspec list` shows no active changes
- Issue #4 status: closed
- GitHub release `v0.3.0` exists with categorised changelog
