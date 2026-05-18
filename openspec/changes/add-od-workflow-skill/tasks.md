# Tasks: add-od-workflow-skill

Lane:normal × user-feature → single PR, Oracle review required, dogfood eval required.

## T-1: Scaffold skill dir

```
.opencode/skills/od-workflow/
├── SKILL.md
├── skill.json
├── ATTRIBUTION.md
└── references/
    ├── discovery-form.md
    ├── brand-extraction.md
    ├── direction-library.md
    ├── plan-and-critique.md
    ├── design-philosophy.md
    └── workflow-examples.md
```

**Verify:** `find .opencode/skills/od-workflow -type f | wc -l` = 9.

## T-2: Write ATTRIBUTION.md

Pin upstream commit SHA (read from `vendor/od-contracts/VENDORED_FROM.md` or `git -C /tmp/open-design rev-parse HEAD`). List every transcribed block with source file:line. Include Apache 2.0 short notice and pointer to the full LICENSE in `vendor/od-contracts/LICENSE`.

**Verify:** file exists, references real commit SHA + real upstream files.

## T-3: Write skill.json manifest

Standard skill manifest. `name: "od-workflow"`, `version: "0.1.0"`, description with explicit trigger phrases (per skill-creator "pushy" guidance).

**Verify:** valid JSON, name matches dir name + SKILL.md frontmatter.

## T-4: Write SKILL.md (the choreography overview)

YAML frontmatter + body:
- Overview (what this skill does, what it doesn't)
- When to use (trigger phrases — "interactive design brief", "OD-style workflow", "full discovery + critique", "design with questions first")
- The 3-rule playbook overview (turn 1 / turn 2 / turn 3+, concise)
- Tool mapping table (OD-native ↔ OpenCode + our MCP)
- Concise anti-AI-slop checklist (full version in references/design-philosophy.md)
- Quick start (how to invoke from a parent session)
- References pointer

**Verify:** ≤350 lines, frontmatter parses, name matches skill.json.

## T-5: Write references/discovery-form.md

Transcribe verbatim from `/tmp/open-design/packages/contracts/src/prompts/discovery.ts:39-119`:
- The `<question-form id="task-type">` (default-router exception)
- The `<question-form id="discovery">` (standard 7-question form)
- Form authoring rules (lines 99-110)
- Narrow exceptions to skipping (114-119)

Plus a NEW section: "How to ask these questions in an LLM-driven flow" — explains that since the MCP user is in an editor, the questions can be asked conversationally OR rendered as a structured prompt; the LLM should pick based on its host environment.

**Verify:** ≤200 lines, attribution line at top.

## T-6: Write references/brand-extraction.md

Transcribe Branch A (5 steps) from `discovery.ts:132-147`. Add a "brand-spec.md template" section showing what the final file should look like:

```markdown
# Brand spec — <project-name>

Source: <URL / attachment / reference>
Extracted: <ISO timestamp>

## Color tokens (OKLch)
--bg:      oklch(...)
--surface: oklch(...)
--fg:      oklch(...)
--muted:   oklch(...)
--border:  oklch(...)
--accent:  oklch(...)

## Type stack
Display: ...
Body:    ...
Mono:    ...

## Layout posture
- ...
- ...
```

**Verify:** ≤200 lines, references the actual upstream `WebFetch` + `Bash grep` workflow.

## T-7: Write references/direction-library.md

Transcribe the 5 directions from `/tmp/open-design/packages/contracts/src/prompts/directions.ts`. Each direction: id, label, mood, references, displayFont, bodyFont, palette (6 OKLch values), posture (3-5 cues).

5 directions: `editorial-monocle`, `modern-minimal`, `human-approachable`, `tech-utility`, `brutalist-experimental`.

**Verify:** ≤200 lines (will be tight; if over budget, omit references arrays and link to upstream).

## T-8: Write references/plan-and-critique.md

Transcribe from `discovery.ts:155-195`:
- TodoWrite plan template (9 standard items)
- Step 7 — checklist self-check (P0 must pass; explain P0/P1/P2)
- Step 8 — 5-dimensional critique (philosophy / hierarchy / execution / specificity / restraint, 1-5 scale)
- "Two passes is normal" guidance

**Verify:** ≤200 lines.

## T-9: Write references/design-philosophy.md

Transcribe the 9 philosophy principles A-I from `discovery.ts:203-294`:
- A. Embody the specialist (5 persona-platform mappings)
- B. Use seed + layouts, don't write from scratch
- C. Anti-AI-slop checklist (FULL — 11 items)
- D. Variations, not "the answer"
- E. Junior-pass first
- F. Color and type
- G. Slides + prototypes
- H. Cross-platform + multi-device layouts (the most detailed section)
- I. Restraint over ornament

**Verify:** ≤200 lines (will be tight — H is long; trim to essential rules if needed).

## T-10: Write references/workflow-examples.md

Two end-to-end transcripts showing the playbook executing — one for a SaaS landing page (no brand spec, picks direction), one for a deck pitch with a provided brand URL (runs extraction). Each shows the actual tool calls the subagent would make.

**Verify:** ≤200 lines.

## T-11: Dogfood eval — 2 fresh subagent runs

Run 2 `explore` subagents in parallel:
- **With both skills** (`open-design-mcp` + `od-workflow`) — should produce a plan that includes turn-1 form, brand handling, TodoWrite plan, critique
- **With only `open-design-mcp`** — should produce a plan that immediately calls `od_generate_design`

Compare. The with-od-workflow run should demonstrably engage the multi-turn flow.

Save outputs to `docs/evidence/add-od-workflow-skill/dogfood.md`.

**Verify:** evidence file exists; signal is clear (with-od-workflow plan ≠ without).

## T-12: Self code-review

- All 9 files present
- All transcribed blocks have attribution headers
- SKILL.md ≤350 lines, references ≤200 each
- `git diff master --name-only -- 'src/**' 'vendor/**' 'tests/**'` is empty
- skill.json valid, name matches dir
- ATTRIBUTION.md pins a real upstream SHA

## T-13: Validation ladder (clean env)

```bash
unset OD_* BYOK_*
npm run lint
npm run typecheck
npm test                                  # expect 183 passed, unchanged
npm run build
bash scripts/vendor-check.sh
npm run test:integration                  # expect 24 passed, unchanged
openspec validate add-od-workflow-skill --strict --no-interactive
```

**Verify:** all 7 exit 0; test counts unchanged from #37 baseline.

## T-14: Oracle review

Provide proposal + SKILL.md + all references + ATTRIBUTION.md + dogfood evidence. Verdict on:
- Accuracy of transcription vs upstream
- Attribution sufficiency for Apache 2.0
- Workflow soundness (does the playbook actually work as orchestration?)
- Safety (no instructions encouraging dangerous behavior)
- Progressive disclosure structure

## T-15: Atomic commit + push as kokorolx

Single commit: `feat: add od-workflow skill — OD playbook for OpenCode subagents (closes #38)`

## T-16: PR + CI + merge

PR with Oracle verdict + dogfood evidence attached. Wait CI green Node 20+22. Squash-merge as kokorolx.

## T-17: Archive + push spec deltas

```bash
openspec archive add-od-workflow-skill --yes
```

Then commit + rebase + push.

## T-18: Sync to skill-manager

New skill → publish via `sync-skill-to-manager` with new public-skill entry in skill-manager's README + private-catalog check.
