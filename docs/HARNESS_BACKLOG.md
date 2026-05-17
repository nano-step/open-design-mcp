# Harness Backlog

<!-- generated-by: harness-init v0.1.0 -->

Use this file when an agent discovers a missing harness capability but should
not change the operating model immediately.

## Template

```md
## Missing Harness Capability

### Title

Short name.

### Discovered While

Task or story that exposed the gap.

### Current Pain

What was hard, repeated, ambiguous, or unsafe?

### Suggested Improvement

What should be added or changed?

### Risk

Tiny, normal, or high-risk.

### Status

proposed | accepted | implemented | rejected
```

## Items

### HB-1: Force-push exception clause for pre-PR author rewrites

#### Discovered While
init-package-scaffold story T-3 (committing then realizing git author identity was wrong before any PR opened).

#### Current Pain
HARNESS § Forbidden Practices #7 forbids force-push without nuance. There is a legitimate window (pre-PR, before any reviewer or bot has seen the work) where rewriting commit identity, splitting commits, or rebasing onto a fresher base IS safe — but the rule reads as a blanket ban.

#### Suggested Improvement
Add a clarifying clause to § Forbidden Practices #7:

> Force-pushing is forbidden once a PR is open OR once another collaborator has fetched the branch, whichever comes first. Pre-PR identity / amend / squash operations on a private feature branch are permitted, but the next push event resets the "private" status — after that, force-push requires explicit human decision documented in the issue.

#### Risk
tiny (documentation only)

#### Status
proposed

---

### HB-2: Codify Metis/Oracle re-check pattern using session_id

#### Discovered While
init-package-scaffold deep-design phase. After v1 revision, re-ran Metis with the same `session_id` to verify all 4 blocking gaps were resolved. Full prior context preserved — re-check returned in 1m19s with concrete table mapping each finding → v2 fix → status. Fresh invocation would have re-read all artifacts and cost ~5–10× more tokens.

#### Current Pain
HARNESS § Deep-Design Gap Analysis describes the re-run loop ("revise → re-run deep-design → repeat until clean pass") but doesn't say HOW to make the re-run cheap. Agents will default to spawning fresh sessions, which is expensive and slow.

#### Suggested Improvement
Add a sub-section under § Deep-Design Gap Analysis:

> **Cheap re-checks**: when revising in response to findings, re-invoke Metis/Oracle with the same `session_id` so the agent has full prior context. Ask only for a delta table (finding → v2 fix → resolved status), not a fresh analysis. Reserve fresh sessions for fundamentally new scope.

#### Risk
tiny (process improvement)

#### Status
proposed

---

### HB-3: Strengthen MCP integration tests for unknown-method + signal handling

#### Discovered While
init-package-scaffold Review Gate (Oracle, `bg_35e1ca7b`). AC-6.4 (unknown method returns -32601) and AC-6.5 (SIGINT/SIGTERM clean shutdown) are proven indirectly — by SDK default behavior and source-level unit test, not by integration tests.

#### Current Pain
Indirect evidence is fragile. If the SDK changes its unknown-method default, or if a future server.ts refactor breaks the signal handler, the existing tests will still pass while real consumers (Claude Code, OpenCode) see broken behavior.

#### Suggested Improvement
In the `vendor-sync-initial` change (next), add two new integration tests:

1. Send a JSON-RPC request with `method: "resources/list"` (we don't implement resources), assert response has `error.code === -32601`.
2. Spawn server, send `initialize`, then send `SIGINT` to the subprocess, assert exit code 0 within 2 seconds and no zombie processes.

#### Risk
tiny (additive tests, no production code change)

#### Status
proposed
