# BYOK Providers

Bring-Your-Own-Key configuration for `od_generate_design`. Lazy validation, four supported providers.

## What "BYOK" Means Here

`od_generate_design` doesn't call any LLM API directly. Instead it:

1. Locally composes a system prompt (~20–50 KB) via the vendored `composeSystemPrompt`
2. POSTs the composed prompt + user prompt to the OD daemon's `/api/proxy/<provider>/stream` endpoint
3. The daemon forwards to your BYOK provider (using `BYOK_BASE_URL` + `BYOK_API_KEY`)
4. The daemon transcodes the provider's stream into its own SSE format and streams back

You bring the keys; the daemon brokers the request. Your API key never touches `node_modules` or this MCP's process memory beyond a single fetch — it's forwarded verbatim in the `Authorization` header of the proxy POST.

## Required Variables (Validated Lazily)

These are checked only when `od_generate_design` is invoked (`src/config.ts:150`). Missing vars produce a friendly tool error, not a server crash.

| Variable | Type | Example values |
|---|---|---|
| `BYOK_BASE_URL` | URL (https://) | `https://api.openai.com/v1`, `https://api.anthropic.com`, `https://your-proxy.com/v1` |
| `BYOK_API_KEY` | non-empty string | `sk-...`, `sk-ant-...`, custom-proxy-key |
| `BYOK_MODEL` | non-empty string | `gpt-4o`, `claude-sonnet-4-6`, `open-design` (when using a routing proxy) |
| `BYOK_PROVIDER` | enum (optional, default `openai`) | `openai` \| `anthropic` \| `azure` \| `google` \| `ollama` |

The `BYOK_PROVIDER` value picks which subpath of `/api/proxy/<provider>/stream` to hit. Most users want `openai` (the default) because their proxy is OpenAI-compatible.

## Per-Provider Configs

### OpenAI (direct)

```bash
export BYOK_BASE_URL="https://api.openai.com/v1"
export BYOK_API_KEY="sk-..."
export BYOK_MODEL="gpt-4o"
export BYOK_PROVIDER="openai"     # default; can omit
```

### Anthropic (direct)

```bash
export BYOK_BASE_URL="https://api.anthropic.com"
export BYOK_API_KEY="sk-ant-..."
export BYOK_MODEL="claude-sonnet-4-6"
export BYOK_PROVIDER="anthropic"
```

### Routing Proxy (OpenAI-compatible — the common pattern)

Many users run a proxy (e.g. `ai-proxy`, OpenRouter, LiteLLM) that speaks OpenAI's protocol but routes to multiple upstream providers based on the `BYOK_MODEL` name:

```bash
export BYOK_BASE_URL="https://your-ai-proxy.example.com/v1"
export BYOK_API_KEY="<proxy-issued-key>"
export BYOK_MODEL="open-design"        # proxy resolves this to e.g. claude-sonnet-4-6
export BYOK_PROVIDER="openai"          # use openai protocol even though upstream may be anthropic
```

### Azure OpenAI

```bash
export BYOK_BASE_URL="https://<your-resource>.openai.azure.com/openai/deployments/<deployment-id>"
export BYOK_API_KEY="<azure-key>"
export BYOK_MODEL="<deployment-id>"
export BYOK_PROVIDER="azure"
```

### Google (Gemini)

```bash
export BYOK_BASE_URL="https://generativelanguage.googleapis.com/v1beta"
export BYOK_API_KEY="<google-api-key>"
export BYOK_MODEL="gemini-2.0-flash"
export BYOK_PROVIDER="google"
```

### Ollama (local)

```bash
export BYOK_BASE_URL="http://localhost:11434"
export BYOK_API_KEY="ollama"           # ollama doesn't validate; any non-empty string works
export BYOK_MODEL="llama3.2"
export BYOK_PROVIDER="ollama"
```

## Streaming Behavior

`od_generate_design` is the only streaming tool. Key timing facts:

- **Typical end-to-end:** ~10 seconds for small sections (single hero, paragraph rewrite); 1–5 minutes for full pages; up to 10 minutes for complex multi-section designs (`kind: "deck"`, `kind: "site"`).
- **Default server timeout:** 600,000 ms (10 min) — configurable via `OD_GENERATE_TIMEOUT_MS`. Raised from 120s after issue [#33](https://github.com/nano-step/open-design-mcp/issues/33) confirmed full-page generations legitimately exceed it.
- **Partial-result recovery:** on server-side timeout or client cancel mid-stream, accumulated tokens are returned as partial HTML with a trailing `<!-- Generation timed out... -->` (or `cancelled by client`) comment marker and `isError: true`. The partial output is real and salvageable — pair with `od_save_artifact` to checkpoint progress before retrying or slicing.
- **Progress notifications:** emitted every 25 SSE deltas — but only when the client supplied `_meta.progressToken` (per MCP spec; servers may not emit unsolicited progress). `PROGRESS_EVERY` constant.
- **Client transport timeout (separate concern):** MCP clients have their own JSON-RPC request timeout (often 60s). If the client times out before the server does, the server's partial-recovery path doesn't help — the response never reaches the client. This is a known limitation of OpenCode's MCP integration: it sets `resetTimeoutOnProgress: true` but doesn't pass an `onprogress` callback, so the TypeScript SDK never sends a `progressToken` to the server, so no progress keepalives flow. Workaround: if you control the client, pass `onprogress` to `client.callTool`; otherwise slice prompts small.

For long, complex designs, tokens-per-minute matters more than tokens-per-request. Pick a fast model and consider slicing the prompt into sections.

## Cost & Security

- **Never commit `BYOK_API_KEY`.** Even in `.env` files — they leak via misconfigured `.gitignore`, IDE plugin telemetry, and shell history backups. Set in the MCP client's `env` block instead.
- **The proxy URL is also sensitive.** It identifies your account on the provider. Treat it like a secondary credential.
- **Costs depend on the model.** A single `od_generate_design` call typically emits 5K–30K output tokens. For `claude-sonnet-4-6` that's $0.05–$0.30 per generation. Test with cheaper models first if you're tuning the prompt.

## Why Lazy Validation

The MCP server doesn't require BYOK at startup because most workflows start with exploration (`od_list_projects`, `od_get_project`) — and forcing BYOK setup just to look at existing projects is hostile UX. The trade-off: a missing BYOK var only surfaces when generation is attempted. Tell the user up-front "you'll need BYOK env vars to generate, but listing/inspecting works without them."
