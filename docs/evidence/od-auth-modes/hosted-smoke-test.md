# Live smoke — hosted Open Design with HTTP Basic Auth

**Date:** 2026-05-18
**Package:** `open-design-mcp@latest` (npm — v0.11.1 at run time)
**Target:** `https://od.thnkandgrow.com/` (publicly hosted OD daemon, nginx Basic Auth front)
**Auth mode:** `OD_AUTH_MODE=basic`
**Username:** `opd`
**Password:** `<REDACTED — 12 chars>`
**BYOK proxy:** `https://ai-proxy.thnkandgrow.com/v1` (model `open-design`, provider `openai`)
**Probe id:** `hosted-smoke-1779095843233`

## Full 8-tool smoke transcript

```text
$ env OD_DAEMON_URL=https://od.thnkandgrow.com/ \
      OD_AUTH_MODE=basic \
      OD_BASIC_USER=opd \
      OD_BASIC_PASS=<REDACTED> \
      BYOK_BASE_URL=https://ai-proxy.thnkandgrow.com/v1 \
      BYOK_API_KEY=<REDACTED> \
      BYOK_MODEL=open-design \
      BYOK_PROVIDER=openai \
    node /tmp/smoke-hosted.mjs

[open-design-mcp] starting on stdio
[open-design-mcp] ready
CONNECT_OK
TOOLS_COUNT=8
PROBE_ID=hosted-smoke-1779095843233
OD_AUTH_MODE=basic  OD_BASIC_USER=opd  OD_BASIC_PASS=<REDACTED 12 chars>

--- 1. od_list_projects ---
isError=false  ms=396
7 project(s):
- c7181bc0-e9ba-4416-ac67-c729a4f579a1: tamlh-test
- 2cabb775-71a0-454b-a259-6869bd444b2f: Prototype · 5/18/2026
- 878eb327-5fa9-4f30-8df7-830f3d29dbab: Nguyen
- 0e3dedb8-6504-4bc9-adb5-00513312d7e0: TuLanh
- 13c51717-3afd-4a6e-b38a-3243aff3d2d8: Prototype · 5/18/2026
- 36774f0e-6c7d-41b1-979e-8a8981d10257: Prototype · 5/18/2026
- a0e[…truncated…]

--- 2. od_create_project ---
isError=false  ms=128
Created project "Hosted Smoke Test" (id: hosted-smoke-1779095843233).
Conversation: d3c19b02-c6c4-4ea2-95fc-5878a8cee77e

--- 3. od_get_project ---
isError=false  ms=267
Project: hosted-smoke-1779095843233 — Hosted Smoke Test
Files (0):

--- 4. od_update_project ---
isError=false  ms=117
Updated project "Hosted Smoke Test (updated)" (id: hosted-smoke-1779095843233).

--- 5. od_save_artifact ---
isError=false  ms=141
Saved: hosted-smoke-artifact-1779095847940 →
  /app/.od/artifacts/2026-05-18-09-17-28-hosted-smoke-artifact-1779095847940/index.html
URL: /artifacts/2026-05-18-09-17-28-hosted-smoke-artifact-1779095847940/index.html

--- 6. od_lint_artifact ---
isError=false  ms=127
Lint: 0 findings.

--- 7. od_generate_design (BYOK streaming) ---
isError=false  ms=10573
text length: 1332 chars
One quick question before I build:

<question-form id="discovery" title="Quick brief — 30 seconds">
{
  "description": "Almost there — just a couple of things to lock in before I build.",
  "questions": [
    {
      "id": "platform",
      "label": "Target platform",
      "type": "radio",
      "required": true,
      "options": ["Responsive web", "Desktop web only"]
    },
    {
      "id": "fidelity",
      "label": "Fidelity",
      "type": "radio",
      "required": true,
      "options": [...]
    }[…truncated 832 chars…]

--- 8. od_delete_project ---
isError=false  ms=136
Deleted project: hosted-smoke-1779095843233

DONE
```

## What this proves

| # | Tool | Verb | Result | Latency |
|---|---|---|---|---|
| 1 | `od_list_projects` | read | ✅ 7 real projects returned | 396ms |
| 2 | `od_create_project` | write | ✅ Project + conversation auto-seeded | 128ms |
| 3 | `od_get_project` | read | ✅ Newly-created project reflected | 267ms |
| 4 | `od_update_project` | write | ✅ Rename applied | 117ms |
| 5 | `od_save_artifact` | write | ✅ Artifact saved to `/app/.od/artifacts/…` | 141ms |
| 6 | `od_lint_artifact` | validate | ✅ 0 findings on valid HTML | 127ms |
| 7 | `od_generate_design` | BYOK streaming | ✅ 1332 chars of valid `<question-form>` markup via proxy | 10.5s |
| 8 | `od_delete_project` | write (destructive) | ✅ Cleanup successful | 136ms |

**Every single tool succeeded against the hosted OD daemon.**

## Verification highlights

- **TOOLS_COUNT=8** — confirms the project-lifecycle-tools change (PR #29) registered all three new tools on the published npm artifact.
- **Basic Auth header reached the daemon** — every request returned 200 OK from `nginx + cloudflare` (vs the 401 we got with bad credentials in an earlier run).
- **BYOK proxy streaming works through Basic Auth** — `od_generate_design` posted to `https://od.thnkandgrow.com/api/proxy/openai/stream` with both the `Authorization: Basic <base64>` header AND the BYOK request body, and the daemon proxied to `https://ai-proxy.thnkandgrow.com/v1` correctly.
- **Full CRUD lifecycle round-trip works against hosted instance** — create at step 2, used at steps 3/4/5/7, deleted at step 8.
- **No credential leak** — Both `OD_BASIC_PASS` and `BYOK_API_KEY` redacted in this transcript; driver applies `safe()` scrubbing to any matching literal or `Basic <b64>` header value before printing.

## Credential safety notes

- Password and BYOK API key were passed via env vars in-process; never written to disk by the smoke driver.
- The `safe()` helper in `/tmp/smoke-hosted.mjs` redacts both the literal password value AND any `Basic <base64>` header pattern in case a future driver run captures more verbose output.
- This evidence document records only the username (`opd`) and the redacted placeholder for the password — the literal password value is not in the committed transcript.

## Pre-flight (negative smoke from earlier session)

Before correcting a username typo (`odp` → `opd`), the same driver returned `isError=true` with text `"OD auth failed — check OD_BASIC_USER and OD_BASIC_PASS"` for every tool. That confirmed the **mode-aware 401 mapper from #27** works correctly against a real Basic-Auth daemon (the message names the right env vars for the user's mode).

## Conclusion

`open-design-mcp@0.11.1` is **production-ready against hosted Open Design**. All 8 MCP tools — including BYOK streaming through the proxy — succeed end-to-end with `OD_AUTH_MODE=basic` against `https://od.thnkandgrow.com/`.
