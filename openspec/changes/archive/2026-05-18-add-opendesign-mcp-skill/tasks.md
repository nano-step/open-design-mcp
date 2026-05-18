# Tasks: add-opendesign-mcp-skill

Lane:normal × user-feature → single PR, Oracle review gate, dogfood eval required.

## T-1: Scaffold skill directory

Create:
```
.opencode/skills/open-design-mcp/
├── SKILL.md
├── skill.json
└── references/
    ├── environment-setup.md
    ├── byok-providers.md
    ├── workflows.md
    └── errors.md
```

**Verify:** `find .opencode/skills/open-design-mcp -type f | wc -l` equals 6.

## T-2: Write SKILL.md

Follow `~/.config/opencode/skills/mcp-management/SKILL.md` heading structure but specific to open-design-mcp:

- YAML frontmatter: `name: open-design-mcp`, `description:` with explicit trigger phrases (per `skill-creator` guidance — "pushy" descriptions to combat undertriggering), `compatibility: OpenCode with open-design-mcp installed`
- Body sections: Overview → When to Use → Tool Catalog → Core Workflows → Anti-Patterns → Quick Start → References

Pull verbatim tool descriptions from `src/tools/*.ts` (`grep -A1 "description:" src/tools/*.ts`) so the catalog cannot drift from server reality.

**Verify:** `wc -l SKILL.md` ≤ 350; YAML frontmatter parses; all 8 tools listed; description ≥ 200 chars (per skill-creator: "pushy" enough to trigger reliably).

## T-3: Write references/environment-setup.md

Cover:
- `OD_DAEMON_URL` selection (local Docker vs hosted vs custom)
- Auth-mode auto-inference logic (from `src/config.ts:32-76`)
- All three modes with example env exports
- Eager vs lazy validation order
- Verification command (`od_list_projects` as smoke test)

**Verify:** ≤ 200 lines; references actual file:line from `src/config.ts`.

## T-4: Write references/byok-providers.md

Cover:
- Why BYOK is lazy (only validated when `od_generate_design` runs)
- Four supported providers + example env exports each (openai, anthropic, azure, google) — pull from `BYOK_PROVIDER` validation in `src/config.ts`
- The ai-proxy pattern (proxy URL + model name + key)
- Streaming behavior + timeout (`DEFAULT_TIMEOUT_MS` from `src/config.ts:150`, `PROGRESS_EVERY` from same file)
- Cost / security warnings (never commit keys, prefer env file)

**Verify:** ≤ 200 lines; cites `src/config.ts` lines for defaults.

## T-5: Write references/workflows.md

Three concrete end-to-end walkthroughs:

1. **Explore existing project**: `od_list_projects` → pick id → `od_get_project` with artifacts
2. **Generate a new design**: `od_create_project` (or pick existing) → `od_generate_design` with PRD → `od_save_artifact` with slug → `od_lint_artifact` for validation
3. **Recover from broken artifact**: read existing artifact via `od_get_project` → re-generate with refinement prompt → save back

Each walkthrough: env vars needed, sample tool args, expected output shape, common pitfalls.

**Verify:** ≤ 200 lines; every tool call has the env vars required listed inline.

## T-6: Write references/errors.md

Error table: status code → likely cause → fix action, derived from `src/tools/errors.ts`.

Cover:
- 401 (mode-aware hints: bearer says "check OD_API_TOKEN", basic says "check OD_BASIC_USER/PASS")
- 404 project-not-found
- 422 lint failures
- BYOK lazy validation errors (missing env vars only at generate-time)
- Streaming abort / timeout
- DNS / connection refused (local OD not running)

**Verify:** ≤ 200 lines; cites `src/tools/errors.ts` line ranges.

## T-7: Write skill.json

Metadata for skill-manager discovery + future npm distribution:
```json
{
  "name": "open-design-mcp",
  "version": "0.1.0",
  "description": "...",
  "compatibility": "OpenCode with open-design-mcp installed",
  "tags": ["mcp", "open-design", "design-generation", "byok"],
  "repository": "https://github.com/nano-step/open-design-mcp"
}
```

**Verify:** valid JSON; `name` matches SKILL.md frontmatter exactly.

## T-8: Dogfood eval (per skill-creator best practice)

Run 3 realistic test prompts through fresh subagents (one with skill loaded, one without). Document outputs in `docs/evidence/add-opendesign-mcp-skill/dogfood.md`.

Test prompts:
1. "List all my open-design projects" (should call `od_list_projects` cleanly)
2. "Generate a landing page design from this PRD: 'A SaaS pricing page with 3 tiers (Free/Pro/Enterprise), comparison table, FAQ section'" (should call `od_create_project` → `od_generate_design` → `od_save_artifact` → `od_lint_artifact`)
3. "I'm getting a 401 from the hosted OD. How do I debug?" (should reference auth-mode hints + check `OD_BASIC_USER/PASS`)

**Verify:** with-skill run handles ≥ 2 of 3 cleanly; without-skill run shows visible confusion (wrong env vars, wrong tool sequence, or asks user for info the skill would provide).

## T-9: Iterate based on dogfood

For each test case where with-skill run failed or got stuck, identify the SKILL.md / references gap and fix. Re-run that test.

**Verify:** all 3 test cases pass after iteration; document the iteration delta in dogfood.md.

## T-10: Self-review code-review

- SKILL.md ≤ 350 lines
- All references ≤ 200 lines
- No source files modified (`git diff master --name-only -- 'src/**' 'vendor/**' 'tests/**'` is empty)
- README untouched (per "out of scope")
- All `src/*` citations resolve on master (spot-check 5)
- Verbatim tool descriptions match `src/tools/*.ts`

## T-11: Validation ladder (clean env per HB-7)

```bash
unset OD_* BYOK_*
npm run lint           # must pass (no code edits, but the skill dir shouldn't trip eslint ignores)
npm run typecheck      # must pass
npm test               # must pass — test counts unchanged (166 unit)
npm run build          # must pass
bash scripts/vendor-check.sh
npm run test:integration  # must pass — counts unchanged (24)
openspec validate add-opendesign-mcp-skill --strict --no-interactive
```

**Verify:** all 7 commands exit 0; test counts unchanged from master.

## T-12: Oracle review (lane:normal × user-feature gate)

Consult Oracle with:
- Full proposal.md + tasks.md
- Final SKILL.md + all 4 references
- skill.json
- Dogfood evidence

Acceptance: Oracle PASS on (a) accuracy of tool/env descriptions, (b) absence of dangerous instructions (e.g. committing secrets), (c) progressive-disclosure structure soundness, (d) trigger description quality.

## T-13: Atomic commit + push

Single commit: `feat: add open-design-mcp OpenCode skill (closes #32)`

Push branch `feat/opendesign-mcp-skill` as kokorolx.

## T-14: PR + CI + merge

- Open PR referencing #32, attach Oracle verdict + dogfood evidence
- Wait CI green (lint/typecheck/test/build × Node 20+22)
- Squash-merge as kokorolx
- `git pull --ff-only` master

## T-15: Archive + push spec deltas

```bash
openspec archive add-opendesign-mcp-skill --yes
```

Then atomic commit `chore(openspec): archive add-opendesign-mcp-skill` + push.

## T-16 (optional, post-merge): Publish to skill-manager

Per AGENTS.md: load `sync-skill-to-manager` skill, bump npm version, publish so other OpenCode users can `npm install` the skill.

This is OUT of the OpenSpec change's acceptance scope but tracked as a follow-up issue if user wants distribution.
