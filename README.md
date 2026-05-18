# open-design-mcp

A stdio [Model Context Protocol](https://modelcontextprotocol.io/) server that bridges coding agents (OpenCode, Claude Code, Cursor, Zed) to a running [Open Design](https://github.com/nexu-io/open-design) daemon — so you can list projects, fetch artifacts, and (in upcoming releases) generate full design artifacts via BYOK from inside your editor.

## Status

**v0.7.0 — 8 MCP tools live.** The server activates the full Open Design feature surface: list/inspect projects, save and lint artifacts, and generate designs via BYOK with the full upstream system-prompt fidelity. See [open OpenSpec changes](openspec/changes/) for in-flight work and [closed changes](openspec/changes/archive/) for historical decisions.

## Tools

| Tool | Verb | Env vars required | Description |
|---|---|---|---|
| `od_list_projects` | read | `OD_DAEMON_URL` | List all projects from the OD daemon. Returns `{projects: [{id, name, kind?, status?}, …]}`. |
| `od_get_project` | read | `OD_DAEMON_URL` | Fetch a project + its artifact files. Merges `GET /api/projects/:id` and `GET /api/projects/:id/files`. |
| `od_create_project` | write | `OD_DAEMON_URL` | Create a new project. Returns the project details and an auto-seeded conversation ID. |
| `od_update_project` | write | `OD_DAEMON_URL` | Update a project's name, custom instructions, or metadata. At least one mutable field is required. |
| `od_delete_project` | write | `OD_DAEMON_URL` | PERMANENTLY delete a project (database row + on-disk directory). Cannot be undone. |
| `od_save_artifact` | write | `OD_DAEMON_URL` | Persist an HTML artifact under a URL-safe slug. Returns the saved path + URL. |
| `od_lint_artifact` | validate | `OD_DAEMON_URL` | Validate an HTML artifact structurally. Returns findings + agent message. |
| `od_generate_design` | generate (streaming) | `OD_DAEMON_URL` + `BYOK_BASE_URL` + `BYOK_API_KEY` + `BYOK_MODEL` (`BYOK_PROVIDER` optional, defaults to `openai`) | Generate a design via the BYOK pipeline. Composes the upstream Open Design system prompt and proxies through the OD daemon's `/api/proxy/<provider>/stream`. Returns the accumulated text. |

Only `od_generate_design` requires the BYOK vars. The other 7 tools work with just `OD_DAEMON_URL`.

## How it works

When you invoke `od_generate_design` with a PRD-style prompt, the MCP server composes a ~20–50 KB system prompt locally (vendored `composeSystemPrompt` injects designer charter + `kind`-specific rules), then POSTs to the OD daemon's `/api/proxy/<provider>/stream` endpoint. The daemon is a thin pass-through proxy — it forwards to your BYOK provider, transcodes the upstream stream into its own SSE format, and streams tokens back. The MCP server accumulates deltas and emits `notifications/progress` every 25 tokens (only when the client supplied a `progressToken`, per MCP spec).

**Typical timing:** ~10 seconds for small sections (single hero, paragraph rewrite); 1–5 minutes for full pages; up to 10 minutes for complex multi-section designs. Server timeout defaults to 10 minutes (`OD_GENERATE_TIMEOUT_MS`, configurable). On abort or timeout mid-stream, accumulated tokens are returned as partial HTML with a trailing `<!-- Generation timed out... -->` comment marker and `isError: true` — pair with `od_save_artifact` to checkpoint partial progress.

Full reference with file:line citations: [`docs/architecture/generate-design-flow.md`](./docs/architecture/generate-design-flow.md).

```mermaid
sequenceDiagram
    autonumber
    participant E as Editor
    participant M as open-design-mcp
    participant D as OD daemon
    participant P as BYOK proxy
    E->>M: tools/call od_generate_design
    M->>M: composeSystemPrompt + lazy BYOK load
    M->>D: POST /api/proxy/openai/stream
    D->>P: POST /chat/completions stream true
    loop SSE tokens
        P-->>D: delta
        D-->>M: event delta
    end
    M-->>E: tool result HTML
```

## Installation

Add the following entry to your MCP client config (OpenCode / Claude Code / Cursor / Zed):

```jsonc
{
  "mcp": {
    "open-design": {
      "command": "npx",
      "args": ["-y", "open-design-mcp"],
      "env": {
        // Pick the line that matches your deployment (see "Choosing OD_DAEMON_URL" below)
        "OD_DAEMON_URL": "http://ai-open-design:7456",
        "OD_API_TOKEN": "",                            // optional; bearer token if your daemon requires it
        // BYOK vars — only needed if you call od_generate_design
        "BYOK_BASE_URL": "https://your-ai-proxy.example.com/v1",
        "BYOK_API_KEY": "<provider-api-key>",
        "BYOK_MODEL": "open-design",
        "BYOK_PROVIDER": "openai"                      // optional; one of openai/anthropic/azure/google/ollama
      }
    }
  }
}
```

The server boots successfully with **only `OD_DAEMON_URL` set** — the BYOK vars are validated lazily when `od_generate_design` is invoked. This lets users explore via `od_list_projects` / `od_get_project` before wiring an AI provider.

## Choosing `OD_DAEMON_URL`

The right value depends on where the Open Design daemon is running **relative to the MCP server** (which itself runs wherever your coding agent spawns it):

| Your setup | `OD_DAEMON_URL` |
|---|---|
| MCP server + OD daemon both run as containers on a shared Docker network (e.g. via [`ai-sandbox-wrapper`](https://github.com/kokorolx/ai-sandbox-wrapper) with `--network ai-sandbox`) — **most common** | `http://ai-open-design:7456` |
| MCP server runs inside a Docker container, OD daemon runs natively on the host (exposed on host port `7456`) | `http://host.docker.internal:7456` (macOS / Windows Docker Desktop)<br>`http://172.17.0.1:7456` (Linux bridge gateway) |
| MCP server and OD daemon both run natively on the host (no Docker) | `http://localhost:7456` |
| OD container started via `ai-run open-design start --expose --port N` to host port `N` | `http://host.docker.internal:N` (from inside another container)<br>`http://localhost:N` (from host) |

**Quick diagnostic** (run from the environment where the MCP server will spawn):

```bash
curl -fsS http://ai-open-design:7456/ && echo " OK"          # shared docker network
curl -fsS http://host.docker.internal:7456/ && echo " OK"    # host gateway
curl -fsS http://localhost:7456/ && echo " OK"               # native
```

Whichever one returns `200` is your correct `OD_DAEMON_URL`.

## Environment Variables

| Variable | Purpose | Required by | Default |
|---|---|---|---|
| `OD_DAEMON_URL` | Open Design daemon base URL — **see [Choosing `OD_DAEMON_URL`](#choosing-od_daemon_url) above** | **all tools** (validated eagerly at startup) | — |
| `OD_API_TOKEN` | Bearer token the OD daemon enforces when bound to non-loopback | optional | `""` (no auth header sent) |
| `OD_AUTH_MODE` | Auth mode: `none`, `bearer`, or `basic`. Auto-derived if unset (token set → `bearer`; basic creds set → `basic`; neither → `none`) | optional | inferred |
| `OD_BASIC_USER` | HTTP Basic Auth username | `OD_AUTH_MODE=basic` | — |
| `OD_BASIC_PASS` | HTTP Basic Auth password | `OD_AUTH_MODE=basic` | — |
| `OD_GENERATE_TIMEOUT_MS` | Server-side timeout for `od_generate_design`, in milliseconds. Raised from the previous 120s after [#33](https://github.com/nano-step/open-design-mcp/issues/33) confirmed full-page generations legitimately exceed it. | optional | `600000` (10 min) |
| `BYOK_BASE_URL` | OpenAI-compatible AI provider base URL | `od_generate_design` only (validated lazily) | — |
| `BYOK_API_KEY` | Provider API key forwarded via OD's `/api/proxy/*/stream` | `od_generate_design` only | — |
| `BYOK_MODEL` | Model id (e.g. `open-design`, `claude-sonnet-4-6`) | `od_generate_design` only | — |
| `BYOK_PROVIDER` | One of `openai` / `anthropic` / `azure` / `google` / `ollama` | optional | `openai` |

The server fails fast with a clear stderr message if `OD_DAEMON_URL` is missing or invalid. BYOK vars are checked only when `od_generate_design` is called — a missing var yields a friendly tool-level error (`isError: true`, text `"BYOK not configured: missing ..."`), never a crash.

### Hosted Open Design deployment (HTTP Basic Auth)

If the OD daemon is behind a reverse proxy with HTTP Basic Auth (e.g. the publicly-hosted instance at `https://od.thnkandgrow.com/`), set `OD_AUTH_MODE=basic` with the matching credentials:

```jsonc
{
  "mcp": {
    "open-design": {
      "command": "npx",
      "args": ["-y", "open-design-mcp"],
      "env": {
        "OD_DAEMON_URL": "https://od.thnkandgrow.com/",
        "OD_AUTH_MODE": "basic",
        "OD_BASIC_USER": "<your-username>",
        "OD_BASIC_PASS": "<your-password>"
      }
    }
  }
}
```

The server emits `Authorization: Basic <base64(user:pass)>` on every request to the OD daemon. Embedded credentials in the URL (`https://user:pass@host/`) are rejected at startup — use the env vars instead.

## Development

```bash
nvm use            # picks Node 20 per .nvmrc
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration   # spawns dist/src/server.js, mocks the OD daemon, exercises all 8 tools
```

The engineering harness ([`docs/HARNESS.md`](docs/HARNESS.md)) requires every feature, fix, or refactor to go through an OpenSpec proposal → deep-design → specs → implement → validate → review → PR → archive cycle. See [`docs/stories/`](docs/stories/) for in-flight stories.

## Vendored Dependencies

This project vendors a subset of source from [`nexu-io/open-design`](https://github.com/nexu-io/open-design) (Apache License 2.0) so we can compose the same `systemPrompt` the Open Design web UI builds for its BYOK chat turns — without depending on the upstream's private `@open-design/contracts` package.

| Path | Upstream | License | Notes |
|---|---|---|---|
| `vendor/od-contracts/` | [`nexu-io/open-design`](https://github.com/nexu-io/open-design) `packages/contracts/src/` | Apache-2.0 | 13 files (7 runtime + 6 type-only). Pinned commit + re-sync instructions in [`vendor/od-contracts/VENDORED_FROM.md`](vendor/od-contracts/VENDORED_FROM.md). Sync script at [`scripts/vendor-sync.sh`](scripts/vendor-sync.sh). |

**License compliance:**

- A copy of the upstream LICENSE travels in [`vendor/od-contracts/LICENSE`](vendor/od-contracts/LICENSE) (§4(a)).
- Modifications to vendored files (if any) carry a `MODIFICATION` header per Apache 2.0 §4(b); see [`vendor/od-contracts/VENDORED_FROM.md`](vendor/od-contracts/VENDORED_FROM.md) Modifications section for the running log.
- Original upstream copyright notices in each vendored file are retained verbatim (§4(c)).
- Attribution is in [`vendor/od-contracts/NOTICE`](vendor/od-contracts/NOTICE) and referenced from the top-level [`NOTICE`](NOTICE) (§4(d)).

All vendored code is redistributed under the same Apache License 2.0.

## License

Apache License 2.0. See [`LICENSE`](LICENSE) for the full text and [`NOTICE`](NOTICE) for attribution.

Copyright (c) 2026 kokorolx <kokoro.lehoang@gmail.com>.
