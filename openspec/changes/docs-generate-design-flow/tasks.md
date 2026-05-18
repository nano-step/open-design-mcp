# Tasks: docs-generate-design-flow

Lane:tiny × docs → single PR, self-verify, no Oracle gate.

## T-1: Write `docs/architecture/generate-design-flow.md`

Full reference doc with:

- Mermaid sequence diagram (8 actors: user, editor, MCP server, vendor composer, OD daemon, BYOK proxy, LLM)
- 8-phase narrative with file:line citations on every claim
- System prompt composition table (10 layers, sizes, conditions)
- Timing breakdown table
- Concrete PRD→HTML walkthrough example
- Known limitations section (no skill resolution yet, no conversation persistence, single-turn only, synchronous stream collection)

**Verify:** file exists; every `file:line` citation resolves on master; mermaid validates.

## T-2: Validate mermaid diagram

Run the `mermaid-validator` skill or equivalent: render the mermaid block in isolation, confirm no parse errors.

**Verify:** validator passes.

## T-3: Update README

Add new "How it works" section (between "Tools" and "Installation"):

- One-paragraph intro
- Condensed mermaid diagram (8-line version showing only major hops)
- Link to `docs/architecture/generate-design-flow.md` for the full reference

**Verify:** `grep -c "How it works\|generate-design-flow" README.md` ≥ 2.

## T-4: Validation ladder (clean env per HB-7)

Doc-only change — only lint + validate matters:

1. `npm run lint`
2. `npm run typecheck` (no-op for docs but confirm no accidental code edits)
3. `npm test`
4. `npm run build`
5. `bash scripts/vendor-check.sh`
6. `npm run test:integration`
7. `openspec validate docs-generate-design-flow --strict --no-interactive`

**Verify:** all 7 exit 0; test counts unchanged (142/166 unit + 23/24 integration depending on master).

## T-5: Self code-review

- Every file:line citation in the doc resolves on master
- No source code modified (diff vs master should show only `docs/`, `README.md`, `openspec/changes/`)
- Mermaid diagram parses
- Doc reads cleanly (no dangling references to TBD changes)

## T-6: Atomic commit

Single commit: `docs: add generate-design flow diagram + narrative`

## T-7: Push + PR + merge + archive

- Push branch `docs/generate-design-flow` as kokorolx
- Open PR referencing #30
- Wait CI green
- Squash-merge as kokorolx
- `openspec archive docs-generate-design-flow` (no spec deltas — docs-only)
