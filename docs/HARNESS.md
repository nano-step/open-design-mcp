# Harness

<!-- generated-by: harness-init v0.1.0 -->
<!-- project: Open Design MCP -->

The app is what users touch. The harness is what agents touch.

This harness classifies every change by risk lane, requires a proposal-and-review
cycle for non-trivial changes, and enforces a validation + user-flow test +
review gate before any work is archived.

## Mental Model

```text
┌─────────────────────┐
│   Human intent      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  GitHub Issue       │  gh issue create --repo nano-step/open-design-mcp
│  (skeleton)         │  title from user intent, lane TBD, body = raw request
│                     │  → returns #N (tracker for the whole flow)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Feature Intake     │  classify risk → choose lane
│                     │
│                     │  → update issue: add lane:* + change-type:* labels
└────────┬────────────┘
         │
         ├── tiny ──► patch + validate + close issue #N (single comment with diff)
         │
         ▼  normal / high-risk
┌─────────────────────┐
│  Propose            │  openspec new change "<name>" → proposal.md + design.md + tasks.md
│                     │  → update issue #N: link proposal location
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Deep-Design        │  spawn deep-design agent → find gaps, ambiguities, risks
│  Gap Analysis       │  (Metis + Oracle in parallel → cross-critique → synthesis)
└────────┬────────────┘
         │
         ├── gaps found ──► revise proposal/design ──► re-run deep-design
         │
         ▼  clean pass

┌─────────────────────┐
│  Specs + Story      │  acceptance criteria per behavior slice
│                     │  story in docs/stories/ (link proposal + issue)
│                     │  update docs/TEST_MATRIX.md with expected proof
│                     │  → update issue #N: paste synthesis + acceptance criteria
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Branch             │  detect base (develop if exists, else master)
│                     │  git checkout -b <type>/<N>-<slug> $BASE
│                     │  see § Issue → Branch → PR → Review Loop → Merge
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Implement          │  work through tasks list
│                     │  npm must stay green
│                     │
│                     │  → update issue #N: tick off tasks as completed
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Validate           │  run validation ladder appropriate to lane
└────────┬────────────┘
         │
         ├── fail ────► fix → re-validate (max 2 attempts before consulting Oracle)
         │
         ▼  pass
┌─────────────────────┐
│  User-Flow Test     │  run test through user's entry point matching changed surface
│                     │  Exempt if change type = infra/refactor/docs (see § Change Types)
└────────┬────────────┘
         │
         ├── fail ────► fix → re-test (max 2 attempts)
         │
         ▼  pass
┌─────────────────────┐
│  Review Gate Loop   │  fresh reviewer (≠ implementer) verifies criteria
│  (max 5 iters)      │  findings classified high / medium / low
│                     │  → update issue #N: paste Review Verdict + evidence
└────────┬────────────┘
         │
         ├── ≥1 high & iter<5 ──► fix highs → re-review (next iteration)
         │
         ├── ≥1 high & iter=5 ──► STOP. label status:blocked + escalate human
         │
         ▼  0 high findings (PASS)
         (file remaining medium/low as follow-up issues before merge)
┌─────────────────────┐
│  PR + Bot Review    │  push branch → open PR (gh pr create --body 'Closes #N')
│  Loop               │  automated PR review
│                     │  agent reads PR comments → fix → re-validate → re-test
└────────┬────────────┘
         │
         ├── bot comments ──► triage → fix or justify → push again
         │
         ▼  approved
┌─────────────────────┐
│  Harness Delta      │  merge PR → openspec archive "<name>"
│                     │  update docs/stories/, docs/decisions/, docs/TEST_MATRIX.md
│                     │  capture friction → HARNESS_BACKLOG.md if needed
│                     │  → close issue #N with link to merged PR
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   Next intent       │
└─────────────────────┘
```

Every task has two possible outputs:

1. **Product delta**: app code, tests, API shape, data model, or product docs.
2. **Harness delta**: docs, templates, validation expectations, backlog items, or
   decision records that make the next task easier.

## Issue → Branch → PR → Review Loop → Merge

This section codifies the end-to-end ownership chain for every harness task.
It is not optional — implementing without an issue, branch, or PR is a harness
violation (see § Forbidden Practices).

### 1. Issue is the unit of work

