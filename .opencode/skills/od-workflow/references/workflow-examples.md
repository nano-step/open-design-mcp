# Workflow Examples

Two end-to-end transcripts showing the playbook executing against the `open-design-mcp` MCP. Each shows the actual tool calls the subagent makes per turn.

## Example 1 — Branch B: SaaS pricing page, no brand provided

**User opens a new OpenCode session:**

> Make me a SaaS pricing page for our developer-tools product. 3 tiers (Free, Pro $29/mo, Enterprise contact-sales). Feature comparison table, FAQ.

### Turn 1 — Discovery form (RULE 1)

LLM output:

> Got it — SaaS pricing page for a developer-tools product. Quick brief — 30 seconds:
>
> ```
> <question-form id="discovery" title="Quick brief — 30 seconds">
> {
>   "description": "I'll lock these in before building. Skip what doesn't apply.",
>   "questions": [
>     { "id": "audience", "label": "Who's the buyer?", "type": "text", "placeholder": "e.g. backend developers at Series-A startups" },
>     { "id": "tone", "label": "Visual tone", "type": "checkbox", "maxSelections": 2,
>       "options": ["Modern minimal", "Tech / utility", "Editorial", "Playful", "Brutalist"] },
>     { "id": "brand", "label": "Brand context", "type": "radio",
>       "options": [
>         { "label": "Pick a direction for me", "value": "pick_direction" },
>         { "label": "I have a brand spec", "value": "brand_spec" },
>         { "label": "Match a reference site", "value": "reference_match" }
>       ] },
>     { "id": "features", "label": "How many features in the comparison table?", "type": "text", "placeholder": "e.g. 8" },
>     { "id": "faq_count", "label": "FAQ — how many questions?", "type": "text", "placeholder": "e.g. 6" },
>     { "id": "constraints", "label": "Anything else?", "type": "textarea", "placeholder": "Brand colors, voice, must-avoid…" }
>   ]
> }
> </question-form>
> ```

LLM stops here. Waits for user answer.

