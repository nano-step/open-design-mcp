# AGENTS.md — open-design-mcp

Project-local agent rules. **This file overrides the user-global
`~/.config/opencode/AGENTS.md` for sessions opened in this repository only.**
Outside this repository (e.g. anything under `Nustechnology/`), the global rules
remain in effect — do not generalize anything below to other repos.

This is a personal project owned by `kokorolx`. Safety here comes from the
harness flow (`docs/HARNESS.md`), not from per-command human confirmation.

---

## 1. Commit / Push / PR / Merge Autonomy (Project-Local Override)

### What changes vs. global

The user-global `~/.config/opencode/AGENTS.md` enforces:

> "Only commit, amend, push, or create PRs when explicitly requested."

**That rule does NOT apply inside this repository.** In this repo, the
orchestrator (Sisyphus) and every delegated subagent (Sisyphus-Junior,
explore, librarian, oracle, etc.) **MAY** perform the following git / GitHub
operations without asking first, provided the conditions in §2 are met:

| Operation | Allowed without asking? |
|---|:-:|
| `git add` / `git restore --staged` | ✅ Yes |
| `git commit` (Conventional Commit, no AI-attribution trailers) | ✅ Yes |
| `git checkout -b <branch> <base>` | ✅ Yes |
| `git push -u origin <branch>` (non-force) | ✅ Yes |
| `gh issue create` / `gh issue edit` / `gh issue comment` / `gh issue close` | ✅ Yes |
| `gh pr create` / `gh pr edit` / `gh pr comment` | ✅ Yes |
| `gh pr merge` (with `--squash` or `--rebase`, never `--admin`) | ✅ Yes |
| `gh label create` / `gh label edit` (label hygiene) | ✅ Yes |
| `openspec archive <name>` after a merged PR | ✅ Yes |

### Subagent inheritance

This autonomy is **inherited by every delegated subagent** spawned from this
session (Sisyphus-Junior via `task()`, plus `explore`, `librarian`, `oracle`,
`metis`, `momus`, `review-work`, and any others). Delegated agents do not need
re-confirmation — they are bound by the same conditions and stop-rules as the
orchestrator.

When delegating, the orchestrator should still pass the relevant harness
context (issue number, branch name, review-iteration count) in the prompt so
the subagent can self-verify the conditions in §2 before acting on git.

---

## 2. Mandatory Preconditions (Harness Compliance)

The autonomy in §1 is granted **only while the harness flow in
`docs/HARNESS.md` is being followed**. Concretely, before any
commit / push / PR / merge action, the agent must verify:

1. **An issue exists.** A GitHub issue tracks this work in
   `nano-step/open-design-mcp`, with `lane:*` and `change-type:*` labels
   applied. (See HARNESS § GitHub Issue Tracking.)
2. **A feature branch is checked out.** The work is on a branch created from
   the correct base (`develop` if it exists in `origin`, else `master`) and
   named per the convention `<feat|fix|chore|refactor|docs>/<N>-<slug>`.
   (See HARNESS § Issue → Branch → PR → Review Loop → Merge §2.)
3. **For commits:** Validation ladder for the lane has been run and passed
   (`npm run lint`, `npm run typecheck`, `npm test`, plus `npm run
   test:integration` for normal/high-risk, plus `npm run vendor:check` for
   any change touching code paths that consume `vendor/od-contracts/`).
4. **For `gh pr merge`:** The Review Gate Loop has returned PASS (zero
   `high`-severity findings) on the latest iteration, and any outstanding
   `medium` / `low` findings have been filed as follow-up issues with their
   numbers linked in the PR body.
5. **PR Bot Review Loop**, if configured for this repo, has approved (or a
   documented human override is present in the PR description).

If **any** precondition fails, the agent **MUST** ask the human before
proceeding — autonomy lapses and reverts to global-rule behavior for that
specific action.

---

## 3. Stop Conditions (Autonomy Revokes Immediately)

Autonomy is revoked the instant any of the following occurs. When revoked,
the agent stops the in-flight git/gh action, reports state to the human, and
waits for explicit direction.

1. **Human says "stop" / "wait" / "don't push" / "don't commit" / "don't
   merge"** — or any reasonable paraphrase. Default to revocation on ambiguity.
2. **Harness violation detected** (no issue, wrong base branch, missing labels,
   skipped validation, Review Gate not PASS, ≥1 `high`-severity finding open,
   iteration cap of 5 reached without resolution).