Every feature, bug, or task — anything that produces a product or harness
delta — **MUST** begin as a GitHub issue created via `gh issue create`. No
issue, no work.

```bash
gh issue create \
  --repo nano-step/open-design-mcp \
  --title "<imperative summary>" \
  --body "<raw user request + assumptions>"
# → returns the issue number N — record it; everything downstream cites #N
```

Apply `lane:*` + `change-type:*` labels as soon as Feature Intake classifies the
request (see § GitHub Issue Tracking → Labels).

Exceptions to issue creation: pure conversational questions, read-only
exploration, interactive setup. When in doubt, create the issue — closing is
cheap.

### 2. Branch is created from the correct base

Before any implementation work begins, the agent **MUST** create a feature
branch via `git checkout -b <branch> <base>`. Direct commits to `master` or
`develop` are forbidden.

**Base-branch detection** (run this exact check before branching):

```bash
git fetch --quiet origin
if git ls-remote --heads origin develop | grep -q develop; then
  BASE=develop
else
  BASE=master
fi
echo "Base branch: $BASE"
```

If `origin/develop` exists, branch from `develop`. Otherwise branch from
`master`. Never branch from another feature branch.

**Branch naming convention** — match the issue's `change-type:*` label and
include the issue number plus a short slug:

| change-type | Branch prefix | Example |
|---|---|---|
| `user-feature` | `feat/` | `feat/123-add-totp-2fa` |
| `bug-fix` | `fix/` | `fix/124-otp-not-arriving` |
| `infrastructure` | `chore/` | `chore/125-bump-node-20` |
| `refactor` | `refactor/` | `refactor/126-extract-auth-helper` |
| `docs` | `docs/` | `docs/127-update-readme` |
| `dependency-bump` | `chore/` | `chore/128-bump-zod-3.24` |

```bash
git checkout -b feat/123-add-totp-2fa "$BASE"
```

### 3. Issue ↔ PR is a 1:1 relationship

Every issue **MUST** be closed by exactly one PR, and every PR **MUST** close
exactly one primary issue via `Closes #N` in its body. No orphan issues, no
orphan PRs.

```bash
gh pr create \
  --repo nano-step/open-design-mcp \
  --base "$BASE" \
  --title "<conventional-commit-style title>" \
  --body "Closes #<N>

<short summary + evidence links>"
```

If a single PR genuinely resolves multiple issues, list them as `Closes #A,
Closes #B, Closes #C` — each issue still belongs to one PR. Splitting one
issue across multiple PRs is a sign the issue was scoped too large — close it
and open narrower issues instead.

### 4. Review Gate runs as a bounded loop

Per § Review Gate, a fresh reviewer (≠ implementer) verifies acceptance
criteria with cited evidence. Findings are classified by severity, and the
loop is capped:

- Reviewer assigns each finding a severity: **`high`**, **`medium`**, or
  **`low`** (see § Review Gate → Severity Classification for definitions).
- After each FAIL verdict, the implementer fixes any `high` findings and may
  defer `medium` / `low` to follow-up issues.
- Reviewer re-runs the gate. **Maximum 5 iterations.**
- If iteration 5 still reports any `high` finding, the loop **STOPS** and
  the issue is escalated to a human (label `status:blocked` + comment with
  the unresolved high findings).

### 5. Merge gate is severity-based

A PR may merge only when **all** of the following hold:

1. The latest Review Gate iteration reports **zero `high`-severity findings**.
2. Every outstanding `medium` or `low` finding has been filed as a follow-up
   GitHub issue (`gh issue create ... --body "Follow-up from #<N>..."`),
   with the follow-up issue numbers linked in the PR body.
3. The PR Bot Review Loop (§ PR + Bot Review Loop) has approved or the PR
   carries a documented human override.
4. All validation layers required by the lane have green output pasted in
   the PR (or linked from `docs/stories/<name>.md`).

If any condition fails, the PR is not mergeable — fix or escalate.

### 6. Compliance Checklist Tooling (`npm run harness:check`)

Every change has a story file in `docs/stories/<slug>.md` based on
`docs/templates/story.md`. The top section is a **Harness Compliance
Checklist** with one checkbox per phase of this flow. Reading the story file
answers "did the agent forget anything?" at a glance.

