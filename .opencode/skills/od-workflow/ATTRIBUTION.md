# Attribution

This skill transcribes content from the [Open Design](https://github.com/nexu-io/open-design) project, licensed under the Apache License 2.0. The full license text is included at `vendor/od-contracts/LICENSE` in this repository.

## Pinned upstream commit

```
Repository: https://github.com/nexu-io/open-design
Commit SHA: f1870cbf3d38e9618fdfe73fdadd1fb32903715b
Pinned at:  2026-05-18
```

## Transcribed blocks

The following content is transcribed verbatim (or near-verbatim with minor adaptation noted) from the upstream source. Each reference file in this skill also carries an inline attribution header.

| Block | Upstream source | This skill |
|---|---|---|
| `<question-form id="discovery">` JSON | `packages/contracts/src/prompts/discovery.ts:71-97` | `references/discovery-form.md` |
| `<question-form id="task-type">` JSON | `packages/contracts/src/prompts/discovery.ts:39-69` | `references/discovery-form.md` |
| Form authoring rules | `packages/contracts/src/prompts/discovery.ts:99-119` | `references/discovery-form.md` |
| RULE 2 — Branch A 5-step extraction | `packages/contracts/src/prompts/discovery.ts:132-147` | `references/brand-extraction.md` |
| RULE 2 — Branch B (no source) | `packages/contracts/src/prompts/discovery.ts:149-151` | `references/brand-extraction.md` |
| RULE 3 — TodoWrite plan template | `packages/contracts/src/prompts/discovery.ts:159-173` | `references/plan-and-critique.md` |
| Step 7 — checklist guidance | `packages/contracts/src/prompts/discovery.ts:181-183` | `references/plan-and-critique.md` |
| Step 8 — 5-dimensional critique | `packages/contracts/src/prompts/discovery.ts:185-195` | `references/plan-and-critique.md` |
| Design philosophy A-I (9 principles) | `packages/contracts/src/prompts/discovery.ts:203-294` | `references/design-philosophy.md` |
| Anti-AI-slop checklist | `packages/contracts/src/prompts/discovery.ts:221-232` | `references/design-philosophy.md` (Section C — full 11 items) + SKILL.md (concise, 9 of 11 items; full list in §C) |
| Direction library (5 directions) | `packages/contracts/src/prompts/directions.ts:53+` | `references/direction-library.md` |

## Modifications made

This skill adapts the upstream content for use with OpenCode subagents driving the `open-design-mcp` MCP server. Adaptations:

1. **Tool references swapped.** The upstream prompts reference OD-internal MCP tools (`live_artifacts_create`, `live_artifacts_update`, `live_artifacts_list`, `connectors_list`, `connectors_execute`). We document equivalents using our `od_*` tools where they exist (`od_save_artifact`, `od_get_project`) and note when no equivalent exists (`connectors_*` — user must provide data manually).

2. **Form-emission semantics adapted.** The upstream `<question-form>` markup is parsed by OD's web frontend into interactive UI. Since OpenCode is an editor-driven environment, the skill instructs the subagent to either (a) emit the form markup verbatim if the host environment renders it, or (b) ask the questions conversationally. The question content is identical either way.

3. **No new behavioral content added.** Where this skill includes guidance not from upstream (e.g., "how to ask questions conversationally", "how to invoke from a parent session"), it is clearly marked as our addition and is structural, not editorial.

4. **No upstream license terms altered.** Apache 2.0 grants the right to make these adaptations with attribution. We comply.

## Apache 2.0 short notice

```
Copyright (c) 2024-2026 Nexu Labs

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

The full license text is at [vendor/od-contracts/LICENSE](../../../vendor/od-contracts/LICENSE).

## Re-sync

If the upstream OD playbook evolves and we want to pull updates:

1. Update the pinned SHA above
2. Re-read each upstream file listed in the "Transcribed blocks" table
3. Update each corresponding reference file in this skill
4. Update the "Modifications made" section to reflect any new adaptations
5. Bump the skill version in `skill.json`
