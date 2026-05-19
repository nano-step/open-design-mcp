---
name: open-design-mcp
description: Use this skill whenever the user mentions open-design, od_generate_design, OD daemon, BYOK design generation, generating HTML mockups from a PRD, creating or managing Open Design projects, saving design artifacts, linting generated HTML, or any of the 10 `od_*` MCP tools (od_list_projects, od_get_project, od_create_project, od_update_project, od_delete_project, od_save_artifact, od_save_project_file, od_lint_artifact, od_compose_brief, od_generate_design). Also trigger on phrases like "generate a design", "create a mockup", "make a landing page", "list my OD projects", "the design daemon", "the streaming design tool", and on any 401/404/422 error coming from an `od_*` tool call. Covers env-var setup (`OD_DAEMON_URL`, auth modes, BYOK), the full PRD → generate → save → lint workflow, error diagnosis, and the safety rails (lint before save, never commit BYOK keys). Triggers even if the user doesn't explicitly say "open-design-mcp" — keyword matches on `od_*` tool names or "design generation" workflows are enough.
compatibility: OpenCode (or any MCP client) with `open-design-mcp` installed and an Open Design daemon reachable at `OD_DAEMON_URL`.
---

# open-design-mcp

Skill for using the `open-design-mcp` server — an MCP wrapper around the [Open Design](https://github.com/nexu-io/open-design) daemon. Teaches an LLM how to pick the right tool, set the right env vars, and recover from common errors.

## Overview

`open-design-mcp` exposes **10 tools** that fall into 5 workflows:

| Workflow | Tools | When |
|---|---|---|
| **Read** | `od_list_projects`, `od_get_project` | Exploring what exists. Read-only. Safe by default. |
| **Manage** | `od_create_project`, `od_update_project`, `od_delete_project` | CRUD on projects. Delete is **permanent** — no undo. |
| **Format** | `od_compose_brief` | Pure helper — combines Turn-1 form answers + brand-spec + page brief into a Turn-3 prompt string. No network, no env vars. |
| **Validate** | `od_lint_artifact` | Cheap sanity-check on HTML before saving. |
| **Generate** | `od_generate_design`, `od_save_artifact`, `od_save_project_file` | Streams an HTML design from a PRD using a Bring-Your-Own-Key LLM, then persists it to the global artifact store (`od_save_artifact`) or inside a project (`od_save_project_file`). |

All tools require `OD_DAEMON_URL`. **Only `od_generate_design`** additionally needs BYOK env vars (`BYOK_BASE_URL`, `BYOK_API_KEY`, `BYOK_MODEL`). That asymmetry matters — see [references/environment-setup.md](references/environment-setup.md).

## When to Use This Skill

Trigger on any of these:

| User intent | Recognize from | First tool to call |
|---|---|---|
| "Show me my projects" | "list projects", "what designs exist", "show all OD projects" | `od_list_projects` |
| "Look at this project" | "get project X", "show artifacts for Y", "what's in this project" | `od_get_project` |
| "Make a new project" | "create project", "start a new design project" | `od_create_project` |
| "Rename / update project" | "change name", "update kind", "set fidelity to mid" | `od_update_project` |
| "Delete project" | "remove project", "delete X" — **confirm intent first** | `od_delete_project` |
| "Generate a design / mockup" | PRD provided + "make a design", "generate UI", "build a mockup" | `od_generate_design` |
| "Compose a multi-page brief" | User answered discovery questions + has a brand spec + wants per-page prompts | `od_compose_brief` (then pass result to `od_generate_design`) |
| "Save this HTML to a project" | "save inside the project", "show in OD viewer", "attach to project X" | `od_save_project_file` (after lint) |
| "Save this HTML globally" | "persist", "save artifact", "store this design", standalone shareable URL | `od_save_artifact` (after lint) |
| "Validate this HTML" | "lint", "check for issues", "is this valid?" | `od_lint_artifact` |
| Any `401`/`403`/`404`/`422` from an `od_*` tool | Error message contains "od_" or "Open Design" | See [references/errors.md](references/errors.md) |

## Tool Catalog

Descriptions are verbatim from `src/tools/*.ts` — do not paraphrase when responding to users.

| Tool | Description | Env vars required |
|---|---|---|
| `od_list_projects` | List all projects from the configured Open Design daemon. Read-only; requires only `OD_DAEMON_URL`. | `OD_DAEMON_URL` |
| `od_get_project` | Fetch a project + its artifact files. Read-only; requires only `OD_DAEMON_URL`. | `OD_DAEMON_URL` |
| `od_create_project` | Create a new project on the Open Design daemon. Returns the project details and an auto-seeded conversation ID. Requires only `OD_DAEMON_URL`. | `OD_DAEMON_URL` |
| `od_update_project` | Update a project on the Open Design daemon. At least one mutable field (name, customInstructions, kind, fidelity, linkedDirs) must be provided. Requires only `OD_DAEMON_URL`. | `OD_DAEMON_URL` |
| `od_delete_project` | **PERMANENTLY** delete a project. The Open Design daemon removes the database row AND the on-disk project directory. This cannot be undone. Requires only `OD_DAEMON_URL`. | `OD_DAEMON_URL` |
| `od_save_artifact` | Persist an HTML artifact to the daemon under a slug identifier. Writes to the **global** artifact store — NOT project-scoped. Requires only `OD_DAEMON_URL`. | `OD_DAEMON_URL` |
| `od_save_project_file` | Persist a file (typically HTML from `od_generate_design`) INSIDE a project so it appears in `od_get_project.files[]` and renders in the daemon UI. Wraps `POST /api/projects/:id/files`. Daemon limit: ~5 MB content. | `OD_DAEMON_URL` |
| `od_lint_artifact` | Validate an HTML artifact for structural issues. Returns text findings + optional agent message. | `OD_DAEMON_URL` |
| `od_compose_brief` | Format a Turn 3 prompt for `od_generate_design`. Combines Turn 1 form answers, Turn 2 brand-spec, and the page brief into a single string that upstream Open Design recognizes. Pure function: no network, no env vars. | none |
| `od_generate_design` | Generate a design artifact using BYOK. Composes the upstream Open Design system prompt and proxies through OD's `/api/proxy/<provider>/stream` endpoint. Requires `BYOK_BASE_URL`, `BYOK_API_KEY`, `BYOK_MODEL` env vars in addition to `OD_DAEMON_URL`. | `OD_DAEMON_URL` + `BYOK_*` |

## Core Workflows

### Workflow 1 — Explore (read-only, safe)

```
od_list_projects                 # see what exists
  → pick a project id
od_get_project {id}              # get details + artifact list
```

No BYOK needed. Use this any time the user asks "what's in OD?" before doing any writes.

### Workflow 2 — Create and manage

```
od_create_project {              # body: name + kind required
  name: "Pricing page",
  kind: "prototype",             # one of: prototype | deck | template | image | doc | research | site
  fidelity: "mid"                # one of: low | mid | high
}
  → returns project id + auto-seeded conversationId

od_update_project {id, name: "...", customInstructions: "..."}   # partial update

od_delete_project {id}           # PERMANENT — always confirm with user first
```

**The `customInstructions` field** is how you bake design preferences ("dark mode", "rounded corners", "Tailwind v4") into all future generations on this project. Set it once on create or update — `od_generate_design` reads it.

### Workflow 3 — Generate, lint, save (the main event)

This is the workflow most users actually want. Order matters:

```
1. (optional) od_create_project    # if no existing project
2. od_generate_design {            # the streaming one — takes 10–60s
     projectId: "...",
     prompt: "<the PRD or refinement instruction>",
     kind: "prototype"             # match the project's kind
   }
   → returns { html: "<!doctype html>..." }   # full HTML string

3. od_lint_artifact { html }       # CHEAP — always do this before saving
   → returns findings; if any are "error" severity, fix and regenerate

4. Save the result — pick ONE based on where you want the file to live:

   **Option A — global artifact store** (standalone, shareable URL):
   od_save_artifact {
     identifier: "pricing-v1",     # URL-safe slug, /^[a-z0-9-]+$/, 3–64 chars
     title: "Pricing Page v1",     # human-readable, 1–200 chars
     html
   }
   → returns saved path + URL under /app/.od/artifacts/<timestamp>-<identifier>/

   **Option B — inside the project** (appears in od_get_project.files[], renders in daemon UI):
   od_save_project_file {
     projectId,                    # the project you created in step 1
     name: "index.html",           # no path separators, 1–255 chars
     content: html                 # max ~5 MB
   }
   → file shows up in the project's viewer at /api/projects/<id>/files/<name>
```

**Why lint before save:** Saving bad HTML costs nothing technically, but linting catches malformed `<head>` or missing `<!doctype>` *before* you tell the user "done" — much better UX than silently shipping broken artifacts.

**`od_save_artifact` vs `od_save_project_file`:** Different storage scopes, not interchangeable. `od_save_artifact` writes to the daemon's **global** store (project-unaware) and is right when you want a standalone shareable URL. `od_save_project_file` writes inside a project's directory so it appears in `od_get_project.files[]` and renders under the project's UI. Use the project-scoped one when the design is meant to live with the project.

**Streaming progress:** `od_generate_design` emits MCP progress notifications every ~25 events. If you're driving from an LLM that exposes those, surface them to the user — generation can take a full minute and silent waits feel broken. See [references/byok-providers.md](references/byok-providers.md) for timeout tuning.

### Workflow 4 — Iterate on a broken artifact

```
od_get_project {id}                # find existing artifact slug
  → read current html via the artifact list

od_generate_design {               # pass a refinement prompt
  projectId,
  prompt: "Fix the broken nav: it should be sticky and use the project's brand colors",
  kind: "prototype"
}
  → returns new html

od_lint_artifact { html }

# Save with the SAME identifier (od_save_artifact) or SAME name (od_save_project_file)
# as last time — both are upsert / last-writer-wins on their respective key.
od_save_artifact { identifier: "pricing-v1", title: "Pricing Page v1", html }
# OR
od_save_project_file { projectId, name: "index.html", content: html }
```

`od_save_artifact` is upsert-by-`identifier` — same identifier overwrites (with a fresh `<timestamp>-<identifier>` directory). `od_save_project_file` is upsert-by-`name` within the project — same name overwrites in place.

See [references/workflows.md](references/workflows.md) for fully worked examples with sample tool args.

## Anti-Patterns

These all look reasonable and waste real time. Avoid them.

| Don't | Why | Do instead |
|---|---|---|
| Set `BYOK_API_KEY` in committed config or `.env` checked into git | Secrets leak. The proxy URL also identifies your provider account. | Export in shell session only, or use a secret manager. The `.gitignore` doesn't catch every variant of `.env`. |
| Call `od_generate_design` before checking `OD_DAEMON_URL` reaches the daemon | Generation fails 30s in with a confusing error after streaming has already started. | `od_list_projects` first — it's a 50ms smoke test. |
| Pick auth mode manually when you don't know the daemon's setup | Mode-aware 401 hints will tell you. | Leave `OD_AUTH_MODE` unset — `src/config.ts` infers from which creds you set. Only override when inference is wrong. |
| Skip `od_lint_artifact` because "the LLM produced HTML so it must be valid" | LLM output frequently misses `<!doctype>`, has unclosed tags, or wraps the doc in markdown fences. | Always lint before save. Two extra seconds, prevents broken artifacts. |
| Use `od_delete_project` to "clean up test data" without confirming | Daemon removes DB row AND filesystem dir. No undo. | Always show the user the project name + id and ask "delete this permanently? (y/n)" before calling. |
| Pass a huge PRD as `prompt` and hope for the best | Generation is single-turn, no conversation memory. Long prompts get truncated or produce muddled output. | Set persistent design preferences via `od_update_project { customInstructions }`, then send focused page-specific prompts. |
| Ignore `OD_API_TOKEN` errors on hosted OD | Hosted OD almost always sits behind nginx basic auth — `OD_API_TOKEN` (bearer) is the wrong mode. | Use `OD_AUTH_MODE=basic` + `OD_BASIC_USER` + `OD_BASIC_PASS`. See [references/environment-setup.md](references/environment-setup.md). |
| Treat `od_generate_design` streaming output as "almost done" | The HTTP request stays open the whole time — abort kills the generation. | Wait for the tool result. Don't issue a follow-up tool call until `od_generate_design` returns. |
| Ask the user "what's your `OD_DAEMON_URL`?" before trying anything | The user already configured env vars in their MCP client's `env` block — re-asking is friction. | Just call the tool. The error message will tell you exactly what's missing (`OD_DAEMON_URL` errors fail at server startup, not at call-time). |
| Try to point a single tool call at a different daemon ("just this one, hit the hosted URL") | `OD_DAEMON_URL` is read **once at server startup** from the MCP client's `env` block ([#49](https://github.com/nano-step/open-design-mcp/issues/49)). There is no per-call override and no tool accepts a `daemonUrl` arg. Trying to override mid-session wastes time. | Register **two MCP server entries** in `~/.config/opencode/opencode.json` (or your client's equivalent) — e.g. `open-design-local` (env → `http://ai-open-design:7456`) and `open-design-hosted` (env → `https://od.thnkandgrow.com/` + basic auth). Pick which one to call from the tool name prefix. See [references/environment-setup.md](references/environment-setup.md) §"Running against multiple daemons". |

