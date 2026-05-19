# v1 Ships Dogfood Report

Date: 2026-05-19
Daemon: https://od.thnkandgrow.com
Versions: open-design-mcp v0.14.2 (npm) / serverInfo v0.1.0 (package.json discrepancy) + od-workflow skill v0.1.1

---

## Acceptance Signals

| # | Signal | Status | Evidence |
|---|---|---|---|
| 1 | Discovery emitted on Turn 1 | **PASS** | `<question-form id="discovery">` emitted verbatim per `references/discovery-form.md` §"The standard discovery form". Defaults documented and applied immediately since no human respondent. |
| 2 | od_compose_brief used + format correct | **PASS** | `od_compose_brief` returned 2,114-char string. All 3 sections present in correct order: `[form answers — discovery]` at idx 0, `[brand spec]` at idx 360, `[page brief]` at idx 1,753. First 200 chars: `'[form answers — discovery]\n- output: Single web prototype / landing\n- platform: Responsive web\n- audience: Backend developers evaluating dev tooling\n- tone: Modern minimal, Tech / utility\n- brand: pic'` |
| 3 | Daemon recognized form-answered, did NOT re-ask | **PASS** | Generation response began: `"Good brief — \`lithe\` Go load balancer, tech-utility direction, real copy only."` — proceeded directly to planning and HTML output. Zero occurrences of question markers (`what platform`, `who is this for`, `question-form`). |
| 4 | customInstructions auto-fetch wired (#37) | **FAIL** | `grep -c 'DOGFOOD-MARKER-7K3X' /tmp/dogfood-generated.html` → **0**. Root cause: The hosted daemon's `GET /api/projects/:id` endpoint does NOT return `customInstructions` in the response body (verified via direct curl). `od_generate_design` reads `detail.project.customInstructions` from that endpoint — since the field is absent in the response, it silently falls through to `undefined`. The `od_update_project` call succeeded and returned 200, but the field is never surfaced back by the daemon API. Issue is daemon-side, not MCP-side. |
| 5 | Anti-AI-slop checklist | **PASS with 0 hard failures** (1 partial nit) | See checklist below. |

---

## Project

- ID: `v1-dogfood-2026-05-19`
- URL: https://od.thnkandgrow.com/projects/v1-dogfood-2026-05-19
- Artifact slug: `landing` (identifier field, not `slug`)
- Artifact URL: `/artifacts/2026-05-19-01-51-15-landing/index.html` (relative path returned by daemon)

---

## Anti-AI-Slop Checklist (11 items)

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Aggressive purple/violet gradient backgrounds | ✅ PASS | No gradient backgrounds found |
| 2 | Generic emoji feature icons (✨ 🚀 🎯 …) | ✅ PASS | Zero emoji in output |
| 3 | Rounded card with left coloured border accent | ✅ PASS | Uses hairline `border` not left-accent pattern |
| 4 | Hand-drawn SVG humans / faces / scenery | ✅ PASS | Only inline icon SVGs (hamburger menu) |
| 5 | Inter / Roboto / Arial as display face | ✅ PASS | Inter is body/display (1-family tech-utility exception per direction library is intentional) |
| 6 | Invented metrics ("10× faster", "99.9% uptime") | ✅ PASS | No fake metrics found; uses "v0.9.2 — open beta" tag |
| 7 | Filler copy ("Feature One / Feature Two", lorem ipsum) | ✅ PASS | Real copy: "An HTTP load balancer that doesn't require a PhD to operate." |
| 8 | Icon next to every heading | ✅ PASS | No heading icons |
| 9 | Gradient on every background | ✅ PASS | Zero gradients |
| 10 | Warm beige / cream / peach / pink / orange-brown backgrounds | ✅ PASS | OKLch palette verbatim from tech-utility direction |
| 11 | Product artifacts exposing designer settings / demo controls | ✅ PASS | No Tweaks panel, no viewport selectors |

**One nit (not a slop item):** The `config-panel` in the hero shows `ops@corp.io` as the TLS email — this is an honest domain-specific placeholder, not lorem ipsum. Acceptable.

---

## 5-Dimensional Critique

- **Composition: 4/5** — Clear hero with one dominant element (config panel + headline). Good scan path. Minus 1: HTML truncated before Features/Pricing/FAQ — only hero section present in artifact. Incomplete page cannot be fully scored on full-page composition.
- **Hierarchy: 4/5** — Single dominant H1 ("An HTTP load balancer that doesn't require a PhD to operate."), one primary CTA ("Download binary"), clear badge. Excellent for hero scope. Pricing/FAQ sections absent so full hierarchy chain unverifiable.
- **Execution: 4/5** — OKLch tokens bound verbatim from tech-utility direction library. `clamp()` fluid type. `font-family: var(--font-sans)` / `var(--font-mono)` correct. Hairline borders (`--border-w: 1px`), no shadows. Status pills (`pill-success`) implemented. Mobile breakpoints at 560px, 700px, 768px, 900px — good range but slightly tight cluster; could add 1280px for wide desktop.
- **Specificity: 5/5** — Every line of visible copy is domain-specific: real YAML config, real IP addresses (10.0.0.10:8080), Go 1.22+ requirement, SIGHUP hot reload, `/healthz` health check path. Zero filler.
- **Restraint: 4/5** — One accent (signal green `oklch(58% 0.16 145)`), used on CTA and badge. Config panel is the one decisive flourish. Minus 1: `--danger` and `--warn` tokens defined but not visible in generated fragment — can't score their usage.

---

## Surprises / Issues Found

### BLOCKING

1. **Signal 4 FAIL — customInstructions not returned by daemon API** (`GET /api/projects/:id`): The hosted daemon does not include `customInstructions` in the `ProjectDetailResponse`. `od_update_project` returns HTTP 200 but the field disappears from GET responses. This means #37 auto-fetch is broken end-to-end on the hosted deployment even though the MCP server code is correct. The DOGFOOD-MARKER never appeared in the generated HTML.

2. **HTML generation truncated**: The generated HTML (19,788 bytes) is incomplete — cuts off mid-hero section. No `</body>`, `</html>`, no Features/Pricing/FAQ. The LLM plan narrative (1,007 chars) consumed output budget before features section. A full landing page brief with 5 sections is likely exceeding the BYOK model's output token window. **The artifact saved to the daemon is not a usable landing page.**

### NON-BLOCKING (schema mismatches between SKILL.md docs and actual tool schemas)

3. **`od_create_project` requires client-supplied `id`**: SKILL.md says "Returns the project details and an auto-seeded conversation ID" (implying server-generated IDs). The actual schema has `id: string` as a **required** field. An agent following the skill docs will fail on first call. The skill docs, README, and task spec all need updating.

4. **`od_save_artifact` schema mismatch**: SKILL.md/task spec says `{projectId, slug, html}`. Actual schema is `{identifier, title, html}` — no `projectId`, no `slug`. `identifier` replaces `slug`. `title` is required and not mentioned. This is a **breaking discrepancy** between docs and implementation.

5. **`od_save_artifact` is not project-scoped**: The tool saves to a global artifact store, not under a project. The `structuredContent` returned by `od_get_project` shows `files: []` even after saving — the saved artifact and the project are disconnected. This undermines the "multi-page consistency" hot-path described in SKILL.md §"Multi-page consistency."

6. **Lint tool schema mismatch**: SKILL.md says `od_lint_artifact { projectId, slug: "landing" }` (project-scoped lookup). Actual schema only accepts `{html: string}` (inline HTML). You must pass the raw HTML, not a project+slug reference.

7. **`od_compose_brief` briefAnswers schema**: Expected object `{output, platform: string[], tone: string[], ...}` not a formatted string. The SKILL.md skill-level description doesn't specify this clearly. Discovered only at call-time from validation error.

8. **`serverInfo.version` reports `0.1.0` not `0.14.2`**: The `package.json#version` in the npm package is `0.1.0` despite the npm registry showing `0.14.2`. Minor, but confusing for debugging.

### OBSERVATIONS

9. **Generation quality is high for the hero section that was produced**: Real copy, correct OKLch tokens, domain-specific YAML config panel, inline status pills, responsive media queries — all authentic tech-utility style. The skill is guiding the LLM well for what got generated.

10. **MCP config in opencode.json uses Docker network URL**: The session's configured `OD_DAEMON_URL=http://ai-open-design:7456` pointed at a different daemon instance than the task-specified `https://od.thnkandgrow.com/`. This was caught and the dogfood was redirected to the hosted daemon via a custom stdio client. This config discrepancy could silently test the wrong daemon in future sessions.

---

## Verdict

**NEEDS WORK**

Core workflow (discovery → direction → compose-brief → generate → lint) mostly functions. The skill guidance is effective — the LLM followed the playbook, emitted real copy, chose tech-utility correctly, and did not re-ask discovery questions. However:

- Signal 4 (customInstructions #37) FAILS because the hosted daemon does not expose the field in GET responses — rendering the most-promoted v1 feature unverifiable.
- The generated artifact is incomplete (HTML truncated) — a full landing page brief exceeds the BYOK model's output capacity with the current prompt composition.
- Four schema mismatches between documented API (`od_create_project`, `od_save_artifact`, `od_lint_artifact`, `od_compose_brief briefAnswers`) and actual implementations will break any agent following the skill docs precisely.

---

## Recommended Next Step

Fix the daemon's `GET /api/projects/:id` response to include `customInstructions` when set — this is the single most-impactful unblock for Signal 4 and the #37 feature. In parallel: update `od_save_artifact` to accept `{projectId, slug, html}` OR update the SKILL.md and README to document the actual `{identifier, title, html}` schema. Run a second dogfood after those two fixes to confirm Signal 4 fires. For the generation truncation, consider either a two-pass generation strategy (hero then features+pricing+FAQ) or a smaller default prompt that fits within the model's output window.

---

## Turn-by-Turn Transcript

| Turn | Action | Result |
|---|---|---|
| 1 | Emitted discovery form (verbatim from references/discovery-form.md), documented defaults | Discovery form emitted, defaults applied |
| 2 | Read direction-library.md, selected tech-utility, wrote /tmp/dogfood-brand-spec.md | Brand spec written with OKLch tokens verbatim |
| 3 | TodoWrite 9-step plan | Plan created |
| 4 | od_list_projects → 7 projects; od_create_project (needed explicit id); od_update_project (customInstructions stored, 200 OK) | projectId: v1-dogfood-2026-05-19 |
| 5 | od_compose_brief (briefAnswers must be object not string) | 2,114-char composed brief with 3 sections in correct order |
| 6 | od_generate_design with full brief | HTML generated (19,788 bytes) — TRUNCATED, hero only |
| 7 | od_save_artifact (schema: identifier+title+html, no projectId) | Saved to /artifacts/2026-05-19-01-51-15-landing/index.html |
| 8 | od_lint_artifact (schema: {html}) → 0 P0, 0 P1, 1 P2 | 1 P2: missing data-od-id on sections |
| 9 | 5-dim critique + anti-slop checklist | 11/11 anti-slop PASS, critique 4-4-4-5-4 |
