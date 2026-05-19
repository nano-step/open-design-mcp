# Proposal: fix-custominstructions-metadata-stash

**Lane × Change Type:** `lane:normal × change-type:bug-fix`
**Risk Flags:** 1 (touches the production read-path of `od_generate_design`)
**Issue:** [#43](https://github.com/nano-step/open-design-mcp/issues/43)

## Why

#37 wired `od_generate_design` to auto-fetch `customInstructions` from `GET /api/projects/:id` before composing the system prompt. The unit test mocks the daemon's response with `project.customInstructions = "..."` — green.

End-to-end against the **real hosted OD daemon** (`https://od.thnkandgrow.com/`), the field never reaches the system prompt. Direct curl proof:

```bash
$ curl -X PATCH .../projects/X -d '{"customInstructions":"MARKER"}'
{ "project": { ..., "metadata":{"kind":"page"}, ... } }   # HTTP 200, but field absent

$ curl .../projects/X
{ "project": { "id","name","skillId","designSystemId","metadata","createdAt","updatedAt" } }
                                                       ^^^^^^^ no customInstructions here
```

The daemon's project response shape omits `customInstructions` on GET — confirmed both on hosted and Docker instances. The MCP code is correct; the upstream daemon contract is the gap.

**Result:** #37 is broken end-to-end. The marquee feature of v0.12.4 doesn't work in production. v1 ships dogfood confirmed (Signal 4 FAIL).

We can't ship a fix to upstream OD on our timeline. But we CAN observe that `metadata.*` IS round-tripped by the same daemon API. So we stash a copy of `customInstructions` in `metadata.customInstructions`, then read it from there. Works today against the real daemon, with no upstream dependency.

## What changes

Three coordinated changes inside our repo, daemon-side untouched:

1. **`od_update_project` + `od_create_project` handlers** — when caller provides `customInstructions`, also write the same value to `metadata.customInstructions` on the daemon. The top-level field stays set too (forward-compat: when upstream fixes their GET serializer, we don't need to migrate).

2. **`od_generate_design` handler** — when reading the project, prefer `detail.project.metadata.customInstructions` (the stashed copy, guaranteed to round-trip), fall back to `detail.project.customInstructions` (forward-compat with a fixed upstream).

3. **New integration test** — exercises the round-trip against a mock daemon whose response shape matches the real daemon's (NO top-level `customInstructions`, only `metadata.customInstructions`). This catches future regressions where mocks drift from reality.

After this lands:
- v1 dogfood Signal 4 → PASS without any upstream change
- Existing unit tests (which mock the friendly top-level field) keep passing
- Going forward: if upstream OD ever fixes the GET serializer to surface the top-level field, our fallback path picks it up and the metadata stash becomes redundant (no harm)

## Why not

- **Why not fix upstream OD?** Out of our control timeline. We can still file an upstream issue in parallel, but we shouldn't ship a broken marquee feature waiting for someone else.
- **Why not just store in metadata only?** Forward-compat. If upstream later fixes their serializer, projects created before this change will still work (via the metadata stash), and projects created after a hypothetical upstream fix will work too (via the top-level field).
- **Why not rename `customInstructions` → `metadata.customInstructions` everywhere?** Public API contract. The MCP tool input field is still `customInstructions` (and stays that way). The stash is an internal implementation detail of how we round-trip through this specific daemon.
- **Why not a separate get-custom-instructions tool?** Speculative complexity. We already need to GET the project for kind/name; piggybacking on that response is cheaper.

## Risk

- **Low.** Stash + read with fallback is a textbook compatibility pattern.
- One subtle hazard: if a user manually edits `metadata` via `od_update_project` and removes `customInstructions` while leaving the top-level field intact, the fallback chain kicks in and behavior is preserved. If they set `metadata.customInstructions` to a different value than the top-level, our stash wins (because read order is metadata-first). Document this in the tool description.
- Token budget: the stashed copy gets returned by every `od_get_project` call. `customInstructions` is capped at 5KB by our zod schema, so worst case +5KB per response. Negligible.

## Out of scope

- Fixing upstream OD's response serializer (separate upstream issue, future work)
- Sibling-artifact context fetching (#39 hook stays reserved)
- The 4 doc/schema drifts (#45, #46, #47) — separate lane:tiny PRs
- HTML truncation (#44) — separate
- serverInfo version (#48) — separate

## Acceptance criteria

- [ ] `od_update_project` and `od_create_project` write `customInstructions` to BOTH the top-level field AND `metadata.customInstructions` on the daemon when the caller provides it
- [ ] `od_generate_design` reads `metadata.customInstructions` first, falls back to top-level `customInstructions`, falls back to undefined
- [ ] New integration test against a mock daemon whose response shape matches reality (no top-level field) demonstrates the marker reaches the system prompt
- [ ] Existing 22 unit tests for #37 still pass (they mock the top-level field — fallback chain handles them)
- [ ] Validation ladder green: lint, typecheck, unit (≥193, +2), build, vendor-check, integration (≥26, +1), openspec --strict
- [ ] Re-run the v1 ships dogfood after merge → Signal 4 must flip from FAIL to PASS
- [ ] Oracle review (lane:normal × bug-fix × 1 risk flag)