## Quick Start

Minimal setup for local Docker OD (no auth):

```bash
export OD_DAEMON_URL="http://localhost:7456"
# That's it. od_list_projects works now.
```

Adding BYOK so `od_generate_design` works:

```bash
export BYOK_BASE_URL="https://api.openai.com/v1"          # or your proxy
export BYOK_API_KEY="sk-..."
export BYOK_MODEL="gpt-4o-mini"                            # or "claude-sonnet-4-6", etc.
export BYOK_PROVIDER="openai"                              # default; one of: openai | anthropic | azure | google | ollama
```

Hosted OD behind basic auth:

```bash
export OD_DAEMON_URL="https://od.example.com"
export OD_AUTH_MODE="basic"
export OD_BASIC_USER="..."
export OD_BASIC_PASS="..."
# + BYOK_* as above for generation
```

Verification (does NOT need BYOK):

```
Call od_list_projects with no args.
  → If it returns projects (even empty array): daemon connection works.
  → If it returns 401: see references/errors.md
  → If it returns ECONNREFUSED: daemon isn't running at OD_DAEMON_URL.
```

## References (load on demand)

- **[references/environment-setup.md](references/environment-setup.md)** — full env-var matrix, auth-mode auto-inference, eager-vs-lazy validation order. Read this when the user asks "how do I configure" or hits any setup error.
- **[references/byok-providers.md](references/byok-providers.md)** — per-provider config for openai/anthropic/azure/google/ollama, proxy patterns, timeout tuning. Read this when the user mentions a specific LLM provider or asks about cost/speed.
- **[references/workflows.md](references/workflows.md)** — three end-to-end walkthroughs with full tool args. Read this when the user wants a worked example.
- **[references/errors.md](references/errors.md)** — error-to-fix table for 401/404/422/BYOK-lazy/timeout/connection-refused. Read this on any tool-call failure.

## Related Documentation

- Repo `README.md` — human-facing tool list + installation
- `docs/architecture/generate-design-flow.md` — deep technical reference (8-phase sequence diagram, system-prompt composition stack) for contributors. Surface to users only if they want internals.
- Upstream Open Design: <https://github.com/nexu-io/open-design>
