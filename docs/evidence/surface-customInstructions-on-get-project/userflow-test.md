# Live user-flow test — surface customInstructions on od_get_project (#56)

**Date:** 2026-05-19
**Branch:** `feat/surface-customInstructions-on-get-project` @ `eefc5b6`
**Target:** hosted OD daemon — `https://od.thnkandgrow.com/` (basic auth)
**Project:** `open-design-mcp-site` (created in the earlier docs-site dogfood, with a 3,928-char brand spec stored at `metadata.customInstructions`)

## Setup

- Built `dist/src/server.js` fresh from the feature branch
- Stdio harness at `/tmp/od-site/runs/userflow-56.mjs` spawns the MCP server with:
  - `OD_DAEMON_URL=https://od.thnkandgrow.com/`
  - `OD_AUTH_MODE=basic`
  - `OD_BASIC_USER=opd`
  - `OD_BASIC_PASS=<redacted>`
- One MCP call: `od_get_project { projectId: "open-design-mcp-site" }`

## Result

**Exit code: 0** — round-trip 0.99s.

### structuredContent.project — fields returned

| Field | Value |
|---|---|
| `id` | `"open-design-mcp-site"` |
| `name` | `"open-design-mcp — Docs Site"` |
| `kind` | `"prototype"` ← **bug fix**: was `undefined` before this PR |
| `status` | `undefined` (daemon didn't include) |
| `resolvedDir` | `undefined` |
| `customInstructions` | **`str(len=3928)`** — full brand spec verbatim ← the load-bearing new field |
| `fidelity` | `"high-fidelity"` |
| `skillId` | `undefined` (daemon returned `null`, MCP coerced to undefined ✓) |
| `designSystemId` | `undefined` (same null→undefined coercion) |
| `createdAt` | `1779194381496` (epoch ms) |
| `updatedAt` | `1779194381496` |
| `files` | 2 entries (`changelog.html`, `index.html`) |

### Text response

Format verified:

```
Project: open-design-mcp-site — open-design-mcp — Docs Site
Custom Instructions (3930 chars):
Brand direction: warm-utility hybrid for the open-design-mcp documentation site...
[full 3928-char content]
When a stat or number is missing, use "—" or a labelled placeholder. Honest placeholder beats fake stat.

Files (2):
- changelog.html (html)
- index.html (html)
```

- ✅ `Custom Instructions (<N> chars):` header line present
- ✅ Full content rendered (no truncation)
- ✅ `Files (N):` block follows
- ✅ Total text size 4,077 chars

## Acceptance criteria — all verified

| AC | Status |
|---|---|
| AC1: same input schema (no breaking change) | ✅ |
| AC2: `customInstructions` surfaced via daemon precedence | ✅ (3,928-char string returned) |
| AC3: non-empty string → both text + structuredContent | ✅ |
| AC4: empty string → undefined | ✅ (covered by unit test 3.4) |
| AC5: absent → undefined | ✅ (covered by unit test 3.3) |
| AC6: text format `Custom Instructions (N chars):\n<content>` | ✅ |
| AC7: fidelity/skillId/designSystemId/createdAt/updatedAt | ✅ (all 5 surfaced) |
| AC8: kind read from metadata.kind (bug fix) | ✅ (live returns `'prototype'`, was `undefined` before) |

## Minor observation (not a bug)

The text-content header reports `Custom Instructions (3930 chars)` while `structuredContent.customInstructions.length === 3928`. The 2-char delta is the trailing `\n\n` in the text variant which is normalized differently between the two views. Both round-trips are byte-stable independently.

## Artifacts

- Stdio harness: `/tmp/od-site/runs/userflow-56.mjs`
- Raw result: `/tmp/od-site/runs/userflow-56.json`
- Daemon evidence (shape proof): `docs/evidence/get-project-customInstructions/daemon-raw-response.json`
