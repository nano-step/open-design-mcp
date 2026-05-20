## 1. Types and schemas

- [x] 1.1 Create `src/types/design-system.ts` with Zod schemas for `Tokens`, `ComponentVariant`, `LayoutPrimitive`, and `DesignSystemManifest` (version literal `1`); include a parsed-document type `ExtractedDesignSystem = { manifest, tokensCss, componentsCss, layoutCss, version }`
- [x] 1.2 Unit tests for the manifest schema: accept v1, reject v2, reject missing `tokens.colors`, reject invalid `tokens.unit`

## 2. Shared extractor (pure)

- [x] 2.1 Implement `extractDesignSystem(html: string): ExtractedDesignSystem` in `src/tools/extract-design-system.ts` — pure function, no dependencies beyond `zod`; walks `<style id="…">` and `<script type="application/json" id="…">` slots via narrow regex/string scan (no `jsdom` dependency)
- [x] 2.2 Validate `<html data-od-artifact="design-system">` marker and the `data-od-version` integer; throw a typed error naming the missing/wrong slot
- [x] 2.3 Unit tests: happy path, missing each of the three style blocks, missing manifest script, wrong artifact marker, malformed JSON, byte-identical CSS round-trip (no normalization)

## 3. `od_extract_design_system` tool

- [x] 3.1 Implement `src/tools/extract-design-system.ts` MCP wrapper around the pure extractor; Zod input `{ html: string }`; output structuredContent matches `ExtractedDesignSystem`
- [x] 3.2 Register the tool in `src/tools/index.ts`
- [x] 3.3 Unit tests: tool registration shape, error mapping (extractor throws → `isError: true` with named slot)

## 4. `od_generate_design_system` tool

- [x] 4.1 Create the DESIGN-SYSTEM charter prompt as an exported constant in `src/tools/generate-design-system.ts` (separate from the page-design charter); it MUST instruct the model to emit the four marker slots
- [x] 4.2 Implement the handler mirroring `od_generate_design`'s BYOK pipeline (`composeSystemPrompt` is NOT used for this tool — we build the system prompt locally) with the same timeout, abort, progress-notification, and SSE-parsing behavior
- [x] 4.3 After stream completes, run the extractor against the accumulated text; on extraction failure, set `isError: true` and append a second `text` content item listing the missing slots
- [x] 4.4 Zod input schema: `{ prompt, projectId?, briefAnswers?, brandSpec?, maxTokens=64000 }`; reuse the maxTokens validation from `od_generate_design`
- [x] 4.5 Register the tool in `src/tools/index.ts`
- [x] 4.6 Unit tests: charter contains the four-slot requirement, BYOK-not-configured friendly error, extractor failure path, maxTokens forwarded verbatim

## 5. `od_update_design_system` tool

- [x] 5.1 Implement `src/tools/update-design-system.ts` with two modes via discriminated union: `{ mode: "semantic", instruction }` (BYOK) and `{ mode: "delta", patch }` (deterministic deep-merge against the parsed manifest)
- [x] 5.2 Implement a small `bumpVersion(html: string): string` helper that rewrites the `data-od-version` attribute on `<html>` by +1
- [x] 5.3 Semantic mode: send existing manifest + instruction through BYOK, re-extract the result, bump version, return
- [x] 5.4 Delta mode: deep-merge the patch into the parsed manifest, re-validate via the v1 schema, regenerate `<style id="od-tokens">` from the merged manifest, splice back into the HTML, bump version
- [x] 5.5 Register in `src/tools/index.ts`
- [x] 5.6 Unit tests: semantic happy path (mock BYOK), delta happy path with primary color change, delta with invalid unit rejected, version bump verified

## 6. Auto-injection branch in `od_generate_design`

- [x] 6.1 Add optional `designSystemMode: z.enum(['strict','advisory','off']).optional()` to the Zod input schema in `src/tools/generate-design.ts`
- [x] 6.2 In the handler, after fetching the project for `customInstructions` (line ~129), also branch on `project.designSystemId`: fetch the file via the project files endpoint, run the shared extractor; on failure, set effective mode to `'off'` and prepend an advisory line to the eventual tool result
- [x] 6.3 Resolve effective mode: if argument supplied use it; else if system extracted use `'strict'`; else `'off'`
- [x] 6.4 Implement `buildDesignSystemContract(extracted, mode): string` returning the literal `### Design System Contract (strict|advisory)` block per the tools spec; include manifest + the three CSS bodies verbatim
- [x] 6.5 When mode != `'off'`, prepend the block to the `systemPrompt` returned by `composeSystemPrompt` (wrapper-injection — do NOT touch `vendor/od-contracts/`)
- [x] 6.6 Unit tests: strict wording assertions, advisory wording assertions, off mode skips injection entirely, missing linked file degrades to advisory tool-result line, system prompt remains byte-identical to baseline when no system is linked
- [x] 6.7 Verify `npm run vendor:check` still passes (vendored sources untouched)

