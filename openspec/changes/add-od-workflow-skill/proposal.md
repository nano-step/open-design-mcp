# Proposal: add-od-workflow-skill

**Lane × Change Type:** `lane:normal × change-type:user-feature`
**Risk Flags:** 3 (new artifact loaded by AI agents, transcribed content from Apache-2.0 upstream, new agent-loop choreography)
**Issue:** [#38](https://github.com/nano-step/open-design-mcp/issues/38)

## Why

`od_generate_design` is a single-turn stateless LLM proxy with a fancy system prompt. We currently bypass everything OD is famous for:

- Discovery / intake flow (turn-1 `<question-form>`)
- Brand-spec extraction (WebFetch + grep + structured tokens)
- TodoWrite-driven planning with live updates
- Self-critique (5-dimensional radar)
- Anti-AI-slop checklist

A user typing "make me a SaaS landing page" today gets: one stateless LLM call, no questions asked, generic output, no plan, no critique. The OD web app gets: discovery questions, brand extraction, planned multi-step build, critique, polished artifact.

That gap is the bug. **And the fix doesn't require new MCP code.**

Investigation of the upstream OD source (nexu-io/open-design at /tmp/open-design) confirmed:
- OD's "agent" is just a Claude Code subprocess
- Tools wired: TodoWrite / Read / Write / Edit / Bash / WebFetch / Glob / Grep + a custom MCP whose 6 tools map 1:1 to our 8 `od_*` tools
- The entire turn-by-turn behavior is encoded in plain-text prompts at `packages/contracts/src/prompts/discovery.ts` (RULE 1: emit form, RULE 2: brand extraction, RULE 3: TodoWrite + checklist + critique + emit)
- All sources Apache 2.0 — transcription with attribution is legal

OpenCode subagents have the same tool surface as OD's Claude Code child. We can put OD's playbook into a skill and have a subagent execute it against our MCP. The skill is the brain. The MCP tools are the hands. OpenCode's subagent is the agent loop.

## What Changes

### Scope

New skill at `.opencode/skills/od-workflow/` — focused exclusively on the multi-turn agent choreography. Existing `.opencode/skills/open-design-mcp/` is kept as the tool-reference skill (catalog, env vars, errors, individual workflows A–D). Loading both together gives the LLM the full picture; loading either alone is still useful.

### Skill Structure (per skill-creator best practices)

```
.opencode/skills/od-workflow/
├── SKILL.md                       (≤ 350 lines)
│   - When to use (trigger phrases)
│   - The 3-rule playbook overview (turn 1, turn 2, turn 3+)
│   - Tool mapping: OD-native ↔ OpenCode + our MCP
│   - Anti-AI-slop checklist (concise)
│   - Quick start: how to invoke from a parent session
│   - References pointer
├── references/
│   ├── discovery-form.md          (turn-1 form schema, tailoring rules, default-router exception)
│   ├── brand-extraction.md        (turn-2 branch-A 5-step extraction, brand-spec.md template)
│   ├── direction-library.md       (5 directions verbatim with palettes, type, posture)
│   ├── plan-and-critique.md       (TodoWrite plan template, P0/P1/P2 checklist guidance, 5-dim critique)
│   ├── design-philosophy.md       (A–I principles: persona, seed templates, slop checklist, variations, junior-pass, color/type, cross-platform contracts, restraint)
│   └── workflow-examples.md       (2 end-to-end transcripts of the playbook executing)
├── skill.json                     (manifest)
└── ATTRIBUTION.md                 (verbatim Apache-2.0 attribution, upstream commit pin, modifications log)
```

### What we transcribe verbatim

From nexu-io/open-design @ master (commit pinned in ATTRIBUTION.md):

- The discovery form JSON schema (`discovery.ts:71-97`)
- The default-router task-type form (`discovery.ts:39-69`)
- The 3 RULES + their branching logic (`discovery.ts:25-195`)
- The TodoWrite plan template (`discovery.ts:159-173`)
- The 5-dimensional critique framework (`discovery.ts:185-195`)
- The anti-AI-slop checklist (`discovery.ts:221-232`)
- The 9 design philosophy principles A-I (`discovery.ts:203-294`)
- The direction library — 5 directions with palette/typography/posture (`directions.ts:53+`)
- The artifact handoff contract (`official-system.ts`)

Every transcribed block carries inline attribution: `> Transcribed from nexu-io/open-design under Apache 2.0 (see ATTRIBUTION.md for commit pin)`.

### What we adapt

The playbook references OD-internal tools (`live_artifacts_create`, etc.) that don't exist outside OD's daemon. We swap them for our equivalents:

| OD tool | Our equivalent |
|---|---|
| `live_artifacts_create` | `od_save_artifact` (after `od_generate_design`) |
| `live_artifacts_update` | `od_save_artifact` with same slug → upsert |
| `live_artifacts_list` | `od_get_project` (returns artifacts list) |
| `connectors_*` | NOT REPLICATED — skill instructs the LLM to ask the user for data manually |

### Out of scope

- Modifying `src/` source code (zero source-file changes in this PR)
- Connector tools (OAuth-protected data extraction) — minority use case
- Live preview / artifact rendering — different consumption surface
- Async job pattern for super-long generations — separate future change
- Modifying the existing `open-design-mcp` skill — it stays as-is

## Process — Best Practices Followed

Per `skill-creator` skill:

1. **Capture intent first** — captured in this proposal + issue #38
2. **Template from canonical workflow skills** — modeled after `comprehensive-feature-builder` and the upstream OD discovery prompt structure
3. **Progressive disclosure** — SKILL.md ≤350 lines, references ≤200 each
4. **Imperative voice over MUSTs, explain why** — yes
5. **"Pushy" description for reliable triggering** — yes
6. **Anti-patterns section** — anti-AI-slop checklist is exactly this
7. **Dogfood before ship** — 2 fresh `explore` subagent runs simulating a design brief, comparing with-skill vs. without-skill plans
8. **Verbatim accuracy** — transcribed content is verbatim from upstream, with attribution

## License Posture

Upstream nexu-io/open-design is Apache 2.0. Transcribing into our skill is permitted with:
- Preserved copyright/license notices (in `ATTRIBUTION.md` + each transcribed reference file's header)
- Statement of significant changes (we adapted tool references; documented in ATTRIBUTION.md)
- No additional restrictions on the transcribed content

A courtesy notice to upstream is a kindness, not a requirement. Not in this PR's scope.

## Risk

**3 risk flags:**

1. **New AI-loaded artifact that influences agent behavior.** Wrong instructions could cause tool misuse. Mitigation: Oracle review on the workflow before merge + dogfood eval comparing with-skill vs without-skill subagent plans.
2. **Transcribed content from external source.** Apache 2.0 permits this with attribution; ATTRIBUTION.md must be precise. Mitigation: pin upstream commit SHA, list every transcribed block with source file:line.
3. **New agent-loop choreography pattern.** This is the first skill in our ecosystem that drives a multi-turn workflow with a subagent rather than just providing tool reference. Mitigation: skill is opt-in (different trigger phrases from `open-design-mcp` tool-reference skill), defaults to the existing single-shot flow if not loaded.

Zero source-file changes. Test counts unchanged (no new tests since no new code paths). Existing `od_generate_design` behavior unchanged for users who don't load this skill.

## Acceptance Criteria

- [ ] New skill at `.opencode/skills/od-workflow/` with SKILL.md + 6 references + skill.json + ATTRIBUTION.md
- [ ] SKILL.md ≤350 lines; each reference ≤200 lines
- [ ] All transcribed content carries attribution to nexu-io/open-design
- [ ] ATTRIBUTION.md pins upstream commit SHA and lists transcribed blocks
- [ ] Existing `open-design-mcp` skill unchanged
- [ ] Existing `od_generate_design` behavior unchanged for users who don't load the new skill
- [ ] Dogfood eval: 2 fresh subagent runs (one with both skills loaded, one with just `open-design-mcp`) on the same prompt — with-od-workflow run produces a plan that asks discovery questions, runs brand extraction, and shows TodoWrite plan
- [ ] Oracle review verdict: PASS
- [ ] Validation ladder: clean env, all 7 steps green
- [ ] OpenSpec proposal valid (strict)

## Effort estimate

~1 day of careful transcription + dogfooding + Oracle review + iteration. The transcribed content is the bulk of the work; the choreography prose is a few hundred lines.
