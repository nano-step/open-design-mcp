# Tasks: wire-project-custominstructions

Lane:normal × bug-fix → single PR, Oracle review on PR, tests required.

## T-1: Add `projectId` to inputSchema

In `src/tools/generate-design.ts`:

```typescript
const inputSchema = z.object({
  prompt: z.string().min(1).describe('Design request from the user'),
  projectId: z.string().optional()
    .describe('When provided, the project\'s stored customInstructions are merged into the system prompt. Per-call projectInstructions wins on conflict.'),
  kind: z.enum(KIND_VALUES).optional().default('prototype').describe('Kind of artifact to generate'),
  userInstructions: z.string().optional(),
  projectInstructions: z.string().optional(),
});
```

**Verify:** `inputSchema.parse({ prompt: 'x' })` still works (backwards compat); `inputSchema.parse({ prompt: 'x', projectId: 'p' }).projectId === 'p'`.

## T-2: Add `mergeProjectInstructions` helper

Pure helper, no exports needed outside the file:

```typescript
function mergeProjectInstructions(
  stored: string | undefined,
  perCall: string | undefined,
): string | undefined {
  if (!stored && !perCall) return undefined;
  if (!stored) return perCall;
  if (!perCall) return stored;
  return `${stored}\n\n---\n\n${perCall}`;
}
```

Documented in proposal §F3 — per-call value comes AFTER stored, so when the LLM reads down the system prompt, the per-call instructions are the most recent / freshest signal.

**Verify:** unit tests for all 4 branches.

## T-3: Fetch project in handler

In `makeGenerateDesignHandler`, after BYOK validation, before composing system prompt:

```typescript
let storedCustomInstructions: string | undefined;
if (args.projectId) {
  // Compose abort signal early so getProject participates in the timeout
  const earlySignals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (extra?.signal) earlySignals.push(extra.signal);
  const earlyCombined = AbortSignal.any(earlySignals);
  
  try {
    const detail = await client.getProject(args.projectId, earlyCombined);
    storedCustomInstructions = detail.project.customInstructions || undefined;
  } catch (err) {
    return mapErrorToToolResult(err, client.authMode);
  }
}
```

The existing Step 4 (compose AbortSignal) is unchanged; the early signal is just for the pre-fetch.

**Verify:** when `projectId` not provided, `client.getProject` is never called (mock should report `.toHaveBeenCalledTimes(0)`).

## T-4: Merge + thread into composeSystemPrompt

Replace the existing Step 2:

```typescript
const mergedProjectInstructions = mergeProjectInstructions(
  storedCustomInstructions,
  args.projectInstructions,
);

systemPrompt = composeSystemPrompt({
  metadata: { kind: args.kind },
  userInstructions: args.userInstructions,
  projectInstructions: mergedProjectInstructions,
  streamFormat: 'plain',
});
```

**Verify:** composeSystemPrompt is called with the merged string when both are present, with stored when only stored, with per-call when only per-call.

## T-5: Update tool description

In `registerGenerateDesign`:

```typescript
description:
  "Generate a design artifact using BYOK. Composes the upstream Open Design system prompt and proxies through OD's /api/proxy/<provider>/stream endpoint. Requires BYOK_BASE_URL, BYOK_API_KEY, BYOK_MODEL env vars in addition to OD_DAEMON_URL. When projectId is provided, the project's stored customInstructions are merged into the system prompt (set design tokens, brand voice, component conventions once per project via od_create_project or od_update_project; per-call projectInstructions wins on conflict). Long prompts (full pages) can take 5-10 minutes — server timeout defaults to 10 min, configurable via OD_GENERATE_TIMEOUT_MS. On abort or timeout mid-stream, accumulated tokens are returned as partial HTML with a trailing comment marker and isError=true.",
```

