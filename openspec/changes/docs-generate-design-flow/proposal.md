# Proposal: docs-generate-design-flow

**Lane × Change Type:** `lane:tiny × change-type:docs`
**Risk Flags:** 0 (doc-only)
**Issue:** [#30](https://github.com/nano-step/open-design-mcp/issues/30)

## Why

`open-design-mcp@0.11.1` has 8 working tools and full hosted-OD support, but newcomers (humans and LLMs alike) can't easily answer:

- "What happens between my prompt and the HTML output?"
- "Does the OD daemon recompose the prompt, or am I doing that locally?"
- "Why is `kind: 'prototype'` different from `kind: 'deck'`?"
- "How long should I expect this to take?"

This knowledge lives in `composeSystemPrompt()` source, byok-pipeline-tool design.md, and the daemon's `chat-routes.ts:791-885` — but no single doc surfaces it. A reader trying to evaluate the tool, or an LLM trying to use it well, has no entry point.

## What Changes

Pure documentation. Two artifacts:

### 1. `docs/architecture/generate-design-flow.md` — full reference

Sequence diagram (mermaid) + 8-phase narrative + concrete PRD→HTML example, with every claim backed by a `file:line` citation. Covers:

- Stdio handshake (server.ts)
- Input validation + lazy BYOK config (generate-design.ts, config.ts)
- System prompt composition stack (composeSystemPrompt at vendor/od-contracts/...)
- Proxy body construction + AbortSignal composition
- HTTP to OD daemon (od-client.ts proxyStream)
- Daemon as pass-through proxy (upstream chat-routes.ts)
- SSE streaming + progress notifications (sse-parser.ts, generate-design.ts)
- Result composition + return path

Plus a timing breakdown table and known limitations.

### 2. README "How it works" section

One-paragraph intro + 8-line mermaid + link to the full doc. Lives between the "Tools" section and "Installation".

## Out of scope

- Diagrams for the other 7 tools (read tools are trivial, write tools follow the same shape)
- Changes to any source code
- Updates to canonical specs (no behavior change to spec)
- Translation / localization

## Risk

**tiny.** Doc-only change. No source modification, no API surface change, no test changes. The mermaid diagram is validated via the `mermaid-validator` skill before commit so PRs don't break renderers.
