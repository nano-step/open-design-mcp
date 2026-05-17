# open-design-mcp

A stdio [Model Context Protocol](https://modelcontextprotocol.io/) server that bridges coding agents (OpenCode, Claude Code, Cursor, Zed) to a running [Open Design](https://github.com/nexu-io/open-design) daemon — so you can list projects, fetch artifacts, and (in upcoming releases) generate full design artifacts via BYOK from inside your editor.

## Status

**v0.1.0 — scaffold only.** The server boots, completes the MCP `initialize` handshake, and advertises an empty `tools/list`. Actual tools (list projects, generate design, save artifact, lint, etc.) land in follow-up changes. See [open OpenSpec changes](openspec/changes/) and the [GitHub issues](https://github.com/nano-step/open-design-mcp/issues) for the roadmap.

## Installation

Add the following entry to your MCP client config (OpenCode / Claude Code / Cursor / Zed):

```jsonc
{
  "mcp": {
    "open-design": {
      "command": "npx",
      "args": ["-y", "open-design-mcp"],
      "env": {
        "OD_DAEMON_URL": "http://localhost:7456",
        "OD_API_TOKEN": "<your-bearer-token>",
        "BYOK_BASE_URL": "https://your-ai-proxy.example.com/v1",
        "BYOK_API_KEY": "<provider-api-key>",
        "BYOK_MODEL": "open-design"
      }
    }
  }
}
```

> The env vars above are documented now so you can wire them once. **In v0.1.0 the server reads none of them** — they are consumed when the BYOK pipeline change ships.

## Environment Variables

| Variable | Purpose | Required (in v0.1.0) |
|---|---|---|
| `OD_DAEMON_URL` | Open Design daemon base URL (e.g. `http://localhost:7456`) | No (future BYOK pipeline) |
| `OD_API_TOKEN` | Bearer token the OD daemon enforces when bound to non-loopback | No (future) |
| `BYOK_BASE_URL` | OpenAI-compatible AI provider base URL | No (future) |
| `BYOK_API_KEY` | Provider API key forwarded via OD's `/api/proxy/*/stream` | No (future) |
| `BYOK_MODEL` | Model id (e.g. `open-design`, `claude-sonnet-4-6`) | No (future) |

## Development

```bash
nvm use            # picks Node 20 per .nvmrc
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration   # spawns dist/src/server.js and exercises initialize + tools/list
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
