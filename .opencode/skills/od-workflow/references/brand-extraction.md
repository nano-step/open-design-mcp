# Brand Extraction (Turn 2 — Branch A)

> Transcribed from upstream [nexu-io/open-design `discovery.ts:121-151`](https://github.com/nexu-io/open-design) (Apache 2.0). See [../ATTRIBUTION.md](../ATTRIBUTION.md).

When the user's turn-1 answer is `brand_spec` or `reference_match` AND they've provided an actual source (URL, file, screenshot), run brand-spec extraction **before** TodoWrite. This is non-negotiable: never guess colors from memory; extract real values from real artifacts.

## Branch resolution (turn 2 entry point)

Once the user submits the discovery form (next message starts with `[form answers — discovery]`) or the initial brief already answered the brand question, resolve the branch in this order:

1. If the current message, attachments, prior brief, or URL already contains an **actual** brand spec / brand guide / reference site / screenshot source → **Branch A** (this file).
2. Otherwise, look at the submitted `brand` value. When the answer line includes `[value: ...]`, use that stable value instead of the visible label.
3. If `brand` is `"brand_spec"` or `"reference_match"` AND a source has now been provided → **Branch A**.
4. If `brand` is `"brand_spec"` or `"reference_match"` but **no source was provided** → ask the user to paste/upload the spec or reference, then stop. Do NOT guess a brand domain. Do NOT invent tokens.
5. Otherwise → **Branch B** (see [direction-library.md](direction-library.md)).

An active design system does **not** suppress Branch A when the user provides a fresh brand/reference source. Run the extraction as a supplemental override, then reconcile with the active design system before RULE 3.

## The 5-step extraction (each step is its own tool call)

### Step 1 — Locate the source

- If the user attached files: `Read` each one, list filenames + types
- If they gave a URL: `WebFetch` the likely brand pages — `<brand>.com/brand`, `<brand>.com/press`, `<brand>.com/about`, `<brand>.com/about-us`, `<brand>.com/style`
- If they gave a screenshot or reference site: identify what you can extract (visible palette, type, layout posture)

Output: list of artifacts you've located, one per line.

### Step 2 — Download styling artifacts

- CSS files (linked from brand pages) → `WebFetch`
- Brand-guide PDFs → `WebFetch` then describe contents
- Screenshots → already on disk; reference them

Output: list of files you've gathered.

### Step 3 — Extract real values

```bash
# Hex codes from CSS:
Bash: grep -E '#[0-9a-fA-F]{3,8}' brand-styles.css | sort -u | head -30

# Find font-family declarations:
Bash: grep -E 'font-family' brand-styles.css | sort -u

# OKLch / hsl / rgb values:
Bash: grep -E 'oklch|hsl\(|rgb\(' brand-styles.css | sort -u
```

For screenshots, eyeball typography:
- Display face — does it have a clear personality (serif / geometric sans / humanist sans / mono)?
- Body face — usually a sans; is it the same family as display, or a contrast?
- Letter spacing, weight contrast, line-height proportions

**Never guess colors from memory.** If you can't find a hex in the CSS or screenshot, ask the user.

### Step 4 — Codify as `brand-spec.md`

`Write` `brand-spec.md` to the project root using this template:

```markdown
# Brand spec — <project-name>

Source: <URL / attachment list / reference name>
Extracted: <ISO 8601 timestamp>
Notes: <one line on confidence — "high (full CSS)", "medium (screenshots only)", "low (limited refs)">

## Color tokens (OKLch)

--bg:      oklch(...)   /* page background — neutral or brand-primary */
--surface: oklch(...)   /* card / panel background */
--fg:      oklch(...)   /* primary text */
--muted:   oklch(...)   /* secondary text, metadata */
--border:  oklch(...)   /* dividers, panel borders */
--accent:  oklch(...)   /* CTA buttons, links, badges — one accent, used 2x max per screen */

## Type stack

Display: '<display family>', <fallback>, <generic>
Body:    '<body family>', <fallback>, <generic>
Mono:    '<mono family>', ui-monospace, monospace   /* for metadata, code, tabular numerics */

## Layout posture

- <radii rule — e.g. "rounded-xl (12px) everywhere, no fully-rounded pills">
- <border weight rule — e.g. "1px borders only, never 2px+">
- <accent budget — e.g. "accent color used at most 2x per screen, never on body text">
- <shadow rule — e.g. "no drop shadows; depth via border + surface tint">
- <decoration rule — e.g. "no gradients on backgrounds; gradients allowed only on illustration assets">
```

The 6 color tokens map directly to the CSS `:root` you'll bind in RULE 3 step 2. The type stack drops into `--font-display` / `--font-body` / `--font-mono`. The posture rules become the design constraints the artifact must respect.

### Step 5 — Vocalize the system

In one sentence, state what you'll use so the user can redirect cheaply:

> "Deep navy product canvas (`oklch(15% 0.03 250)`), single electric-cyan accent (`oklch(68% 0.16 220)`) used 2x per page on CTAs and the active-state ring, IBM Plex Sans for display + system body, rounded-xl with 1px hairlines."

Then proceed to RULE 3 (see [plan-and-critique.md](plan-and-critique.md)).

## Brand-spec.md template (copy-paste)

```markdown
# Brand spec — Acme Pricing

Source: https://acme.com/brand + attached logo.png
Extracted: 2026-05-18T16:30:00Z
Notes: high confidence (full CSS + brand-guide PDF)

## Color tokens (OKLch)

--bg:      oklch(98% 0.005 250)
--surface: oklch(100% 0.000 0)
--fg:      oklch(18% 0.040 250)
--muted:   oklch(48% 0.020 250)
--border:  oklch(90% 0.010 250)
--accent:  oklch(58% 0.18 260)

## Type stack

Display: 'Söhne', -apple-system, BlinkMacSystemFont, system-ui, sans-serif
Body:    'Söhne', -apple-system, BlinkMacSystemFont, system-ui, sans-serif
Mono:    'JetBrains Mono', ui-monospace, monospace

## Layout posture

- rounded-2xl (16px) on cards, rounded-md (6px) on buttons; no fully-rounded pills
- 1px hairline borders only; depth via subtle surface tint
- accent used at most 2x per page (CTA + one feature highlight)
- no shadows on cards; sticky nav gets a subtle shadow on scroll only
- gradients only on illustration assets, never on backgrounds or text
```

## Reconciling with an active design system

If a project already has an `Active design system` (set via `od_update_project { designSystemId }` — currently inert in our MCP but may be wired later), and the user provides a fresh brand source via Branch A:

1. Extract per the 5 steps above
2. Diff against the active DESIGN.md
3. Vocalize the merged system, calling out what overrides what:
   > "Active DESIGN.md provides the type stack and layout posture; the brand-spec.md you shared overrides the palette to match your visual identity (deep navy + electric cyan)."
4. Pass the merged result to RULE 3

If unsure which signal wins on a specific token, ask the user before proceeding.

## When to STOP and ask the user

These are blockers — don't try to work around them:

- `brand_spec` selected but no spec provided in this turn or earlier → ask for it, stop
- `reference_match` selected but no URL/screenshot provided → ask for it, stop
- Source CSS has no extractable hex codes (e.g. all `var(--...)` with no fallback chain you can resolve) → ask for the resolved palette, stop
- Source is a screenshot with ambiguous typography (could be Inter or Söhne — they look similar in some sizes) → ask the user, stop

Pasting "I don't know, just pick" is fine — switch to Branch B (pick a direction from the library).