## 7. `od_lint_artifact` design-system extensions

- [x] 7.1 Add optional `designSystemHtml: z.string().optional()` to the Zod input schema in `src/tools/lint-artifact.ts`
- [x] 7.2 Implement a `runDesignSystemLint(pageHtml, extracted): Finding[]` module that emits DS001–DS005 per the tools spec; SVG-skip rule for DS002
- [x] 7.3 Implement the `<!-- od-lint-ignore-next-line -->` suppression: scan the page HTML, mark the next element after each marker, drop matching findings whose source-range overlaps a marked element
- [x] 7.4 Merge DS findings into the existing lint result; preserve existing finding shape (no breaking output schema change)
- [x] 7.5 Unit tests: one positive + one negative scenario per finding code (DS001–DS005), SVG color skip, ignore-next-line suppression, omitting `designSystemHtml` yields byte-identical pre-v0.17 output

## 8. `od_compose_brief` design-system summary field

- [x] 8.1 Add optional `designSystemSummary: z.string().optional()` to the Zod input schema in `src/tools/compose-brief.ts`
- [x] 8.2 When supplied, insert a `### Design System` section (heading + verbatim body) between the brand-spec section and the page-prompt section
- [x] 8.3 Unit tests: section ordering, omission yields byte-identical pre-v0.17 output, summary is inserted verbatim (no escaping)

## 9. Server bootstrap + tool count

- [x] 9.1 Update the tool-count assertion in `src/server.ts` (and any related integration test fixtures) from 10 → 13
- [x] 9.2 Verify `tools/list` returns exactly the new 13 tool IDs in the integration test
- [x] 9.3 Confirm tool descriptions: each of the three new tools' description fields cross-reference the design-system workflow

## 10. Integration tests

- [ ] 10.1 Add integration scenario: mock OD daemon, mock BYOK upstream → call `od_generate_design_system` → assert output passes the extractor (DEFERRED — requires BYOK mock in integration harness)
- [ ] 10.2 Add integration scenario: save the generated system via `od_save_project_file`, link via `od_update_project`, call `od_generate_design` → assert the BYOK proxy POST body contains the Design System Contract block (DEFERRED — requires BYOK mock + file content API)
- [ ] 10.3 Add integration scenario: lint a deliberately off-palette page against a linked system → assert DS002 finding present (DEFERRED — DS lint is unit-tested; integration test adds daemon round-trip)
- [ ] 10.4 Add integration scenario: `od_update_design_system` in delta mode → re-extract → version bumped, primary color changed, all four slots intact (DEFERRED — delta mode is unit-tested)

## 11. Documentation

- [x] 11.1 README.md: add three rows to the tool table (one per new tool); add a "Design-System-First Workflow" section after "How it works" with the four-step opt-in path
- [x] 11.2 README.md: add `designSystemMode` and `designSystemHtml` to the relevant tool entries; clarify the `designSystemId` convention (filename of a project file)
- [x] 11.3 `.opencode/skills/open-design-mcp/SKILL.md`: append three tool entries
- [x] 11.4 `.opencode/skills/od-workflow/SKILL.md`: update the multi-page workflow to make `od_generate_design_system` the recommended first step; add a note that single-page tweaks can still skip it
- [x] 11.5 `CHANGELOG.md`: add a v0.17.0 entry explicitly stating the workflow is opt-in and lists the three new tools + two backward-compatible argument additions

## 12. Validation

- [x] 12.1 `npm run lint` passes with `--max-warnings 0`
- [x] 12.2 `npm run typecheck` passes
- [x] 12.3 `npm test` passes (unit tests)
- [x] 12.4 `npm run test:integration` passes
- [x] 12.5 `npm run vendor:check` passes (vendor pristine)
- [x] 12.6 `openspec validate "add-design-system-workflow" --strict --no-interactive` passes
- [ ] 12.7 Manual smoke: generate a system, link it, generate a page, lint the page → strict mode produces a contract-conforming page with zero DS findings (DEFERRED — requires running daemon + BYOK provider)
