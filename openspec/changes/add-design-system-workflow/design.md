## Context

`open-design-mcp` v0.16.1 ships 10 MCP tools that bridge coding agents to a running Open Design daemon. The flagship tool, `od_generate_design` (`src/tools/generate-design.ts:86–258`), composes a ~20–50 KB system prompt via the vendored `composeSystemPrompt` and streams a single HTML page back from the BYOK provider. Each call is independent: the model has no obligation to reuse colors, type, spacing, or component shapes from prior pages in the same project.

The daemon API already carries a `designSystemId` field on every project (set via `od_create_project` at `src/tools/create-project.ts:76` and `od_update_project`), but this MCP currently *writes* it without ever *reading* it back into the generation pipeline. The `od-workflow` skill works around this by stuffing a brand spec into the project's `customInstructions`, but free-form text is interpreted differently by the model on every call — the contract is advisory, not enforced.

Stakeholders:
- **Designers / brand owners** authoring multi-page projects and reviewing cross-page consistency.
- **AI agents** (OpenCode, Claude Code, Cursor, Zed) that drive the MCP and need a stable contract to reason about.
- **Daemon maintainers** (`nexu-io/open-design`) — we MUST NOT require schema changes on their side.

Hard constraints from the engineering harness (`docs/HARNESS.md`):
- Backward-compatible (semver-minor); no existing tool may regress.
- Vendored sources under `vendor/od-contracts/` must remain pristine unless a `MODIFICATION` header is added per Apache 2.0 §4(b).
- All new tools registered through `src/tools/index.ts` and counted in the server-bootstrap assertion in `src/server.ts`.
- Lint, typecheck, unit, and integration tests must all pass with `--max-warnings 0`.

## Goals / Non-Goals

**Goals:**

- Make cross-page visual consistency a property *of the project*, not a behavior the agent has to remember to enforce per call.
- Keep the contract machine-readable (JSON manifest + canonical CSS) so it can be programmatically validated, not just prompted.
- Defense-in-depth: prompt injection (load-bearing) + static lint (safety net), so even a model that ignores the contract gets caught before the output ships.
- Zero behavior change for projects without a linked design system. The feature is invisible until opted into.
- Three new tools + two backward-compatible argument additions to existing tools. No daemon-side or vendor changes.

**Non-Goals:**

- Auto-repair of off-contract pages (`od_apply_design_system`) — v0.18.
- Mass page regeneration when the system changes (`od_regenerate_pages`) — v0.18.
- Multiple design systems per project or per-page overrides.
- Theming / dark-mode variants (single canonical system per project for v0.17).
- Visual / pixel-level QA. Lint is structural and token-based, not visual-diff.
- Editing vendored `composeSystemPrompt`.

## Decisions

### D1. One artifact, three layered sections — not three artifacts

The design system is **one** `design-system.html` file with three named sections (`<style id="od-tokens">`, `<style id="od-components">`, `<style id="od-layout">`), a JSON manifest in `<script type="application/json" id="od-design-system-manifest">`, and a human-reviewable component gallery in `<body>`.

**Rationale:** every page generation needs all three layers; splitting them into separate files multiplies fetch failures and breaks the "one slug, one system" mental model. Inlined CSS round-trips byte-identically into generated pages (the strongest consistency guarantee available without a runtime). The HTML body is rendered by the daemon's existing project viewer for human review — no new viewer needed.

**Alternatives considered:**
1. **Pure JSON spec** — rejected: no human-reviewable form; reviewers want to *see* the buttons.
2. **Separate CSS + components directory** — rejected: forces N file fetches per page generation, breaks atomicity, and complicates versioning.
3. **Stuffed into `customInstructions`** — rejected: free-form text, 5000-char cap, no enforceability. This is what we're replacing.

