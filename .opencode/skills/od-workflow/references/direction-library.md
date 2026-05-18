# Direction Library (Turn 2 — Branch B)

> Transcribed from upstream [nexu-io/open-design `directions.ts`](https://github.com/nexu-io/open-design) (Apache 2.0). See [../ATTRIBUTION.md](../ATTRIBUTION.md).

When the user's `brand` answer is `pick_direction` or they skip it entirely, pick one of these 5 directions yourself based on the `tone` answer. Bind the palette and type stack to the seed template's `:root` **verbatim** — do not improvise OKLch values.

## How to pick

1. Map the `tone` answer to a direction:
   - "Editorial / magazine" → **editorial-monocle**
   - "Modern minimal" or "Tech / utility" + tone="utility" → **modern-minimal** or **tech-utility**
   - "Tech / utility" alone → **tech-utility**
   - "Human / approachable" → **human-approachable**
   - "Playful / illustrative" + no brand → **human-approachable** (closest soft default)
   - "Brutalist / experimental" → **brutalist-experimental**
   - "Luxury / refined" → **editorial-monocle** (with restraint)
2. Vocalize the choice in one sentence ("Going with `modern-minimal` — Linear/Vercel-style, cobalt accent on neutral whites, system fonts").
3. Bind the palette + type stack into the seed template's `:root`.
4. Proceed to RULE 3.

Do **not** emit a second direction-picking form. Do **not** ask "which direction?" — the tone answer already told you.

---

## editorial-monocle — Editorial — Monocle / FT magazine

**Mood:** Print-magazine feel for explicitly editorial / publishing briefs. Generous whitespace, large serif headlines, restrained palette of neutral paper + ink + a single brand-justified accent. Do NOT use this as the default for commerce, SaaS, dashboards, or product utilities.

**References:** Monocle, The Financial Times Weekend, NYT Magazine, It's Nice That

**Type:**
- Display: `'Iowan Old Style', 'Charter', Georgia, serif`
- Body: `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`

**Palette (OKLch):**
```css
--bg:      oklch(98% 0.004 95)   /* neutral paper, NOT beige wash */
--surface: oklch(100% 0.002 95)
--fg:      oklch(20% 0.018 70)   /* ink */
--muted:   oklch(48% 0.012 70)
--border:  oklch(90% 0.006 95)
--accent:  oklch(52% 0.10 28)    /* restrained editorial red; override from brand when available */
```

**Posture:**
- Serif display, sans body, mono for metadata only
- No shadows, no rounded cards — borders + whitespace do the work
- One decisive image, cropped only at the bottom
- Kicker / eyebrow in mono uppercase, one accent color, used at most twice
- Never create peach/pink/orange-beige page washes unless the brand explicitly requires them

---

## modern-minimal — Modern minimal — Linear / Vercel

**Mood:** Quiet, precise, software-native. System fonts, crisp neutral foundations, and a small but visible product palette (primary + secondary + status/accent) so the interface feels shipped rather than greyscale. The chrome stays restrained while interaction states, illustrations, charts, and product moments carry color.

**References:** Linear, Vercel, Notion 2024, Stripe docs

**Type:**
- Display: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif`
- Body: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`

**Palette (OKLch):**
```css
--bg:      oklch(99% 0.002 240)
--surface: oklch(100% 0 0)
--fg:      oklch(18% 0.012 250)
--muted:   oklch(54% 0.012 250)
--border:  oklch(92% 0.005 250)
--accent:  oklch(58% 0.18 255)   /* cobalt */
```

**Posture:**
- Tight letter-spacing on display sizes (-0.02em)
- Hairline borders only, no shadows except dropdowns/modals
- Mono numerics with `font-variant-numeric: tabular-nums`
- Sticky frosted nav, content-led layouts with one product illustration / device mockup / data viz when it clarifies the product
- Controlled color system: primary action + one secondary signal + status colors; avoid monochrome but never flood every card with gradients

---

## human-approachable — Human / approachable — Airbnb / Duolingo systems

**Mood:** Friendly and tactile without the generic cozy canvas. Uses a clean neutral background, product-led color system, generous radii, and clear hierarchy. Good for consumer tools, marketplaces, wellness, education, translation, AI assistants, and indie SaaS when the brand hasn't supplied a palette.

**References:** Airbnb, Duolingo product surfaces, Miro, Mercury

**Type:**
- Display: `'Söhne', 'Avenir Next', -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
- Body: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`

**Palette (OKLch):**
```css
--bg:      oklch(98% 0.004 240)
--surface: oklch(100% 0 0)
--fg:      oklch(20% 0.02 240)
--muted:   oklch(50% 0.018 240)
--border:  oklch(90% 0.006 240)
--accent:  oklch(56% 0.12 170)   /* brand-safe teal */
```

**Posture:**
- Sans display with strong weight contrast, system body for readability
- Comfortable radii (12–18px) paired with crisp grid alignment
- Primary action + secondary/domain accent + clear status colors
- Subtle elevation only on interactive cards; tasteful gradients/glows allowed for hero/device/product moments, never as a full-page beige/pastel wash
- Avoid generic pastel/beige gradients; use real screenshots, data, or labelled placeholders

---

## tech-utility — Tech / utility — Datadog / GitHub

**Mood:** Data-dense, monospace-friendly, dark or light + grid. Made for engineers and operators who want information per square inch, not vibes.

**References:** Datadog, GitHub, Cloudflare dashboard, Sentry

**Type:**
- Display: `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif`
- Body: `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif`
- Mono: `'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace`

**Palette (OKLch):**
```css
--bg:      oklch(98% 0.005 250)
--surface: oklch(100% 0 0)
--fg:      oklch(22% 0.02 240)
--muted:   oklch(50% 0.018 240)
--border:  oklch(90% 0.008 240)
--accent:  oklch(58% 0.16 145)   /* signal green */
```

**Posture:**
- Sans display + sans body (one family) is OK here — utility trumps editorial
- Tabular numerics everywhere, mono for code / IDs / hashes
- Dense tables with hairline borders, no row striping
- Inline status pills (success / warn / danger) with restrained tinted backgrounds
- Avoid: hero images, oversized headlines, marketing copy — show the product instead

---

## brutalist-experimental — Brutalist / experimental — Are.na / Yale

**Mood:** Loud type. Visible grid. System sans + a single oversized serif. Deliberate ugliness as confidence. Great for art, indie, agency, manifesto pages.

**References:** Are.na, Yale Center for British Art, mschf, Read.cv

**Type:**
- Display: `'Times New Roman', 'Iowan Old Style', Georgia, serif`
- Body: `ui-monospace, 'IBM Plex Mono', 'JetBrains Mono', Menlo, monospace`

**Palette (OKLch):**
```css
--bg:      oklch(98% 0.004 240)   /* neutral printer paper */
--surface: oklch(100% 0 0)
--fg:      oklch(15% 0.02 100)
--muted:   oklch(40% 0.02 100)
--border:  oklch(15% 0.02 100)    /* borders are full-strength fg */
--accent:  oklch(60% 0.22 25)     /* hot red */
```

**Posture:**
- Display = serif at extreme sizes (`clamp(80px, 12vw, 200px)`)
- Body = monospace — yes, monospace as body, deliberately
- Borders are full-strength fg (1.5–2px), not muted greys
- Asymmetric layouts: one column 70%, the other 30%
- Almost no border-radius (0–2px). No shadows. No gradients.
- Underline links, no hover decoration — let the typography carry it

---

## Override semantics

If the user provided an `accent_override` text (from the optional follow-up field — e.g. "use moss green instead of cobalt"), apply it AFTER binding the direction's palette:

```css
:root {
  --bg:      <from direction>;
  --surface: <from direction>;
  --fg:      <from direction>;
  --muted:   <from direction>;
  --border:  <from direction>;
  --accent:  <override, converted to OKLch>;  /* parse the user's intent */
}
```

For free-form accent overrides ("moss green", "warmer red"), pick a reasonable OKLch interpretation and vocalize it so the user can redirect.
