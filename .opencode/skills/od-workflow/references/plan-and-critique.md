# Plan & Critique (Turn 3+)

> Transcribed from upstream [nexu-io/open-design `discovery.ts:155-195`](https://github.com/nexu-io/open-design) (Apache 2.0). See [../ATTRIBUTION.md](../ATTRIBUTION.md).

Once the design-system / direction / brand-spec is locked, **the first tool call is `TodoWrite`**. The chat renders this as a live "Todos" card — it is the user's primary way to see the plan and redirect cheaply.

The plan has 5–10 short imperative items in the order they'll execute. Mark items `in_progress` and `completed` live as you go — do NOT batch updates at the end of the turn.

## Standard plan template

Adapt the middle steps to the brief, but keep steps 1, 7, 8, 9 — they are non-negotiable:

```
1.  Read active DESIGN.md + skill assets (template.html, layouts.md, checklist.md)

2.  Bind tokens to :root
    - (Branch A) Confirm brand-spec.md + bind to :root
    - (Active DESIGN.md) Bind active design-system tokens/rules to :root
    - (Branch B) Bind the chosen direction's palette + type stack to :root

3.  Plan section/slide/screen list with platform variants and rhythm
    (state list aloud before writing — "We'll build hero, features×3, pricing×3, FAQ×5, footer")

4.  od_create_project { id: "<short-slug>", name, customInstructions: <brand spec> } (if no projectId yet — `id` is REQUIRED)
    OR identify the existing projectId from context

5.  For each section/screen: od_generate_design { projectId, prompt: "<focused brief>" }
    The projectId ensures every section auto-inherits brand rules (issue #37)

6.  Replace any [REPLACE] placeholders with real, specific copy from the brief
    Honest placeholder beats invented stat

7.  Self-check: P0 anti-AI-slop checklist (full list in design-philosophy.md §C)
    Every P0 must pass. Fix before moving on.

8.  5-dim critique: score yourself silently 1–5 on philosophy / hierarchy / execution / specificity / restraint
    Fix any dimension < 3/5. Two passes is normal.

9.  od_lint_artifact { html } + od_save_artifact { identifier, title, html } for each section
    Catch malformed HTML before persisting.
```

## Decks especially — framework first, content second

For `kind: "deck"` projects, **step 4 is the load-bearing one**: copy the deck framework HTML (the active skill's `assets/template.html`, or the canonical skeleton in the deck-mode directive of the upstream system prompt) **verbatim** before authoring any slide content.

Do **NOT** write your own scale-to-fit logic, keyboard handler, slide visibility toggle, counter, or print stylesheet. Every freeform attempt at this re-introduces the same iframe positioning / scaling bugs that have already been fixed in the framework.

Your job: drop the framework in, bind the palette, fill the `<section class="slide">` slots.

## Step 7 — checklist self-check (P0 must pass)

Every skill that ships a `references/checklist.md` has a P0/P1/P2 list:

- **P0** — must pass. Examples: valid `<!doctype html>`, no broken images, no fake stats, no AI-slop patterns from §C of [design-philosophy.md](design-philosophy.md). If any P0 fails → fix it. Do not emit `<artifact>` with a failing P0.
- **P1** — should pass. Examples: complete responsive states, alt text on hero images. Fix if budget allows; otherwise note the gap to the user.
- **P2** — nice to have. Examples: keyboard navigation on dropdowns, copy-to-clipboard buttons.

Read `references/checklist.md` from the active skill (if present) **after** writing the artifact, **before** running critique. The checklist catches mechanical issues; critique catches design-quality issues. Both matter.

For projects without a bound skill, use the universal P0 set from [design-philosophy.md §C](design-philosophy.md) (anti-AI-slop checklist).

## Step 8 — 5-dimensional critique

After the checklist passes, score yourself silently across five dimensions on a 1–5 scale. **Any dimension under 3/5 is a regression** — go back, fix the weakest dimension, re-score. Two passes is normal. Then emit.

### Dimension 1 — Philosophy
Does the visual posture match what was asked (editorial vs minimal vs brutalist)? Or did you drift back to your favorite default?

**Failure mode:** Brief was "brutalist art portfolio", output is "modern-minimal SaaS landing page with marketing copy."

**Fix:** Re-read the direction-library entry; re-bind the palette + type + posture verbatim.

### Dimension 2 — Hierarchy
Does the eye land in one obvious place per screen? Or is everything competing?

**Failure mode:** Three equally-sized headlines, four CTAs, six accent-color highlights.

**Fix:** Promote one element (size, weight, color, position); demote the others.

### Dimension 3 — Execution
Typography, spacing, alignment, contrast — are they right or just close?

**Failure mode:** 16px body text on a desktop layout (too small), inconsistent padding (24px sometimes, 32px elsewhere), 4.2:1 contrast where 4.5:1 is required.

**Fix:** Use the seed template's type scale + spacing scale; don't reinvent them. Check contrast with a real ratio tool.

### Dimension 4 — Specificity
Is every word, number, image specific to *this* brief? Or did filler / generic stat-slop creep in?

**Failure mode:** "Trusted by 1000+ teams", "10× faster than the leading provider", "Feature One / Feature Two / Feature Three" headings, lorem ipsum body, stock-photo people in suits.

**Fix:** Replace every invented metric with `—` or a labelled stub. Replace generic copy with the user's real domain language (you have it in the `audience` + `constraints` answers).

### Dimension 5 — Restraint
One accent used at most twice, one decisive flourish — or three competing flourishes?

**Failure mode:** Gradient nav + gradient hero + glowing button + animated background + emoji icons. Each one would be fine alone; together they're noise.

**Fix:** Pick ONE flourish and amplify it. Strip the others. "One thousand no's for every yes."

## Live updates

- Mark step 1 `in_progress` IMMEDIATELY after writing the TodoWrite list — don't wait
- Mark each step `completed` AS it finishes — not at the end of the turn
- If the plan changes (user redirects, you hit a blocker), EDIT the list rather than silently abandoning items
- The user is watching the live progress; batched updates feel like the agent froze

## Connection to artifact emission

After all 9 plan items are complete:

1. Final P0 check (no regressions introduced by late fixes)
2. Emit the artifact via `od_save_artifact { identifier, title, html }` (NOT project-scoped — daemon's global artifact store)
3. (Recommended) Surface the artifact's URL to the user along with a one-sentence summary of what they're looking at
4. Stop. Don't narrate after the artifact. The artifact is the deliverable.

For multi-page projects, repeat steps 5-9 of the plan for each page. The brand auto-inherits via `projectId`; you don't need to re-paste the brand spec.

## Common failure: skipping critique

If the artifact "looks fine" and you're tempted to skip step 8 — don't. The critique is for the user's eyes; it's what separates polished output from sketch output. Two minutes of silent self-grading is the highest-leverage time in the workflow.