```bash
npm run harness:check -- --list                     # list known stories
npm run harness:check -- <slug>                     # default: any unchecked box → fail
npm run harness:check -- <slug> --pre-merge         # only merge-blockers must be ticked
npm run harness:check -- <slug> --strict            # zero tolerance
npm run harness:check -- --all                      # check every story
```

Exit codes: `0` = pass, `1` = unchecked items in the active mode, `2` = story
file missing or usage error.

**When to run:**

- Before opening a PR: `npm run harness:check -- <slug> --pre-merge` must
  return 0. Merge-blocking phases are: `issue`, `propose`, `specs`, `story`,
  `branch`, `implement`, `validate`, `review-gate`, `pr-opened`, `pr-bot`.
- Before `openspec archive`: `npm run harness:check -- <slug>` must return 0
  in default mode (which also catches `merged`, `archived`, `test-matrix`,
  `issue-closed`).
- During implementation: run anytime to see what's outstanding — the output
  is the live to-do list for the change.

**Authoring the checklist:** copy the section from
`docs/templates/story.md` verbatim. Do not invent new phase names — the
script only knows the canonical set. If a phase is genuinely N/A for a lane
(e.g. `propose` for `lane:tiny`), tick it and note "N/A — reason" in the
label.

## Source Hierarchy

```text
Human intent / prompt
  └── GitHub Issue tracker (nano-step/open-design-mcp)
  └── Feature Intake (docs/FEATURE_INTAKE.md)
        └── OpenSpec change proposal (openspec/changes/<name>/)
              ├── proposal.md   — what and why
              ├── design.md     — how (architecture, data model, API shape)
              ├── specs/        — one spec per behavior slice
              └── tasks.md      — implementation checklist
        └── Story packet (docs/stories/<name>.md)
              └── links to OpenSpec change, lists acceptance criteria
        └── docs/TEST_MATRIX.md
              └── maps each story to unit / integration / E2E proof
        └── docs/decisions/
              └── records why contracts or architecture changed
```

Before implementation, product docs and proposal artifacts describe intent.
After implementation, those artifacts plus passing tests are the living contract.

## OpenSpec Integration

OpenSpec is the **proposal and design layer** of this harness. Every normal or
high-risk change must have an OpenSpec change before implementation starts.

### Commands
```bash
openspec new change "<name>"            # scaffold change directory
openspec validate "<name>" --strict     # validate all artifacts
openspec archive "<name>"               # archive after merge
```

## Deep-Design Gap Analysis

After the proposal produces `proposal.md` and `design.md`, run **deep-design**
before locking any spec.

- Spawns Metis (scope/risk) + Oracle (architecture) in parallel
- Cross-critiques their findings
- Produces a confidence-scored synthesis: gaps, ambiguities, hidden risks

### Gate rule

```text
deep-design pass (no blocking gaps)
  → proceed to specs/ + story packet

deep-design finds gaps
  → revise proposal.md or design.md
  → re-run deep-design
  → repeat until clean pass
```

A gap is blocking if it touches: auth, data model, API contract, isolation
boundary, or multi-domain scope. Stylistic gaps are non-blocking.

## Spec Lifecycle

Ongoing work enters the harness as one of these input types:

| Type | What to do |
|---|---|
| New spec | Populate `docs/product/`, create candidate story list, run deep-design on scope |
| Spec slice | Propose → deep-design → specs/ → story → implement |
| Change request | Propose → deep-design (if normal+) → story → implement |
| New initiative | Initiative notes in `docs/stories/` + multiple proposals |
| Maintenance | Story packet only (no proposal required for tiny) |
| Harness improvement | Direct docs update or `HARNESS_BACKLOG.md` |

Do not extend a monolithic spec. Use change proposals + story packets as the
living surface.

## Growth Rule

The harness grows from friction.

When an agent is confused, repeats manual reasoning, needs a new validation
command, discovers a missing rule, or sees a recurring failure pattern, it must
either improve the harness directly or add a proposal to `HARNESS_BACKLOG.md`.

## Validation Ladder

Run the layers appropriate to the lane. Never claim a layer passes without
running it and seeing exit code 0.

```text
validate:quick   (always — every lane)
  npm run lint && npm run typecheck && npm test

test:integration   (normal + high-risk)
  vitest run --config vitest.integration.config.ts

test:e2e   (high-risk or when UI behavior changes)
  # N/A

test:release   (before deploy)
  curl -fsS $OD_DAEMON_URL/api/projects
```