**Reference pattern:** mirrors how design tokens are typically distributed by tools like Style Dictionary (JSON source → CSS output), but unified into a single artifact for our LLM-driven workflow. (Style Dictionary, https://amzn.github.io/style-dictionary/, v3.x.)

### D2. Storage via existing `od_save_project_file` + existing `designSystemId` field

The design system file is saved through the daemon's existing project files endpoint by convention name `design-system.html` and linked via the daemon's existing `designSystemId` field on the project.

**Rationale:** zero daemon-side changes. The `designSystemId` field already exists in the OD daemon API (`vendor/od-contracts/src/api/projects.ts`) and is accepted by `od_create_project` / `od_update_project` today; we are simply giving it a defined meaning. Lookup is project-scoped (no global namespace collisions).

**Alternatives considered:**
1. **New `od_save_design_system` write tool** — rejected: redundant with `od_save_project_file` for v0.17. The shape of the file is enforced by the *generator* and the *linter*, not by the storage tool.
2. **A daemon-side `/design-systems` collection** — rejected: requires upstream changes; violates the "no daemon changes" constraint.

### D3. Wrapper-injection over vendor modification

When `od_generate_design` resolves a project with a `designSystemId`, the MCP handler (`src/tools/generate-design.ts`) fetches the linked file, extracts the JSON + CSS via the shared extractor, and prepends a **"Design System Contract"** block to the system prompt that `composeSystemPrompt` returns — entirely in the wrapper layer. The vendored `composeSystemPrompt` is NOT modified.

**Rationale:**
- Keeps `vendor/od-contracts/` byte-clean against upstream re-syncs (`scripts/vendor-sync.sh`), avoiding the Apache 2.0 §4(b) MODIFICATION-header burden on a file we expect to re-vendor.
- Easier to A/B with `designSystemMode: 'advisory'` / `'off'` — the toggle lives next to the injection point.
- Fallback path: if the upstream daemon ever sanitizes/truncates the system prompt, the same block can be prepended to the first user message with one-line change.

**Alternatives considered:**
1. **Edit vendored `composeSystemPrompt`** — rejected: drift risk on every `npm run vendor:sync`; harder to toggle off.
2. **Inject only into user message** — rejected: charter-class instructions belong in `system` channel; user-channel injection has been shown to be ignored more often on long generations (anecdotal across OpenAI / Anthropic providers).

### D4. Three-tier finding model for `od_lint_artifact` extension

When `designSystemHtml` is supplied, the lint tool emits findings with the following codes, in increasing severity:

- **DS001 — required style block missing** (`error`): the page is missing one of the three required `<style id="od-tokens|od-components|od-layout">` blocks. Hard fail.
- **DS002 — off-palette color** (`error`): a `style="…"` attribute or inline `<style>` introduces a color literal (`#rrggbb`, `rgb(…)`, `hsl(…)`) that does not resolve to a `--color-*` token in the manifest. Parsed via a small CSS value-walker.
- **DS003 — undocumented component class** (`warning`): a `<button>`, `<input>`, or `<a>` carries a `.btn-*` / `.input-*` class not present in the components catalog. Warning (not error) because legitimate one-off pages may need novel composition.
- **DS004 — new custom property** (`error`): the page declares a new `--color-*` or `--space-*` custom property not present in `:root` of the linked system.
- **DS005 — token drift** (`error`): the page's `<style id="od-tokens|od-components|od-layout">` content is not byte-identical to the system's. Indicates the model paraphrased instead of copying.

Escape hatch: any HTML comment `<!-- od-lint-ignore-next-line -->` immediately preceding an element SHALL suppress the next finding on that element.

**Rationale:** mirrors `eslint-plugin-*` conventions familiar to JavaScript developers; severity choices match what's strictly enforceable vs. context-dependent.

**Alternatives considered:**
1. **All findings as `error`** — rejected: false positives on legitimate composition (DS003) would block pages unnecessarily.
2. **Visual diff against rendered system** — rejected: requires a headless browser; out of scope for an MCP that aims to be `npm install`-deployable.

### D5. `designSystemMode: 'strict' | 'advisory' | 'off'` argument on `od_generate_design`

Default: `'strict'` when a system is linked; `'off'` when not. The mode controls how forcefully the contract block is worded:

- **strict** — "You MUST inline the three `<style>` blocks unchanged. You MUST NOT introduce new tokens or component classes. If a needed component is missing, emit `<!-- need: <component-name> -->` and stop that section." Lint is auto-applied with all DS findings as gating.
- **advisory** — "Prefer the documented tokens and components; deviations require justification." Lint findings are reported but not gating.
- **off** — contract block is not injected; equivalent to today's behavior even if a system is linked.

**Rationale:** users in exploration mode want softer guidance; users in production want hard gates. The three-mode toggle is well-precedented (e.g., TypeScript's `strict` family flags).

**Alternatives considered:**
1. **Boolean `enforceDesignSystem`** — rejected: insufficient resolution for the production-vs-exploration split.
2. **Per-finding-code mute list** — rejected: too granular for v0.17.

### D6. `od_extract_design_system` is a pure function exposed as a tool

The extractor parses `<style id="…">` and `<script type="application/json" id="od-design-system-manifest">` blocks via a small regex/HTML-walker (no `jsdom` dependency — adds 8 MB and we control the producer). It returns `{ manifest, tokensCss, componentsCss, layoutCss, version }` and is used internally by `od_generate_design` (for injection) and `od_lint_artifact` (for comparison). Exposed as a tool so agents can introspect a system without writing a custom parser.

**Rationale:** pure functions are trivially testable; reuse between two callers without duplicating parsing logic. Mirrors `od_compose_brief` which is also a no-network tool.

**Alternatives considered:**
1. **Use `node-html-parser`** — rejected: net dependency add for predictable, controlled input.
2. **Keep extraction internal-only** — rejected: agents already ask "what's in this system?" — exposing it saves them from reinventing the parser.

### D7. Manifest schema versioning

The JSON manifest carries a `"version": 1` field (number, integer). The MCP refuses to inject a manifest with a version it doesn't understand and the extractor surfaces the version in its return value. Future breaking changes to the manifest shape bump this integer.

**Rationale:** standard versioning hygiene. Cost: one integer field. Benefit: forward-compatible parsing without ambiguity.

**Alternatives considered:**
1. **Semver string** — rejected: overkill; a single integer covers the lifetime of this contract.
2. **No version field** — rejected: locks us in.

## Risks / Trade-offs

- **[Prompt budget pressure]** The contract block adds ~5–20 K input tokens per page. → **Mitigation:** the block is gzip-compressible (high redundancy with the page's own output); typical page generations are 30–60 K output tokens, so the proportional overhead is < 30 %. Measured during integration tests.
- **[Model drift on long generations]** A model under output-token pressure may abandon the contract mid-page. → **Mitigation:** lint catches it; the agent can retry with the failing selectors quoted. Strict mode's `<!-- need: ... -->` escape hatch gives the model a sanctioned exit valve instead of silent invention.
- **[Vendor sync drift]** A future upstream `composeSystemPrompt` change could break the injection-prepend assumption (e.g. they add `</system>` framing). → **Mitigation:** wrapper-injection is a single 10-line function; `scripts/vendor-check.sh` already gates re-syncs, and the integration test exercises the full prompt.
- **[Lint false positives on inline `<svg>` styles]** SVG `style` attributes use the same color literals as HTML and would trigger DS002. → **Mitigation:** the value-walker SHALL skip elements inside `<svg>` (documented in the lint rule spec).
- **[Two-step UX]** Users must now generate a system *before* pages. → **Mitigation:** (a) feature is opt-in — existing flow continues to work; (b) `od_generate_design_system` is callable with the same brand-spec/brief inputs as `od_generate_design`, so the friction is one extra round-trip, not a workflow redesign; (c) the `od-workflow` skill is updated to make this the recommended default.
- **[`designSystemId` ambiguity]** The field is a string and the daemon does not enforce that it points at an existing file. → **Mitigation:** the auto-inject path treats a missing file as `designSystemMode: 'off'` and emits a single advisory line in the tool result; no hard fail, no crash.

## Migration Plan

1. **v0.17.0 (this change):** all three new tools ship; existing tools gain optional args. Default behavior unchanged for any project without `designSystemId` set.
2. **Adoption path (per project, fully opt-in):**
   a. `od_generate_design_system` → produces `design-system.html`.
   b. `od_save_project_file` → persists it as `design-system.html` inside the project.
   c. `od_update_project` → sets `designSystemId: "design-system.html"`.
   d. From the next `od_generate_design` call onward, the contract is injected automatically in `'strict'` mode.
3. **Rollback:** unset `designSystemId` (or pass `designSystemMode: 'off'`) → behavior reverts to pre-v0.17 for that project. No data migration needed; the artifact file is left in place.
4. **v0.18 (planned, not in this change):**
   - `od_apply_design_system` — auto-repair near-miss colors / spacing / class names.
   - `od_regenerate_pages` — sweep `od_get_project.files` and rerun `od_generate_design` for each existing HTML file.

## Open Questions

1. **Lint severity for DS003 (undocumented component class)** — proposal is `warning`. Should production-strict users be able to elevate it to `error` via a finding-code override? Deferred to v0.18 if the need surfaces.
2. **Component gallery shape** — the `<body>` gallery is documented as "human-reviewable" but its precise structure (sections, headings) is intentionally left to the generator's discretion in v0.17. We may formalize a schema in v0.18 once we have real-world samples.
3. **Manifest field for breakpoints** — the spec mandates `tokens.breakpoints` but does not yet pin the unit (`px` vs the lighter-weight unitless integers). Decision deferred to the `od_generate_design_system` implementation task; both forms will pass DS001.

## Gates Triggered (per HARNESS.md)

- **Spec-driven development**: this change is gated through the OpenSpec proposal → design → specs → tasks pipeline (all four artifacts present).
- **Backward-compatible**: all changes to existing tool input schemas are additive optional fields; tool registration count goes 10 → 13 (new IDs only).
- **Vendor pristine**: `vendor/od-contracts/` untouched; verified by `scripts/vendor-check.sh` at CI time.
- **Lint + typecheck + unit + integration**: `npm run lint && npm run typecheck && npm test && npm run test:integration` must pass with `--max-warnings 0`.
