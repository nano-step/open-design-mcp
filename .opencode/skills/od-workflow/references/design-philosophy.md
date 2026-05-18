# Design Philosophy (A–I)

> Transcribed from upstream [nexu-io/open-design `discovery.ts:203-294`](https://github.com/nexu-io/open-design) (Apache 2.0). See [../ATTRIBUTION.md](../ATTRIBUTION.md).

These 9 principles apply to every artifact. They are the difference between "the AI shipped something" and "the design is right."

## A. Embody the specialist

Pick the persona BEFORE writing CSS:

- **Responsive / cross-platform prototype** → product systems designer. Define shared information architecture first, then explicit modern breakpoint variants: mobile compact (360px), mobile standard/large (390–430px), foldable/small tablet (600–744px), tablet portrait (768–834px), tablet landscape/large tablet (1024–1180px), laptop (1280–1366px), desktop (1440–1536px), wide (1920px). Use CSS container queries, fluid `clamp()` scales, semantic layout thresholds for web; use device frames for app surfaces. Never merely shrink desktop cards into a phone viewport.
- **Slide deck** → slide designer. Fixed canvas, scale-to-fit, one idea per slide, headlines ≥ 36px, body ≥ 22px, slide counter visible, theme rhythm (no 3+ same-theme in a row).
- **Mobile app prototype** → interaction designer. Real iPhone frame (Dynamic Island, status bar SVGs, home indicator), 44px hit targets, real screens (not "feature one" placeholders).
- **Landing / marketing** → brand designer. One hero, 3–6 sections, real copy, *one* decisive flourish.
- **Dashboard / tool UI** → systems designer. Information density is the feature. Monospace numerics, tabular data, no decoration.

## B. Use the skill's seed + layouts — don't write from scratch

Every prototype / mobile / deck skill ships:
- `assets/template.html` — a complete, opinionated seed with tokens + class system
- `references/layouts.md` — paste-ready section/screen/slide skeletons
- `references/checklist.md` — P0/P1/P2 self-review

**Read them in that order before writing anything.** Don't write CSS from scratch — copy the seed, replace tokens, paste layouts. The single biggest reason upstream `guizang-ppt` outputs look better than ad-hoc decks: the agent isn't re-deriving good defaults each time.

## C. Anti-AI-slop checklist (audit before shipping)

Every artifact must pass this before `od_save_artifact`. Any ❌ found → fix or replace with an honest placeholder.

- ❌ Aggressive purple/violet gradient backgrounds
- ❌ Generic emoji feature icons (✨ 🚀 🎯 …)
- ❌ Rounded card with a left coloured border accent
- ❌ Hand-drawn SVG humans / faces / scenery
- ❌ Inter / Roboto / Arial as a *display* face (body is fine)
- ❌ Invented metrics ("10× faster", "99.9% uptime") without a source
- ❌ Filler copy — "Feature One / Feature Two", lorem ipsum
- ❌ An icon next to every heading
- ❌ A gradient on every background
- ❌ Warm beige / cream / peach / pink / orange-brown page backgrounds (unless brand requires)
- ❌ Product artifacts that expose designer settings, viewport selectors, platform toggles, target-count badges, "demo controls", or generated-design metadata as if they were app UI

When you don't have a real value, leave a short honest placeholder (`—`, a grey block, a labelled stub) instead of inventing one. **An honest placeholder beats a fake stat.**

## D. Variations, not "the answer"

Default to 2–3 differentiated directions on the same brief — different color, type personality, rhythm — when the user is exploring. For prototypes mid-flight, prefer tweaks on a single page over multiplying files.

## E. Junior-pass first

Show something visible early, even if it's a wireframe with grey blocks and labelled placeholders. The user redirects cheaply at this stage. Wrap the first pass in a visible artifact and **say** it is a wireframe — calibrate expectations.

## F. Color and type

- Prefer the active design system's palette OR the chosen direction's palette
- If extending, derive harmonious colors with `oklch()` instead of inventing hex
- Background must come from the product domain / brand / direction — never from generic app chrome or a default cozy canvas
- For product utilities, marketplaces, dashboards, SaaS: start from neutral or brand-colored foundations; do NOT fall back to warm beige / peach / pink / orange-brown Claude-style canvases just because no brand was provided
- Pair a display face with a quieter body face — never let body and display be the same family (the only exception is "tech / utility" direction which is intentionally one family)
- One accent color, used at most twice per screen

## G. Slides + prototypes

**Slides:**
- Persist position to `localStorage` (the upstream simple-deck and guizang-ppt seeds already do)
- Tag slides with `data-screen-label="01 Title"`
- Slide numbers are 1-indexed
- Theme rhythm: no 3+ same-theme in a row

**Product prototypes:**
- Do NOT include floating Tweaks panels, platform/settings choosers, theme knobs, viewport toggles, or other designer/demo controls in the artifact
- If variation controls are useful for internal iteration, keep them OUT of final product files unless the user explicitly asks for a design-system/spec dashboard

## H. Cross-platform + multi-device layouts

When the user selects multiple platform targets or `metadata.platform: responsive`, design the SAME product across surfaces instead of one web-only page:

- **Responsive web**: include desktop, tablet, and mobile states. Fluid type with `clamp()`, breakpoint/container-query adaptations. Verify no horizontal scroll at 360px / 390px / 430px / 600px / 820px / 1024px / 1366px / 1440px / 1920px. Mobile layout must be REDESIGNED for small screens — not a squeezed desktop.
- **iOS app**: dedicated iOS file (e.g. `mobile-ios.html`) with iPhone frame, Dynamic Island, 44px hit targets, iOS-safe bottom navigation. No Android Material navigation.
- **Android app**: dedicated file (e.g. `mobile-android.html`) with Pixel frame, status + nav bar, 48dp hit targets, Material patterns. No iOS chrome.
- **Tablet**: dedicated file with split panes, sidebars, inspectors, larger touch targets. Do NOT scale phone UI up.
- **Desktop app**: desktop chrome/sidebar density, keyboard-friendly states, resizable panes, hover/focus states.
- **App-specific modules**: every product prototype must include domain-specific in-app modules by default (cart/order/coupon for commerce, player controls for media, balance/transaction for finance, streak/check-in for habits). These are INSIDE the app UI with purpose, states, responsive behavior, interaction notes.
- **OS widgets**: only when requested by metadata. Realistic sizes, quick actions, platform-native (Live Activity, lock-screen, glance, widget).
- **CJX-ready UX**: artifacts must be implementation-ready. Real JS for tabs, modals, drawers, filters, form validation, copy/generate actions, player controls, state transitions. A self-contained `index.html` is OK only if CSS/JS is structured and labelled; complex UX may use `css/` and `js/` folders.

For multi-device prototypes (desktop + tablet + phone, or multi-screen flow), use the upstream's shared device frames at `/frames/`:
- `/frames/iphone-15-pro.html` — 390 × 844, Dynamic Island
- `/frames/android-pixel.html` — 412 × 900
- `/frames/ipad-pro.html` — iPad Pro 11"
- `/frames/macbook.html` — MacBook Pro 14"
- `/frames/browser-chrome.html` — macOS Safari

Each accepts `?screen=<path>` and embeds that path inside the device chrome. Pattern:

```html
<iframe src="/frames/iphone-15-pro.html?screen=screens/01-onboarding.html"
        width="390" height="844" loading="lazy"></iframe>
```

Don't re-draw a phone/laptop frame from scratch — use the shared frames.

## I. Restraint over ornament

"One thousand no's for every yes." A single decisive flourish — one orchestrated load animation, one striking pull quote, one piece of real photography — separates work from a sketch. Three competing flourishes turn it back into noise.

If you can't decide which flourish to keep: keep the one that serves the brief's core promise. Strip the others.

## Default arc (recap)

- **Turn 1** — short prose line + `<question-form id="discovery">` + stop (see [discovery-form.md](discovery-form.md))
- **Turn 2** — branch on `brand`:
  - `brand_spec` / `reference_match` + source provided → run [brand-extraction.md](brand-extraction.md), write `brand-spec.md`, then TodoWrite
  - `brand_spec` / `reference_match` without source → ask for the source, stop (no guessing)
  - `pick_direction` or no answer → pick from [direction-library.md](direction-library.md), bind without asking
- **Turn 3+** — work the [plan-and-critique.md](plan-and-critique.md):
  - TodoWrite plan
  - Mark todos completed as each lands
  - Show something visible early (junior-pass)
  - Run checklist + 5-dim critique BEFORE emitting
  - Emit single `<artifact>` (or, in MCP context: `od_save_artifact`)
