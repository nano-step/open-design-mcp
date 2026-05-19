# Re-dogfood: #43 fix proof

**Date**: 2026-05-19
**Daemon**: `https://od.thnkandgrow.com/`
**MCP version under test**: `open-design-mcp@0.14.5` (post-PR #50 merge)
**Project**: `v1-dogfood-2026-05-19`
**Marker**: `DOGFOOD-MARKER-FIX43-PROOF`

## Methodology

1. PATCH the daemon project to set `customInstructions` + `metadata.customInstructions` to the marker string (instructing the LLM to emit an HTML comment containing the marker)
2. Spawn `npx -y open-design-mcp@0.14.5` with hosted daemon env vars (OD_DAEMON_URL, OD_AUTH_MODE=basic, BYOK_*)
3. Initialize the MCP session over stdio JSON-RPC
4. Invoke `tools/call od_generate_design` with `{ projectId, prompt: "Tiny test page..." }`
5. Grep the returned HTML for the marker

## Result

```
[client] response length: 262 chars
[client] marker "DOGFOOD-MARKER-FIX43-PROOF" present: YES (PASS)
```

Full response:
```html
<artifact type="text/html" title="Hello">
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Hello</title></head>
<body>
<!-- DOGFOOD-MARKER-FIX43-PROOF: customInstructions reached the system prompt -->
<h1>Hello</h1>
</body>
</html>
</artifact>
```

`grep -c "DOGFOOD-MARKER-FIX43-PROOF" /tmp/redogfood-43-response.html` → **1**

## Verdict: Signal 4 PASS

The metadata-stash workaround (commit `02c394e`, PR #50) successfully closes the end-to-end gap that #37's wire-up missed. `customInstructions` now reaches the system prompt against the real hosted daemon, with no upstream daemon changes required.

## Forward path

If the upstream OD daemon ever fixes their `GET /api/projects/:id` to return the top-level `customInstructions`, the fallback chain in `generate-design.ts:121-123` will continue to work — projects with stash use metadata, projects without use top-level. No migration needed.

## Closing #43

This evidence closes [#43](https://github.com/nano-step/open-design-mcp/issues/43).
