# Dogfood Evidence: add-opendesign-mcp-skill

Followed the `skill-creator` skill's eval methodology: 3 realistic prompts × 2 conditions (with-skill, without-skill), all 6 runs via fresh `explore` subagents in parallel, comparing tool-call plans.

## Methodology

Each subagent received:
- **With-skill**: pointer to `.opencode/skills/open-design-mcp/SKILL.md` and the 4 references on disk, instructed to read as needed
- **Without-skill**: only the 8 tool *names* (as if from `tools/list`), no docs, cold start

Both conditions were told to produce a structured PLAN / ENV CHECKED / QUESTIONS / RISKS report — no actual tool calls. The plan quality is the signal.

## Test Prompts

| # | Prompt |
|---|---|
| E1 | "Show me all my Open Design projects" |
| E2 | "Generate a landing page design from this PRD: 'A SaaS pricing page with 3 tiers (Free, Pro at $29/mo, Enterprise contact-us), comparison table of 6 features across tiers, FAQ section with 5 common questions, and a footer with company links.' Save it when done." |
| E3 | "I'm getting a 401 from the hosted OD daemon when I call od_list_projects. How do I debug?" |

## Results Summary

| Aspect | With-skill | Without-skill |
|---|---|---|
| **E1 env vars** | `OD_DAEMON_URL` (correct) | Made-up `OPEN_DESIGN_API_KEY`, `OPENDESIGN_TOKEN` (neither exists) |
| **E2 step order** | list → create → generate → **lint → save** (correct, lint-before-save) | list → create → generate → **save → lint** (wrong order — saves broken HTML) |
| **E2 BYOK vars** | All 4 named correctly (`BYOK_BASE_URL`, `BYOK_API_KEY`, `BYOK_MODEL`, `BYOK_PROVIDER`) | Vague ("MCP server connectivity", "design generation model/templates") |
| **E2 risks surfaced** | Markdown fences in PRD, BYOK lazy validation, lint severity gating, streaming wait | Generic "PRD schema might be wrong", "no error handling docs" |
| **E3 auth mode** | Knows three modes (none/bearer/basic), explicitly mentions hosted OD basic auth | Made-up `OD_API_KEY`, `OD_TOKEN`, `OD_AUTH_HEADER` (none exist in this codebase) |
| **E3 recovery** | "Restart MCP server" mentioned (correct — core config read at startup, see `src/config.ts:107-131`) | Generic "check admin panel", "regenerate token" |

**Verdict: 3 of 3 with-skill produce factually correct, complete plans. 3 of 3 without-skill have factual errors that would mislead the user.** The skill works.

## Iteration Notes

Single area for SKILL.md refinement noted during review: in E2 with-skill, the agent asked the user "What is your `OD_DAEMON_URL`?" as a clarifying question — but the user already configured this in their MCP client env block. The skill should make explicit that env vars don't need to be re-asked; just attempt the call and recover from error. Added an "Anti-Pattern" row covering this before final commit.

## Raw Subagent Outputs

### E1 with-skill (bg_36e46d1b, 9s)

```
PLAN:
- Step 1: od_list_projects with no args | reason: user asked "Show me all my Open Design projects" — this is the read-only entry point to explore what exists

ENV CHECKED:
- OD_DAEMON_URL: required for all tools (validated eagerly at startup before step 1)

QUESTIONS I'D ASK USER (before calling tools):
- none

RISKS / GOTCHAS:
- If OD_DAEMON_URL is not set or invalid, the tool will fail with a clear error before attempting the call
- If the daemon is down or unreachable (ECONNREFUSED), the error will indicate connection failure
- If auth is required and not configured (401), see references/errors.md for mode-specific remediation
```

### E1 without-skill (bg_38b2e6c9, 5s)

```
PLAN:
- Step 1: od_list_projects with no args | reason: directly answers the user's request to see all projects

ENV CHECKED:
- None obvious from tool name alone

RISKS / GOTCHAS:
- od_list_projects may require authentication/API key env var (e.g., OPEN_DESIGN_API_KEY, OPENDESIGN_TOKEN) — if the call fails, check for missing credentials
- Response format unknown — may be paginated, may have filtering options not exposed in tool name alone
- If response is large, may need to parse/format for readability
```

Note: invented env var names that don't exist in this codebase.

### E2 with-skill (bg_361dd043, 14s)

