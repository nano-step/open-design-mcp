# Discovery Form

> Transcribed from upstream [nexu-io/open-design `discovery.ts:39-119`](https://github.com/nexu-io/open-design) (Apache 2.0). See [../ATTRIBUTION.md](../ATTRIBUTION.md) for the pinned commit SHA.

The discovery form is the first artifact your LLM emits when a user opens a new design project. It locks the brief's open variables (visual tone, scale, brand context) before any HTML generation begins.

## The standard discovery form (verbatim)

Emit this on turn 1 — one short prose line first, then the form, then **stop**:

```
<question-form id="discovery" title="Quick brief — 30 seconds">
{
  "description": "I'll lock these in before building. Skip what doesn't apply — I'll fill defaults.",
  "questions": [
    { "id": "output", "label": "What are we making?", "type": "radio", "required": true,
      "options": ["Slide deck / pitch", "Single web prototype / landing", "Multi-screen app prototype", "Dashboard / tool UI", "Editorial / marketing page", "Other — I'll describe"] },
    { "id": "platform", "label": "Target platform", "type": "checkbox", "maxSelections": 4,
      "options": ["Responsive web", "Desktop web", "iOS app", "Android app", "Tablet", "Desktop app", "Fixed canvas (1920×1080)"] },
    { "id": "audience", "label": "Who is this for?", "type": "text",
      "placeholder": "e.g. early-stage investors, dev-tools buyers, internal exec review" },
    { "id": "tone", "label": "Visual tone", "type": "checkbox", "maxSelections": 2,
      "options": ["Editorial / magazine", "Modern minimal", "Playful / illustrative", "Tech / utility", "Luxury / refined", "Brutalist / experimental", "Human / approachable"] },
    { "id": "brand", "label": "Brand context", "type": "radio",
      "options": [
        { "label": "Pick a direction for me", "value": "pick_direction" },
        { "label": "I have a brand spec — I'll share it", "value": "brand_spec" },
        { "label": "Match a reference site / screenshot — I'll attach it", "value": "reference_match" }
      ] },
    { "id": "scale", "label": "Roughly how much?", "type": "text",
      "placeholder": "e.g. 8 slides, 1 landing + 3 sub-pages, 4 mobile screens" },
    { "id": "constraints", "label": "Anything else I should know?", "type": "textarea",
      "placeholder": "Real copy, fonts you must use, things to avoid, deadline…" }
  ]
}
</question-form>
```

## Default-router exception

If the Active skill is `od-default` or "Default design router", emit this form instead — the user did not choose a chip on Home, so this is the missing route selection:

```
<question-form id="task-type" title="Choose the task type">
{
  "description": "I will route the free-form prompt through the right Open Design workflow.",
  "questions": [
    {
      "id": "taskType",
      "label": "What should I build?",
      "type": "radio",
      "required": true,
      "options": [
        "Prototype",
        "Live artifact",
        "Slide deck",
        "Image",
        "Video",
        "HyperFrames",
        "Audio",
        "Other"
      ]
    },
    {
      "id": "constraints",
      "label": "Any important constraints?",
      "type": "textarea",
      "placeholder": "Audience, brand, format, length, aspect ratio, references, things to avoid..."
    }
  ]
}
</question-form>
```

After the user answers `[form answers — task-type]`, route through the standard discovery → plan → generate → critique flow for that task type.

## Form authoring rules

- Body must be valid JSON. No comments. No trailing commas.
- `type` is one of: `radio`, `checkbox`, `select`, `text`, `textarea`.
- For `checkbox` questions, include `maxSelections` when the user should choose only a limited number. Do not encode limits only in the label text.
- For object-style options, `label` is display copy (may follow the user's language); `value` is the stable internal key — keep `value` exact and unlocalized because later branch rules depend on it.
- If you keep the `brand` question, its `id` must stay `"brand"`. The three default branch values must stay exactly `"pick_direction"`, `"brand_spec"`, and `"reference_match"` even if you localize the labels.
- If the initial brief already includes a brand spec, brand-guide attachment, reference URL, or screenshot, you may drop the `brand` question — but treat that source as Branch A in turn 2.
- Tailor the questions to the actual brief — drop defaults the user already answered, add fields the brief uniquely needs (number of slides, list of mobile screens, sections of a landing page).
- **Read the project metadata** before writing the form. If `metadata.kind`, `metadata.fidelity`, etc. are set, drop the matching default question. If a field is `(unknown — ask)`, ADD a tailored question for it.
- Keep it under ~7 questions. Second batch in a follow-up form if needed.
- Lead with one short prose line ("Got it — pitch deck for a SaaS product, B2B audience. Tell me the rest:") then the form. Do **not** write a long pre-amble.
- After `</question-form>`, **stop the turn.** Do not write code. Do not start tools. Do not narrate "I'll wait."

## When to skip the form

The form applies even when the user's brief looks complete. A detailed brief still leaves design decisions open: visual tone, color stance, scale, variation count, brand context. Ask anyway. The user is fast at picking radios; they are slow at re-doing a wrong direction.

**Only** skip the form in these narrow cases:

- The user is replying *inside an active design* with a tweak ("make the headline bigger", "swap slide 3 image")
- The user explicitly says "skip questions" / "just build" / "no questions, go"
- The user's message starts with `[form answers — …]` (you already have the answers)

When skipping the form, do not skip brand-source handling: if the current message, attachments, prior brief, or URL already contains a brand spec / brand guide / reference site / screenshot source, follow Branch A in [brand-extraction.md](brand-extraction.md). Otherwise jump straight to RULE 3 in [plan-and-critique.md](plan-and-critique.md).

## How to ask these questions in an LLM-driven flow

> **Our addition (not from upstream).** Adapts the upstream form-emission semantics for OpenCode's editor-driven environment.

The upstream OD web app parses `<question-form>` markup into clickable UI. In OpenCode (or any chat-driven MCP client), the markup may not be rendered as interactive UI. Two options for the subagent:

**Option A — Emit the markup verbatim.**
Some MCP hosts (or downstream plugins) may parse `<question-form>` even in a chat environment. Default to emitting the markup verbatim. If the user replies with structured answers, you've gained the parseable UX for free.

**Option B — Ask conversationally if the host doesn't render forms.**
If the host won't render the form, ask the questions in prose. Each question becomes a numbered line. The content is identical to the JSON; only the wire format changes:

```
Got it — pitch deck for a SaaS product. Quick brief — 30 seconds:

1. What are we making? (Slide deck / Single web prototype / Multi-screen app prototype / Dashboard / Editorial / Other)
2. Target platform? (Responsive web / Desktop web / iOS / Android / Tablet / Desktop app / Fixed 1920×1080) — pick up to 4
3. Audience? (e.g. early-stage investors, dev-tools buyers, internal exec review)
4. Visual tone? (Editorial / Modern minimal / Playful / Tech / Luxury / Brutalist / Human) — pick up to 2
5. Brand context? (Pick a direction for me / I have a brand spec / Match a reference site or screenshot)
6. Roughly how much? (e.g. 8 slides, 1 landing + 3 sub-pages)
7. Anything else I should know? (Real copy, fonts, things to avoid, deadline)
```

Then **stop**. Wait for the user's answers. Parse them into the same logical structure (you have `output`, `platform`, `audience`, `tone`, `brand`, `scale`, `constraints`), then proceed to turn 2 branching in [brand-extraction.md](brand-extraction.md).

The form's intent is identical either way: lock the brief before generating. The wire format is incidental.

## Connection to turn 2

When the user answers, their next message will start with `[form answers — discovery]` (form-rendered case) or be free-form prose (conversational case). In either case, parse out the `brand` value — it determines the turn-2 branch:

- `brand_spec` or `reference_match` → Branch A (run extraction); see [brand-extraction.md](brand-extraction.md)
- `pick_direction` or no brand answer → Branch B (pick from library); see [direction-library.md](direction-library.md)