**Lane → required layers:**

| Lane | validate:quick | test:integration | test:e2e |
|------|:-:|:-:|:-:|
| tiny | ✓ | — | — |
| normal | ✓ | ✓ | — |
| high-risk | ✓ | ✓ | ✓ |

Agents must not claim a layer passes until it has been run and output verified.

## Change Types

The validation ladder is necessary but not sufficient. The **change type**
determines whether user-flow testing and review gate apply.

| Change type | E2E required? | Review gate? | Example |
|-------------|:-:|:-:|---|
| **user-feature** (new behavior, new surface) | ✅ | ✅ | new endpoint, new UI page |
| **bug-fix** (user-visible defect) | ✅ | ✅ | "OTP not arriving", broken response |
| **infrastructure** (migrations, config, deploy) | ❌ smoke test sufficient | ⚠️ self-verify | DB migration, env var change |
| **refactor** (same I/O) | ❌ existing tests pass | ⚠️ self-verify | extract helper, rename internal symbol |
| **docs** (markdown / comments only) | ❌ | ❌ | README, ADR write-up |
| **dependency-bump** | ❌ smoke test | ⚠️ self-verify | upgrade library version |

**Combined gate:** Lane × Change Type. Both must pass to proceed.

For change types marked **❌ smoke test** instead of E2E:
- Run a deterministic check that exercises the changed surface (e.g.
  `alembic upgrade head` for migrations, `import <app>` for refactors).
- Paste the output in story Evidence section.
- No user-flow test required — there is no user surface to test.

For change types marked **⚠️ self-verify**:
- Implementing agent runs the validation ladder and pastes output.
- No independent review agent required.
- Still subject to PR bot review (see below).

## User-Flow Testing

After validation ladder passes, run at least one test that exercises the
changed behavior through the **user's actual entry point**. Choose the tool
that matches the changed surface:

| Changed surface | Tool | Command |
|---|---|---|
| Bot / chat handler | Command simulator | `vitest run --config vitest.integration.config.ts` |
| Web UI | Playwright / Cypress | `# N/A` |
| REST API | API integration test | `vitest run --config vitest.integration.config.ts` |
| Backend-only (no user surface) | Existing integration tests | `vitest run --config vitest.integration.config.ts` |
| LLM / external service call | Live smoke script | `curl -fsS $OD_DAEMON_URL/api/projects` |

**Lane × user-flow requirement:**

| Lane | User-flow test required? |
|------|:-:|
| tiny | No (escalate to normal if user-visible behavior changes) |
| normal | Yes — at least 1 test covering the primary changed behavior |
| high-risk | Yes — cover primary + at least 1 error/edge path |

**E2E not applicable**: If change type is infra/refactor/docs/deps, write
"E2E: not applicable — [reason]" in the story Evidence section. The review
gate validates this justification.

**Happy-path-only is insufficient for high-risk**: at minimum cover one
error/edge path (auth fail, rate limit, malformed input, etc.).

## Review Gate

After user-flow tests pass, a **fresh review agent** verifies the implementation.
The reviewer **must not be** the implementing agent.

**What the reviewer checks:**
1. Read `git diff <default-branch>` + the proposal, design, and spec.
2. For each acceptance criterion, find evidence (test output, screenshot,
   command result) that it is satisfied.
3. Produce a verdict: **PASS** (zero `high` findings) or **FAIL** (one or more
   `high` findings). All findings — at every severity — are listed.

**Lane × Change Type → review requirement:**

| Lane | user-feature / bug-fix | infra / refactor / deps | docs |
|------|---|---|---|
| tiny | n/a (escalate if user-visible) | self-verify | none |
| normal | Single Oracle review | self-verify | none |
| high-risk | Full review-work skill (5 parallel sub-agents) | single Oracle | n/a |

### Severity Classification

The reviewer assigns each finding exactly one severity. These are normative
definitions — apply them consistently:

| Severity | Definition | Examples |
|---|---|---|
| **`high`** | Blocks merge. The change is incorrect, unsafe, or violates an explicit acceptance criterion / spec / harness rule. | Spec criterion unmet; security flaw; data corruption risk; broken backward compat; vendor pristine violated; failing tests merged; type-safety suppression; missing required evidence |
| **`medium`** | Should be addressed, but does not block merge. Filed as a follow-up issue before merge. | Suboptimal but correct logic; missing edge-case test; unclear naming in public API; minor doc gap |
| **`low`** | Nice-to-have. Filed as a follow-up issue before merge. | Stylistic nits; opportunistic refactor opportunities; non-public-API naming |