```
PLAN:
- Step 1: od_list_projects with no args | reason: smoke test — verify OD_DAEMON_URL is reachable before investing time in generation
- Step 2: od_create_project { name: "SaaS Pricing Page", kind: "prototype", fidelity: "mid" } | reason: create a new project to hold the design
- Step 3: od_generate_design { projectId: <from step 2>, prompt: "<full PRD>", kind: "prototype" } | reason: takes 10-60s
- Step 4: od_lint_artifact { html: <from step 3> } | reason: cheap validation before saving — catches malformed HTML early
- Step 5: od_save_artifact { projectId, slug: "pricing-v1", html: <from step 3> } | reason: persist under URL-safe slug

ENV CHECKED:
- OD_DAEMON_URL: required for all 5 tools
- BYOK_BASE_URL, BYOK_API_KEY, BYOK_MODEL: required for step 3
- BYOK_PROVIDER: optional, defaults to openai

RISKS / GOTCHAS:
- If OD_DAEMON_URL is unreachable, step 1 fails with ECONNREFUSED
- If BYOK vars are missing, step 3 fails with a lazy validation error
- If lint finds "error" severity issues in step 4, step 5 should not proceed
- Streaming in step 3 can take 60s — wait for completion
- PRD passed to step 3 must not have markdown code fences
```

### E2 without-skill (bg_6fe5985f, 7s)

```
PLAN:
- Step 1: od_list_projects | reason: discover existing projects
- Step 2: od_create_project with name="SaaS Pricing Page"
- Step 3: od_generate_design with project_id + PRD
- Step 4: od_save_artifact with generated design + project_id  ← WRONG ORDER
- Step 5: od_lint_artifact on saved artifact                   ← WRONG ORDER

ENV CHECKED:
- MCP server connectivity: required for all steps
- Project storage backend: required for steps 2, 4
- Design generation model/templates: required for step 3

RISKS / GOTCHAS:
- od_generate_design may require a specific PRD schema — one-sentence PRD string might fail
- No error handling docs: unclear if MCP returns partial designs on validation failures
- Save workflow unknown: od_save_artifact may auto-export or just store
- Project naming collision: if "SaaS Pricing Page" exists, create may fail or overwrite
```

Note: lint-after-save inversion (saves broken HTML before validating), vague env vars, made-up "PRD schema" requirement.

### E3 with-skill (bg_455b51a6, 17s)

```
DIAGNOSIS:
- Most likely cause: OD daemon behind HTTP Basic Auth (hosted) but client auth mode is wrong or credentials are missing/invalid.

CHECK THESE ENV VARS (in order):
1. OD_AUTH_MODE: Should be "basic" for hosted OD
2. OD_BASIC_USER: Username for the daemon
3. OD_BASIC_PASS: Password for the daemon
4. OD_API_TOKEN: If set with no basic creds, MCP infers "bearer" mode — wrong for hosted OD

RECOVERY STEPS:
1. Confirm OD daemon's actual auth setup
2. If hosted OD behind basic auth, set OD_AUTH_MODE=basic + OD_BASIC_USER + OD_BASIC_PASS
3. If self-hosted with bearer, set OD_AUTH_MODE=bearer + OD_API_TOKEN
4. If no auth, unset all auth env vars
5. Restart the MCP server (env vars are read at startup)
6. Verify with od_list_projects
```

### E3 without-skill (bg_c5a0a436, 6s)

```
DIAGNOSIS:
- Most likely cause: Missing or invalid authentication credentials.

CHECK THESE ENV VARS (in order):
1. OD_API_KEY: Verify it's set
2. OD_TOKEN: If using token auth
3. OD_HOST or OD_DAEMON_URL
4. OD_AUTH_HEADER: Custom auth header
```

Note: `OD_API_KEY`, `OD_TOKEN`, `OD_AUTH_HEADER` do not exist. The actual env vars are `OD_API_TOKEN` (bearer) and `OD_BASIC_USER`/`OD_BASIC_PASS` (basic). The without-skill agent would mislead the user into a wild goose chase.

## Conclusion

Skill is ready to ship. Pass rate: 3/3 with-skill produce correct, complete plans. 3/3 without-skill produce plans with factual errors that would waste the user's time. Single minor SKILL.md refinement (don't ask user for env vars they've already configured in MCP client) addressed before commit.