3. **Destructive operation requested** — see §4.
4. **Vendor pristine check fails** (`npm run vendor:check` non-zero) —
   never commit edits to `vendor/od-contracts/` without explicit human
   approval and a documented MODIFICATION header per Apache 2.0 §4(b).
5. **Working tree contains uncommitted files outside the current session's
   scope.** Per the `git-commit` skill, only files touched in the current
   session may be staged. Files left over from a prior session require a
   fresh confirmation before bundling.
6. **PR Bot Review posts a `request-changes` review** that the agent cannot
   address from public context (e.g. needs a secret, a credential decision,
   a product-direction call).
7. **Merge conflicts on rebase / merge that require human judgment** (e.g.
   conflicting business logic, not mechanical conflicts). Mechanical
   conflicts may be resolved autonomously and pushed.

---

## 4. Forbidden Even Under Autonomy (Hard Blocks)

These operations are **always** forbidden in this repo without an explicit
per-operation human go-ahead, regardless of harness state:

1. `git push --force` / `git push -f` / `git push --force-with-lease` on any
   branch.
2. `git push origin :<branch>` (remote branch deletion).
3. `git reset --hard origin/<branch>` followed by push (history rewrite).
4. `git commit --amend` on a commit that has already been pushed to `origin`.
5. `git rebase -i` / `git filter-repo` / any history rewrite on a published
   branch.
6. `gh pr merge --admin` (bypasses branch protection).
7. `gh release create` / `npm publish` / `npm version` — release operations
   stay human-gated even though "auto publish version" exists as a CI hook.
   The agent may prepare release notes / CHANGELOG entries but does not
   trigger the cut.
8. Pushing to `master` or `develop` directly (PR-only merge is enforced by
   the harness — bypassing it is forbidden even with admin rights).
9. Edits to `vendor/od-contracts/` without an Apache 2.0 §4(b) MODIFICATION
   header and explicit human approval.
10. Modifying `~/.config/opencode/AGENTS.md` (the global rules) or any file
    under `~/.config/opencode/skills/*` (user-global skills) from this
    project session — those are user-level, not project-level.
11. Committing or pushing secrets, BYOK keys, `.env*` files, or any token.
    The agent must scrub before staging.

If a forbidden operation is genuinely required (e.g. force-push to fix a
broken history during a stuck rebase), the agent **MUST** ask first with a
short justification, and may proceed only on explicit human confirmation.

---

## 5. Commit & PR Style (Reaffirmed)

Even with autonomy, every commit and PR follows the same style the
`git-commit` skill enforces:

- **Conventional Commits** — `feat:`, `fix:`, `docs:`, `refactor:`,
  `chore:`, `test:`, `ci:`, `build:`, `perf:`. Scope optional but encouraged
  for multi-area repos (e.g. `feat(lint): …`).
- **No AI-attribution trailers.** Never add `Co-authored-by: Claude`,
  `Generated-by: …`, or similar. Commits are authored by the human owner of
  the repo.
- **Imperative subject ≤ 72 chars.** Body wraps at 72; explain the *why*,
  not the *what* (the diff already shows the what).
- **One logical change per commit.** Mixed-purpose commits get split.
- **PR body must include `Closes #N`** linking the tracking issue.
- **Session-scoped staging.** Only files touched in the current session are
  staged; leftover files from prior sessions require fresh confirmation.

---

## 6. Verification After Autonomous Action

After any autonomous git / gh action, the agent **MUST** report to the human
in the next turn — succinctly — what was done and where to look:

```
✅ Pushed feat/123-add-totp-2fa to origin
   PR: https://github.com/nano-step/open-design-mcp/pull/142
   Closes: #123
   Review Gate: PASS (iter 2, 0 high)
   Follow-ups filed: #143 (medium), #144 (low)
```

This is not optional — opacity erodes the trust that makes autonomy work.

---

## 7. Scope Reminder

Everything above applies **only inside this repository**
(`/Users/tamlh/workspaces/self/AI/Tools/open-design-mcp`). For any other
working directory — especially anything under `Nustechnology/` — the
user-global `~/.config/opencode/AGENTS.md` rules apply unchanged. Do not
copy this file into other repos without explicit instruction.

---

## 8. Cross-References

- Harness flow & severity loop → `docs/HARNESS.md`
- Session-scoped staging rules → `~/.config/opencode/skills/git-commit/SKILL.md`
- OpenSpec change lifecycle → `openspec/AGENTS.md`
- Vendor integrity policy → `vendor/od-contracts/VENDORED_FROM.md` &
  top-level `NOTICE`