If a reviewer is unsure between two severities, pick the higher one — better
to over-flag than under-flag.

### Review Loop (max 5 iterations)

```text
Iteration 1
  Reviewer runs gate → verdict + findings
    │
    ├── 0 high findings ──► PASS → proceed to merge gate
    │
    ▼  ≥1 high finding(s)
Iteration 2: implementer fixes ALL high findings → reviewer re-runs
    │
    ├── 0 high ──► PASS
    │
    ▼  ≥1 high
Iteration 3, 4, 5: same pattern
    │
    ▼
After iteration 5 still has ≥1 high finding
    │
    ▼
STOP. Do NOT merge. Label issue `status:blocked`, comment on the issue with
the unresolved high findings, and tag a human reviewer. Resume only on
explicit human direction.
```

**Loop rules:**

- **Cap is 5 iterations**, counted as "review runs" not "fix attempts". A
  re-review with zero changes does not consume an iteration.
- **All `high` findings must be addressed in each iteration** — partial fixes
  reset confidence and consume a slot.
- **`medium` / `low` findings may carry over** across iterations as long as
  they are filed as follow-up issues before merge (see merge gate).
- **The reviewer must cite evidence per finding** — file path + line number,
  test output, command result, or spec reference. Findings without evidence
  are dropped.

### Review output format

```text
## Review Verdict: PASS | FAIL

Reviewer: <agent name>
Iteration: <1-5>
Date: YYYY-MM-DD
Commit: <sha>

### Acceptance Criteria
| Criterion | Evidence | Status |
|---|---|---|
| "Users can upload receipt photo" | test_receipt_upload.py:42 passes | ✓ |
| "Items appear in inventory" | simulator output shows items listed | ✓ |

### Findings
| # | Severity | File:Line | Description | Suggested fix |
|---|---|---|---|---|
| 1 | high | src/handlers/upload.ts:88 | Missing auth check on POST | Add `requireUser(req)` before line 88 |
| 2 | medium | src/handlers/upload.ts:120 | No test for >10MB upload | Add test in receipt_upload_test.ts |
| 3 | low | src/handlers/upload.ts:34 | Variable `r` should be `req` | Rename |

### Verdict
- PASS: 0 high findings → merge gate next.
- FAIL: <N> high findings → implementer fixes, reviewer re-runs (iteration <X+1> of 5).
```

**Rules:**
- `openspec archive "<name>"` is forbidden until Review Verdict = PASS.
- Merge is forbidden until § Issue → Branch → PR → Review Loop → Merge §5
  merge gate conditions are all met.

## PR + Bot Review Loop

After the local Review Gate passes, push branch and open a PR. The PR triggers your configured automated reviewer.

```text
1. Push branch + open PR
        │
        ▼
2. PR bot posts review comments
        │
        ├── comments substantive ──► agent reads → fix → push
        │                            │
        │                            ▼
        │                   re-run validate + user-flow test
        │                            │
        │                            ▼
        │                   if substantive impl change → re-run Review Gate
        │                            │
        │                            ▼
        │                   wait for bot re-review
        │
        ├── comments stylistic only ─► address inline or reply with reason
        │
        ▼
3. Bot approves → merge → openspec archive "<name>"
```

**Rules for handling PR comments:**

- **Read every comment.** Do not collapse / dismiss without action or reasoned reply.
- **Substantive comment** (correctness, security, missing case): MUST fix.
  After fix, re-run validate + user-flow + Review Gate before pushing.
- **Stylistic comment** (naming, ordering, preference): fix if cheap, or reply
  with reasoning and tag for human review.
- **Disagreement**: do NOT silently dismiss. Reply with rationale; tag human.
- **Loop limit**: max 3 push cycles per PR. After 3, escalate to human review.
- **Never**: force-push to bypass bot, dismiss without reading, or merge
  without bot approval (unless human override documented in PR).

The PR review loop is not optional. It is the final correctness gate before
the change becomes part of the trunk.

## Forbidden Practices

