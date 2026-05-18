# Proposal: add-opendesign-mcp-skill

**Lane × Change Type:** `lane:normal × change-type:user-feature`
**Risk Flags:** 2 (new artifact loaded by AI agents, depends on conventions of external skill system)
**Issue:** [#32](https://github.com/nano-step/open-design-mcp/issues/32)

## Why

`open-design-mcp@0.11.4` exposes 8 tools across 4 workflows (read, write, validate, generate) with three auth modes (none / bearer / basic) and BYOK config for the streaming generation tool. The README documents this surface for humans, but an LLM driving the MCP at runtime gets only the tool descriptions exposed via `tools/list`. Those descriptions are deliberately terse (one sentence each) and don't explain:

- Which env var combinations are needed per tool (`OD_DAEMON_URL` always; BYOK only for `od_generate_design`; basic-auth creds only for hosted OD)
- How auth-mode selection works (`OD_AUTH_MODE` inference, mode-aware 401 hints)
- The artifact lifecycle: when to lint before save, when to read after write
- How to interpret 401 / 404 / 422 errors back into fixable user actions
- The full PRD → generate → save → lint workflow

The result: every fresh LLM session spends 5–10 minutes on trial-and-error before producing useful output. The architecture doc shipped in `docs-generate-design-flow` helps but it's deep technical reference — not runtime guidance.

OpenCode-style skills solve exactly this: progressive disclosure (metadata always loaded, body loaded on trigger, references loaded on demand) packaged as a directory the agent runtime auto-discovers.

## What Changes

Pure additive. Create `.opencode/skills/open-design-mcp/` containing:

### 1. `SKILL.md` (~250 lines, ≤350 hard limit)

YAML frontmatter (name, description with explicit trigger phrases) + body covering:
- Overview + When to Use This Skill (triggers table)
- Tool Catalog (8-row table: tool name → purpose → env vars → when-to-use)
- Core Workflows (4 patterns: Explore, Create-and-Manage, Generate-and-Save, Diagnose-Errors)
- Anti-Patterns table (BYOK secrets in commits, save-without-lint, wrong auth mode, etc.)
- Quick Start (env setup checklist + first-call example)
- References (links to bundled docs)

### 2. `references/` directory

Four files, loaded on demand:
- `environment-setup.md` — local Docker OD vs hosted, auth-mode selection, validation order
- `byok-providers.md` — proxy URL format, model names, key formats, five supported providers (openai/anthropic/azure/google/ollama)
- `workflows.md` — three end-to-end walkthroughs (list-projects, generate-dashboard, fix-broken-artifact)
- `errors.md` — error → diagnosis → fix table for 401/404/422 + BYOK lazy failures

### 3. `skill.json`

Metadata for skill-manager / npm distribution (post-merge follow-up).

## Process — Best Practices Followed

Per `skill-creator` skill (loaded for authoritative guidance):

1. **Capture intent first** — done in this proposal
2. **Template from best-in-class** — modeled after `~/.config/opencode/skills/mcp-management/` (the canonical MCP-usage skill)
3. **Progressive disclosure** — SKILL.md ≤350 lines, references ≤200 lines each
4. **Imperative voice over MUSTs** — explain the *why* behind each instruction
5. **Anti-patterns section** — teach by negative example
6. **Dogfood before ship** — run 2–3 realistic test prompts through a fresh subagent with the skill loaded; iterate based on what trips it up
7. **Verbatim tool descriptions** — pull `description:` strings directly from `src/tools/*.ts` so the skill can't drift from reality

## Out of scope

- Publishing to npm (separate follow-up via `sync-skill-to-manager` skill once shape is validated)
- Wrapper scripts in `scripts/` (MCP tools ARE the executables — no shell layer needed)
- Modifying any source code, README, or existing docs
- Adding eval test infrastructure to CI (dogfood is one-shot validation, not a permanent gate)

## Risk

**Normal lane (2 risk flags):**

1. **New artifact loaded by AI agents** — skill content is read at runtime and influences agent behavior. Wrong instructions could cause tool misuse. Mitigation: dogfood eval + Oracle review of SKILL.md before merge.
2. **External convention dependency** — relies on OpenCode's skill discovery contract (`.opencode/skills/<name>/SKILL.md` with YAML frontmatter). If that contract changes, the skill silently stops loading. Mitigation: skill is purely additive — failure mode is "doesn't trigger" not "breaks something".

No risk to runtime behavior of the MCP server itself: zero source files touched, all 166+24 tests unaffected.