**Verify:** description ≤ 800 chars (we're at ~750 with this addition).

## T-6: Add 4+ new unit tests

In `src/__tests__/tools/generate-design.test.ts`:

- Test 22: `projectId provided + project has customInstructions → composeSystemPrompt receives stored value as projectInstructions` (use `getProject` mock returning `{ project: { customInstructions: 'brand: indigo, type: Inter' } }`)
- Test 23: `projectId + per-call projectInstructions → merged with separator (stored first, per-call after)` (asserts the `---` separator)
- Test 24: `projectId + project has NO customInstructions → per-call alone used (or undefined if not provided)`
- Test 25: `projectId points at missing project → mapErrorToToolResult path with 404` (use `getProject` mock that throws `OdHttpError(404)`)
- Test 26: `no projectId → getProject is NEVER called` (backwards-compat sentinel; assert `getProject` mock not invoked)

Plus pure unit tests for `mergeProjectInstructions`:

- Test 27: `merge with both undefined → undefined`
- Test 28: `merge with only stored → stored`
- Test 29: `merge with only per-call → per-call`
- Test 30: `merge with both → "<stored>\n\n---\n\n<perCall>"`

**Verify:** total unit count = 173 + 9 = 182.

## T-7: Update skill `references/workflows.md`

Add a new workflow example: "Multi-page consistency via stored customInstructions"

```markdown
## Workflow D — Multi-page consistency via stored customInstructions

Set design preferences once on the project, then every page generation auto-inherits them.

**Env required:** `OD_DAEMON_URL` + BYOK.

```
Step 1: Create the project with brand rules:
  od_create_project({
    name: "Acme SaaS",
    kind: "site",
    fidelity: "mid",
    customInstructions: "Brand: deep indigo #4F46E5 + warm cream #FAF7F2. Inter for body, Fraunces for headlines. Rounded-2xl everything. Voice: confident, slightly playful. Dark mode optional but design light-first."
  })
  → { project: { id: "proj-abc", conversationId: "..." } }

Step 2: Generate pages one at a time — each auto-inherits the brand:
  od_generate_design({
    projectId: "proj-abc",         # ← key change: passes the project
    prompt: "Pricing page with 3 tiers (Free / Pro $29/mo / Enterprise)",
    kind: "prototype"
  })
  → returns HTML using the brand rules WITHOUT you re-pasting them

  od_generate_design({
    projectId: "proj-abc",
    prompt: "About page with team grid and timeline",
    kind: "prototype"
  })
  → same brand rules apply automatically

  od_generate_design({
    projectId: "proj-abc",
    prompt: "FAQ page with 12 questions in 3 categories",
    kind: "prototype"
  })
  → consistent design across all three pages
```

**Per-call override:**
If you want one page to deviate, pass `projectInstructions` — it appends after the stored rules, so the LLM treats it as a more recent refinement:

```
od_generate_design({
  projectId: "proj-abc",
  prompt: "Holiday landing page",
  projectInstructions: "OVERRIDE: warmer palette for holiday season — add seasonal red #DC2626 as secondary accent. Keep all other brand rules."
})
```
```

**Verify:** workflows.md ≤ 200 lines (currently 134; adds ~30, well under).

## T-8: Validation ladder (clean env per HB-7)

```bash
unset OD_* BYOK_*
npm run lint
npm run typecheck
npm test                     # expect 182 passed
npm run build
bash scripts/vendor-check.sh
npm run test:integration     # expect 24 passed (unchanged)
openspec validate wire-project-custominstructions --strict --no-interactive
```

**Verify:** all 7 exit 0.

## T-9: Self-review

- `projectId` truly optional (omitting → no extra HTTP call, backwards compat)
- `mergeProjectInstructions` handles all 4 branches
- 404 from getProject surfaces via `mapErrorToToolResult` (same shape as other 404s)
- Tool description ≤ 800 chars
- workflows.md update is concrete and copy-pasteable
- All citations to upstream / vendored code resolve on master

## T-10: Oracle review on PR

Lane:normal × bug-fix → Oracle gate. Provide diff + new tests + the merge precedence rationale.

## T-11: Atomic commit + push as kokorolx

Single commit message:

```
fix(generate-design): auto-fetch customInstructions from project (closes #37)

od_generate_design now accepts an optional projectId. When provided,
the handler fetches the project record and merges the stored
customInstructions into the system prompt's Layer 6, alongside the
per-call projectInstructions. Per-call value appended after stored
with a "---" separator so it reads as a fresher refinement.

This makes the SKILL.md claim "od_generate_design reads
customInstructions" actually true (it was false before — the field
existed on the project record but was never read by the generation
tool).

Multi-page consistency workflow now works as documented:

  od_create_project({ name, customInstructions: "<brand spec>" })
  od_generate_design({ projectId, prompt: "page 1" })
  od_generate_design({ projectId, prompt: "page 2" })  # same brand
  od_generate_design({ projectId, prompt: "page 3" })  # same brand

Tests: +9 (4 handler integration + 5 pure helper). 182 total.
Backwards compat: omitting projectId → no extra HTTP call, behavior
unchanged.
```

## T-12: PR + CI + merge

- Open PR referencing #37
- Wait CI green (Node 20 + 22)
- Squash-merge as kokorolx
- `git pull --ff-only` master

## T-13: Archive + push spec deltas

```bash
openspec archive wire-project-custominstructions --yes
```

Then atomic commit `chore(openspec): archive wire-project-custominstructions` + rebase + push.

## T-14: Re-sync skill to skill-manager

Skill workflows.md changed → re-sync via `sync-skill-to-manager`:
- Bump skill `0.1.1` → `0.1.2`
- Bump skill-manager `5.7.10` → `5.7.11`
- Publish to npm