1. **Claiming "tests pass" without output.** Paste the command and its exit code.
   A claim without evidence is not a claim.
2. **Self-review.** The implementing agent must not perform its own Review Gate.
   Use review-work skill or spawn a fresh review agent.
3. **Skipping user-flow tests for "refactors."** If the refactor changes
   observable behavior (response shape, timing, error messages, side effects),
   it needs a user-flow test. Only pure internal refactors (identical I/O)
   qualify as "E2E not applicable."
4. **Happy-path-only E2E for high-risk changes.** High-risk must cover at least
   one error or edge path.
5. **Archiving without review verdict.** openspec archive "<name>" is blocked until
   the story shows Review Verdict = PASS with per-criterion evidence.
6. **Backdating evidence.** Evidence must reference the current implementation
   commit, not a previous passing run.
7. **Force-pushing to bypass PR bot review.** PR bot must approve or be
   overridden by documented human decision.
8. **Dismissing PR comments without action or reasoned reply.** Every
   substantive comment requires a fix or a documented disagreement.
9. **Starting work without a GitHub issue.** Every new user request (except
   pure conversational queries) must have a GitHub issue created BEFORE
   classification. Working without an issue ID = invisible work.
10. **Stale issue.** If implementation progresses but the issue isn't updated
    at the milestones in § GitHub Issue Tracking, the change is in violation.
11. **Committing to `master` or `develop` directly.** Every harness task
    works on a feature branch created from the correct base via
    `git checkout -b <type>/<N>-<slug> $BASE`. See § Issue → Branch → PR →
    Review Loop → Merge §2 for base-branch detection.
12. **Orphan PR or orphan issue.** A PR without `Closes #N` in its body, or
    an issue with no linked PR after implementation begins, violates the 1:1
    issue↔PR rule.
13. **Merging with `high`-severity review findings.** The merge gate
    (§ Issue → Branch → PR → Review Loop → Merge §5) requires zero `high`
    findings on the latest review iteration. `medium` / `low` findings must
    be filed as follow-up issues before merge.
14. **Exceeding the 5-iteration Review Gate cap without escalation.** If
    iteration 5 still has `high` findings, the loop must STOP and the
    issue must be labeled `status:blocked` with a comment listing the
    unresolved findings. Continuing to loop past 5 is a violation.

## GitHub Issue Tracking

Every user request that triggers harness work (not a pure question) gets a
GitHub issue in `nano-step/open-design-mcp`. **Create early, update at every milestone.**

### When to create

**Create immediately after Intent Gate, BEFORE Feature Intake classification.**

The issue starts as a skeleton with the raw user request. It evolves as the
flow progresses.

**Skip issue creation for:**
- Pure conversational questions ("how does X work?")
- Read-only exploration that doesn't produce a deliverable
- Interactive setup tasks initiated by the user

When unsure: create the issue. Closing is cheap.

### Issue lifecycle

| Phase | Action | Command |
|-------|--------|---------|
| Intent | Create skeleton issue | `gh issue create --repo nano-step/open-design-mcp --title "<intent>" --body "<raw request + assumptions>"` |
| Intake | Add lane + change-type labels | `gh issue edit <N> --add-label "lane:normal,change-type:user-feature"` |
| Proposal | Comment with location | `gh issue comment <N> --body "Proposal: <location>"` |
| Deep-design | Comment with synthesis | `gh issue comment <N> --body "Deep-design: $verdict"` |
| Specs | Comment with acceptance criteria | `gh issue comment <N> --body "Acceptance: ..."` |
| Implementation | Comment per major task | `gh issue comment <N> --body "Implemented: ..."` |
| User-flow test | Comment with proof | `gh issue comment <N> --body "User-flow PASS: ..."` |
| Review Gate | Comment Review Verdict | `gh issue comment <N> --body "Review: PASS — ..."` |
| PR | Link PR to issue | `gh pr create ... --body "Closes #<N>"` |
| Archive | Close issue | auto-closed by PR merge (via `Closes #N`) |

### Labels

Apply `lane:*` + `change-type:*` (+ optional `status:*`) labels as soon as
classification completes. See `scripts/setup_labels.sh` in this skill or run:

```bash
bash ~/.config/opencode/skills/harness-init/scripts/setup_labels.sh nano-step/open-design-mcp
```