(Note: `output`, `platform`, `scale` dropped because they're inferable from the brief — "SaaS pricing page" = single web prototype, responsive, 1 page.)

### Turn 2 — Branch B (RULE 2)

**User replies:**

> [form answers — discovery]
> [audience: backend developers at Series-A startups, mid-market SaaS buyers]
> [tone: Tech / utility, Modern minimal]
> [brand: pick_direction]
> [features: 8]
> [faq_count: 6]
> [constraints: voice should be confident not corporate, no fake stats]

LLM resolves Branch B (no brand source). Picks `tech-utility` direction from [direction-library.md](direction-library.md) — matches both tone selections.

LLM output:

> Going with **tech-utility** direction — Datadog/GitHub-style. Hairline borders, tabular numerics, signal-green accent (`oklch(58% 0.16 145)`) used for active tier + key CTA only. System sans throughout, JetBrains Mono for code snippets and pricing numerics.

(No second form. No "which direction?" question.)

### Turn 3 — Plan + Build + Critique (RULE 3)

**LLM calls `TodoWrite`:**

```
1. Bind tech-utility palette + type stack to :root
2. Plan the 6 sections: nav / hero / pricing-3-tier / comparison-table-8-rows / faq-6-q / footer
3. od_create_project { name: "Acme Pricing", kind: "prototype", fidelity: "mid", customInstructions: "tech-utility direction: hairline 1px borders, tabular-nums on pricing, signal green only on active tier + primary CTA, system sans, JetBrains Mono for code, no shadows" }
4. od_generate_design { projectId, prompt: "Build the pricing page: 3-tier hero + 8-feature comparison + 6-FAQ accordion + footer. Real copy for a backend-dev-tools product. No invented stats." }
5. Lint the HTML
6. Apply P0 checklist (anti-AI-slop from design-philosophy.md §C)
7. 5-dim critique — fix anything < 3/5
8. od_save_artifact { projectId, slug: "pricing-v1", html }
```

LLM marks step 1 `in_progress`, executes, marks `completed`. Repeats for each step live.

**Step 3 result:** `{ project: { id: "proj-abc123", name: "Acme Pricing", ... } }`

**Step 4 result:** Full HTML returned. ~12k tokens, 45 seconds.

**Step 5:** `od_lint_artifact` flags 1 issue: missing `<meta name="viewport">`. LLM patches.

**Step 6:** P0 check. Catches "✨ icon next to each feature heading" (anti-slop §C). LLM removes.

**Step 7:** Critique scores:
- Philosophy: 5/5 (tech-utility cleanly applied)
- Hierarchy: 4/5 (eye lands on Pro tier — correct, that's the recommended)
- Execution: 4/5 (one row in comparison table had 16px instead of 14px — fix)
- Specificity: 5/5 (every feature row is real, no "Feature One")
- Restraint: 3/5 (initially had a gradient on hero AND signal green underline on every link — strip the gradient, keep the green for CTAs only)

Two passes. Re-score: all 4+/5. Emit.

**Step 8:** `od_save_artifact { projectId: "proj-abc123", slug: "pricing-v1", html: <final> }` → `{ saved: true, url: "..." }`

### Output to user

> Done. Pricing page lives at `<url>`. Tech-utility direction; signal-green accent appears twice (Pro tier badge + primary CTA). 8-feature comparison table uses tabular-nums on the checkmark column. 6-FAQ accordion. No invented stats — every metric is a labelled stub for you to fill in. Want me to iterate on any section, or move to a follow-up page?

---

## Example 2 — Branch A: Pitch deck with brand URL

**User:**

> Make me a 12-slide pitch deck for our company. Our brand is at https://acme.com/brand. Investor audience.

### Turn 1 — Discovery form

LLM emits a tailored form: keeps `tone`, `scale` (since user said "12-slide"... actually that's set, drop it), `brand` (auto-fill to `brand_spec` since URL provided), `constraints`. Drops `output` (deck is set), drops `platform` (deck is fixed canvas), drops `scale` (12 slides is set).

LLM stops. Waits.

### Turn 2 — Branch A (RULE 2)

**User replies with `[form answers — discovery]` confirming `brand: brand_spec`.**

LLM detects brand URL is present. Runs the 5-step brand extraction from [brand-extraction.md](brand-extraction.md):

**Step 1 — Locate:** `WebFetch https://acme.com/brand`
**Step 2 — Download:** `WebFetch https://acme.com/static/css/brand.css`, `WebFetch https://acme.com/brand/logo.svg`
**Step 3 — Extract:**
```
Bash: curl -s https://acme.com/static/css/brand.css | grep -E '#[0-9a-fA-F]{3,8}' | sort -u
# → #1a1f3a (navy), #00e0d4 (cyan), #f8f9fb (off-white), #6b7280 (grey)
Bash: grep -E 'font-family' brand.css
# → 'Söhne', 'JetBrains Mono'
```
**Step 4 — Codify:** `Write brand-spec.md` with the 6 OKLch tokens + Söhne display/body + JetBrains Mono + posture rules
**Step 5 — Vocalize:**

> Brand extracted. Deep navy product canvas (`oklch(20% 0.04 260)`), single electric-cyan accent (`oklch(70% 0.15 195)`) used 2× per slide max, Söhne for display + body, JetBrains Mono for metadata. Rounded-md, 1px hairlines, no shadows.

### Turn 3 — TodoWrite + Build

```
1. Read brand-spec.md
2. Bind brand tokens to :root in deck template
3. Plan 12 slides: 1 title / 1 problem / 1 product / 3 features / 2 traction / 1 GTM / 1 team / 1 ask / 1 thanks (rhythm: title-bold, content-pale, content-pale, content-bold...)
4. od_create_project { name: "Acme Pitch", kind: "deck", fidelity: "high", customInstructions: <brand-spec contents> }
5. Copy deck framework template verbatim (NOT writing custom scale-to-fit logic per §G)
6. od_generate_design { projectId, kind: "deck", prompt: "Generate slides 1-3: title, problem, product. Use the bound brand. Real copy for an enterprise SaaS investor audience." }
7. od_generate_design { projectId, kind: "deck", prompt: "Generate slides 4-8: 3 features + 2 traction. No invented metrics — labelled stubs for ARR / NPS / churn." }
8. od_generate_design { projectId, kind: "deck", prompt: "Generate slides 9-12: GTM, team, ask, thanks." }
9. Lint each generated slide
10. P0 + 5-dim critique
11. od_save_artifact { projectId, slug: "pitch-v1", html: <combined> }
```

(Note step 6-8 split: each `od_generate_design` call is ~30s; splitting keeps each call short and lets the LLM run the critique on each segment.)

LLM executes live. Marks todos `completed` as each step lands.

### Output to user

> 12-slide deck shipped at `<url>`. Brand: Acme navy + electric cyan, Söhne throughout. Rhythm alternates bold/pale title slides every 2–3 to avoid same-theme runs. Real copy for slides 1-3, 9-12. Slides 4-8 (features + traction) have labelled stubs for ARR / NPS / customer logos — fill those before sending to investors. Want me to swap any specific slide?

---

## Why these examples matter

**Example 1** shows Branch B (no brand) with multi-section single-page generation. The `projectId` from step 3 means step 4's call auto-inherits the direction-as-customInstructions — issue #37's auto-fetch is doing real work.

**Example 2** shows Branch A (brand provided) with multi-call generation. The brand spec gets extracted once and stored as `customInstructions`, then every subsequent `od_generate_design` call automatically gets the brand — even though they're separate calls. This is the **multi-page consistency story** working end-to-end.

Both examples demonstrate the 9-step plan template, live TodoWrite updates, the P0 checklist, and the 5-dim critique — exactly the choreography from upstream OD, executed against our MCP.
