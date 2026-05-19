---
name: od-workflow
description: Use this skill whenever a user wants the **full Open Design experience** — discovery questions asked first, brand-spec extraction from URLs/files, TodoWrite planning with live updates, 5-dimensional self-critique, polished artifact at the end. Trigger phrases include "design with questions first", "OD-style workflow", "full interactive design brief", "make me a complete landing page" (when the user wants quality over speed), "design my pitch deck", "brand-aware multi-page site", "follow the Open Design playbook", or any request where the user is starting a new design project rather than tweaking an existing artifact. Also trigger on any request that mentions wanting brand consistency across multiple pages or that provides a brand URL/spec. Pair with the `open-design-mcp` tool-reference skill — both loaded together give an LLM the full picture (this skill = workflow choreography; that skill = tool catalog + errors). This skill explicitly does NOT trigger for one-off tweaks ("make the nav stickier", "swap slide 3 image") — use od_generate_design directly for those.
compatibility: OpenCode (with subagent + TodoWrite/Read/Write/Bash/WebFetch tools) + open-design-mcp installed + an Open Design daemon reachable at OD_DAEMON_URL.
---

# od-workflow

A turn-by-turn Open Design playbook for OpenCode subagents. Transcribed from [nexu-io/open-design](https://github.com/nexu-io/open-design) (Apache 2.0; see [ATTRIBUTION.md](ATTRIBUTION.md)) and adapted to use this repo's `od_*` MCP tools.

## Overview

`open-design-mcp` ships 9 stateless MCP tools. They're hands, not a brain. This skill is the brain: a multi-turn workflow that drives an LLM through OD's full design arc using a combination of OpenCode's native tools (TodoWrite / Read / Write / Bash / WebFetch / Glob / Grep) and our `od_*` MCP tools.

The architecture:

```
User: "Make me a SaaS landing page"
   ↓
OpenCode loads this skill (trigger keywords match)
   ↓
LLM follows the 3-rule playbook below
   ↓
Turn 1: ask discovery questions, stop
Turn 2: extract brand spec OR pick a direction
Turn 3+: TodoWrite plan → build → checklist → critique → emit artifact
   ↓
Result: a polished, consistent, briefed design
```

The MCP tools (`od_create_project`, `od_generate_design`, `od_save_artifact`, etc.) are primitives the LLM calls during turn 3+. This skill teaches the LLM *when* to call them and *what to pass* — not how the daemon works.

## When to use this skill

| Trigger | Examples |
|---|---|
| User starts a new design project | "make me a landing page", "design a pitch deck", "build a SaaS prototype" |
| User mentions brand consistency | "match my brand", "all pages should look like one product" |
| User provides brand context | "here's our brand URL", "match this screenshot" |
| User wants full quality flow | "be thorough", "ask me questions", "do it properly" |

| Anti-trigger (use `od_generate_design` directly instead) | Examples |
|---|---|
| Tweaking an existing artifact | "make the nav stickier", "change the copy in section 2" |
| Single trivial section | "give me a 200-word hero copy block" |
| Pure render request | "generate the HTML for this exact spec" (no design decisions needed) |

## The 3-rule playbook

These are the hard rules. They are not optional. The user is paying attention to *speed of feedback*; obeying these rules is what makes the workflow feel responsive instead of stuck.

### RULE 1 — Turn 1: emit a discovery form, then stop

> Transcribed from upstream `discovery.ts:33-119` (Apache 2.0). Full text in [references/discovery-form.md](references/discovery-form.md).

When the user opens a new project or sends a fresh design brief, the **very first output** is one short prose line + a `<question-form>` block. Nothing else. No file reads. No Bash. No `od_generate_design`. No extended thinking. The form is the time-to-first-byte.

The form has 7 standard questions: `output`, `platform`, `audience`, `tone`, `brand`, `scale`, `constraints`. Exact JSON schema in [references/discovery-form.md](references/discovery-form.md). Tailor the questions to the brief — drop defaults the user already answered, add fields the brief uniquely needs.

After `</question-form>`, **stop the turn.** Wait for `[form answers — discovery]` on the next user message.

**Skip the form only in these narrow cases:**
- User is replying inside an active design with a tweak
- User explicitly says "skip questions" / "just build"
- User's message starts with `[form answers — ...]` (already have answers)

**In OpenCode (no form-rendering UI):** if the host environment does not render `<question-form>` markup as interactive UI, ask the same questions conversationally. The 7 questions are the same; the wire format is just chat text. See [references/discovery-form.md](references/discovery-form.md) §"How to ask these questions in an LLM-driven flow".

### RULE 2 — Turn 2: branch on the `brand` answer

> Transcribed from upstream `discovery.ts:121-151` (Apache 2.0). Full text in [references/brand-extraction.md](references/brand-extraction.md).

Once the user submits the form (or the initial brief already answered the brand question), resolve the branch:

| Brand answer | Action |
|---|---|
| `"brand_spec"` or `"reference_match"` + a source URL/file provided | **Branch A**: run brand-spec extraction (5 steps below) |
| `"brand_spec"` or `"reference_match"` but **no source provided** | Ask the user to paste/upload the spec, then stop. Do NOT guess. |
| `"pick_direction"` or no brand answer | **Branch B**: pick the best-matching direction from [references/direction-library.md](references/direction-library.md). Do NOT emit a second direction-picking form. |

**Branch A — 5-step brand extraction** (each step is its own tool call):

1. **Locate the source.** List attached files OR `WebFetch` brand URLs (`<brand>.com/brand`, `/press`, `/about`).
2. **Download styling artifacts.** Their CSS, brand-guide PDFs, screenshots — whatever's available.
3. **Extract real values.** `Bash grep -E '#[0-9a-fA-F]{3,8}'` on CSS for hex colors. Eyeball screenshots for typography. **Never guess colors from memory.**
4. **Codify.** `Write brand-spec.md` to the project root with 6 OKLch color tokens + display/body/mono font stacks + 3-5 layout posture rules. Template in [references/brand-extraction.md](references/brand-extraction.md).
5. **Vocalize.** State the system in one sentence ("deep navy product canvas, single electric-cyan accent at oklch(68% 0.16 220), geometric display + system body") so the user can redirect cheaply.

Then proceed to RULE 3.

### RULE 3 — Turn 3+: TodoWrite the plan, then live updates

> Transcribed from upstream `discovery.ts:155-195` (Apache 2.0). Full text in [references/plan-and-critique.md](references/plan-and-critique.md).

Once the brand/direction is locked, the **first tool call** is `TodoWrite` with 5–10 short imperative items in the order to execute. The chat renders this as a live "Todos" card — it is the user's primary way to see the plan and redirect cheaply.

**Standard plan template:**

```
1. Read active DESIGN.md + skill assets (template.html, layouts.md, checklist.md)
2. (Branch A) Confirm brand-spec.md + bind to :root
   (Active DESIGN.md) Bind active design-system tokens to :root
   (Branch B) Pick a direction from the library, bind to :root
3. Plan section/slide/screen list with platform variants and rhythm
4. od_create_project (if no projectId yet) with customInstructions = brand spec
5. For each section/screen: od_generate_design { projectId, prompt }
6. Replace any [REPLACE] placeholders with real, specific copy from the brief
7. Self-check: run the P0 anti-AI-slop checklist (every P0 must pass)
8. 5-dim critique: philosophy / hierarchy / execution / specificity / restraint; fix any dimension < 3/5
9. od_lint_artifact + od_save_artifact for each section
```

After `TodoWrite`, immediately mark step 1 `in_progress`. As each step completes, update — do NOT batch updates at the end of the turn; the live progress is the point.

**Step 7 (checklist) and Step 8 (critique) are non-negotiable.** Full guidance in [references/plan-and-critique.md](references/plan-and-critique.md).

## Tool mapping — OD-native ↔ OpenCode + our MCP

| OD upstream tool | What it does | OpenCode equivalent | Our MCP equivalent |
|---|---|---|---|
| `TodoWrite` | Live planning UI | OpenCode's `todowrite` tool | — |
| `Read` | Read filesystem | OpenCode's `read` tool | — |
| `Write` | Create file | OpenCode's `write` tool | — |
| `Edit` | Modify file | OpenCode's `edit` tool | — |
| `Bash` | Shell exec | OpenCode's `bash` (prefix `rtk` for read/git) | — |
| `WebFetch` | Fetch URL | OpenCode's `webfetch` | — |
| `Glob` / `Grep` | File / content search | OpenCode's `glob` / `grep` | — |
| `prompt_formatter_compose_brief` | Format Turn 3 prompt | — | `od_compose_brief` |
| `live_artifacts_create` | Create artifact | — | `od_generate_design` → `od_save_artifact` |
| `live_artifacts_update` | Update artifact | — | `od_save_artifact` (same slug → upsert) |
| `live_artifacts_list` | List artifacts | — | `od_get_project` |
| `connectors_list` / `connectors_execute` | OAuth data extraction | **NOT AVAILABLE** — ask user for data manually | — |

## Multi-page consistency (the new hot path)

After issue #37 (PR #40) shipped, `od_generate_design` accepts an optional `projectId`. When provided, it auto-fetches the project's stored `customInstructions` and merges them into the system prompt. **Pair this with the playbook:**

1. Turn 3, step 4: `od_create_project { name, customInstructions: <brand spec from step 2> }` → returns `projectId`
2. Turn 3, step 5 (each page): `od_generate_design { projectId, prompt: "...page brief..." }` — brand auto-inherited
3. Result: every page in the project shares the same design language without re-pasting the brand spec

See [references/workflow-examples.md](references/workflow-examples.md) for a fully-worked multi-page transcript.

**Note:** `customInstructions` is stashed in `metadata.customInstructions` on create/update and read from there first on generate (daemon compat, [#43](https://github.com/nano-step/open-design-mcp/issues/43)). This is transparent to callers.

## Anti-AI-slop checklist (concise; full in references)

> Transcribed from upstream `discovery.ts:221-232` (Apache 2.0).

Audit before emitting any artifact. Any ❌ found → fix before `od_save_artifact`.

- ❌ Aggressive purple/violet gradient backgrounds
- ❌ Generic emoji feature icons (✨ 🚀 🎯 …)
- ❌ Rounded card with a left coloured border accent
- ❌ Hand-drawn SVG humans / faces / scenery
- ❌ Inter / Roboto / Arial as a *display* face (body is fine)
- ❌ Invented metrics ("10× faster", "99.9% uptime") without a source
- ❌ Filler copy — "Feature One / Feature Two", lorem ipsum
- ❌ Warm beige / cream / peach / pink / orange-brown page backgrounds (unless brand or selected direction requires)
- ❌ Product artifacts that expose designer settings, viewport selectors, "demo controls"

When you don't have a real value, leave a short honest placeholder (`—`, a grey block, a labelled stub). An honest placeholder beats a fake stat. Full slop checklist + the 8 other design philosophy principles in [references/design-philosophy.md](references/design-philosophy.md).

## Quick start

**Invoking from a parent OpenCode session.** When the parent LLM detects this skill's trigger, it has two paths:

**Option A — Inline execution (single-LLM, multi-turn chat):**
- Parent LLM acts as the agent itself; follows this skill's rules turn-by-turn
- Best for short workflows or when the parent already has all needed context

**Option B — Subagent delegation (recommended for full quality flows):**
```python
task(
  subagent_type="deep",
  load_skills=["od-workflow", "open-design-mcp"],
  prompt="<user's original design brief>",
  run_in_background=false,
)
```
- Spawn a fresh subagent loaded with both skills
- Subagent follows the playbook end-to-end; returns the final artifact summary
- Best for complete designs (multi-page, brand extraction, multiple iterations)

## References (load on demand)

- **[references/discovery-form.md](references/discovery-form.md)** — Turn-1 form schema (verbatim), authoring rules, conversational fallback
- **[references/brand-extraction.md](references/brand-extraction.md)** — Branch A 5-step extraction, brand-spec.md template
- **[references/direction-library.md](references/direction-library.md)** — 5 directions with OKLch palettes + type stacks + posture rules (use when no brand provided)
- **[references/plan-and-critique.md](references/plan-and-critique.md)** — TodoWrite plan template, P0/P1/P2 checklist, 5-dimensional critique framework
- **[references/design-philosophy.md](references/design-philosophy.md)** — Full 9-principle philosophy (A-I): persona, seed templates, anti-slop, variations, junior-pass, color/type, slides/prototypes, cross-platform, restraint
- **[references/workflow-examples.md](references/workflow-examples.md)** — Two end-to-end transcripts (Branch A with brand URL, Branch B picking a direction)
- **[ATTRIBUTION.md](ATTRIBUTION.md)** — Apache 2.0 attribution, pinned upstream commit, transcribed-blocks table

## Related skills

- **`open-design-mcp`** — the tool-reference skill. Catalog of 9 tools, env-var setup, error diagnosis, individual workflows (list / get / create / update / delete / compose-brief / generate / lint / save). Load this together with `od-workflow` for the full picture.

## Related documentation

- Repo `README.md` — human-facing tool list + installation
- `docs/architecture/generate-design-flow.md` — deep technical reference for `od_generate_design` internals
- Upstream Open Design: <https://github.com/nexu-io/open-design>
