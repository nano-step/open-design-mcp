# Brand Spec — tech-utility direction

Direction: tech-utility (Datadog / GitHub style)
Mood: Data-dense, monospace-friendly, light + grid. Made for engineers and operators who want information per square inch, not vibes.
References: Datadog, GitHub, Cloudflare dashboard, Sentry

## Typography

- Display: `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif`
- Body: `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif`
- Mono: `'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace`

## Palette (OKLch — verbatim from direction library)

```css
--bg:      oklch(98% 0.005 250)
--surface: oklch(100% 0 0)
--fg:      oklch(22% 0.02 240)
--muted:   oklch(50% 0.018 240)
--border:  oklch(90% 0.008 240)
--accent:  oklch(58% 0.16 145)   /* signal green */
```

## Layout Posture

- Sans display + sans body (one family) — utility trumps editorial
- Tabular numerics everywhere, mono for code / IDs / hashes
- Dense tables with hairline borders, no row striping
- Inline status pills (success / warn / danger) with restrained tinted backgrounds
- Avoid: hero images, oversized headlines, marketing copy — show the product instead

## Constraints (from brief)

- No fake metrics (no "10× faster", "99.9% uptime")
- No emoji icons
- No purple/violet gradients
- Real copy only — honest placeholders over invented stats
