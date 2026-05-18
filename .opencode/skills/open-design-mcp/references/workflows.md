# End-to-End Workflows

Three fully-worked examples. Use these as templates when responding to user requests.

## Workflow A — Explore Existing Projects (Read-Only)

**User intent:** "Show me what designs I already have." / "What's in my OD?"

**Env required:** `OD_DAEMON_URL` only.

```
Step 1: Call od_list_projects with no args.
  Response shape:
  {
    projects: [
      { id: "proj-abc123", name: "Pricing Page", kind: "prototype", status: "ready" },
      { id: "proj-def456", name: "Marketing Site", kind: "site", status: "draft" }
    ]
  }

Step 2: If the user picks one (or you pick the obvious match), call:
  od_get_project { projectId: "proj-abc123" }

  Response shape:
  {
    project: { id, name, kind, fidelity, customInstructions, ... },
    artifacts: [
      { slug: "pricing-v1", path: "...", url: "...", updatedAt: "..." },
      { slug: "pricing-v2", path: "...", url: "...", updatedAt: "..." }
    ]
  }

Step 3: If user wants the HTML, fetch the artifact via its url.
```

**Common pitfalls:**
- If `od_list_projects` returns `[]` and the user expected projects to exist, they're probably pointed at the wrong daemon. Verify `OD_DAEMON_URL`.
- Project IDs are opaque strings, not numeric. Don't try to parse or sort them.

## Workflow B — Generate a New Design from a PRD

**User intent:** "Make me a landing page for a SaaS pricing tool with three tiers."

**Env required:** `OD_DAEMON_URL` + `BYOK_BASE_URL` + `BYOK_API_KEY` + `BYOK_MODEL`.

```
Step 1: Create the project (or reuse an existing one):
  od_create_project {
    name: "Pricing page",
    kind: "prototype",            # use "site" for multi-page, "deck" for slides
    fidelity: "mid",              # "low" = wireframe; "mid" = styled; "high" = production-fidelity
    customInstructions: "Use Tailwind v4, prefer rounded-2xl, dark mode optional"
  }
  → { project: { id: "proj-new123", conversationId: "conv-..." } }

Step 2: Generate. This streams for 10–60 seconds:
  od_generate_design {
    projectId: "proj-new123",
    prompt: "A SaaS pricing page with three tiers: Free ($0), Pro ($29/mo), Enterprise (contact sales). Include a 4-row feature comparison table, an FAQ section with 5 common questions, and a sticky CTA bar at the top.",
    kind: "prototype"
  }
  → { html: "<!doctype html><html>...</html>", agentMessage: "..." }

Step 3: Lint BEFORE saving (cheap, prevents broken artifacts):
  od_lint_artifact { html: "<!doctype html>..." }
  → { findings: [...], agentMessage: "..." }
  If any finding has severity "error", regenerate with a refinement prompt.

Step 4: Save:
  od_save_artifact {
    projectId: "proj-new123",
    slug: "pricing-v1",            # kebab-case, URL-safe
    html: "<!doctype html>..."
  }
  → { saved: true, path: "...", url: "..." }

Step 5: Report to the user:
  - project ID + name
  - artifact slug + URL
  - any lint findings worth mentioning (e.g. "minor: missing alt text on hero image")
```

**Common pitfalls:**
- Passing markdown fences (\`\`\`html ... \`\`\`) as the prompt body — the LLM will think those are part of the design and embed them in output. Strip fences from PRD before passing.
- Forgetting `kind` — it defaults but defaults may not match the project's `kind`, producing mismatched output. Explicitly pass to be safe.
- Calling `od_save_artifact` before lint and shipping broken HTML to the user.

## Workflow C — Iterate on a Broken or Outdated Artifact

**User intent:** "Fix the nav on my pricing page — it should be sticky."

**Env required:** `OD_DAEMON_URL` + BYOK (same as Workflow B).

```
Step 1: Find the project + existing artifact:
  od_list_projects                           # if user didn't give an ID
  od_get_project { projectId: "proj-abc123" }
  → { project, artifacts: [{ slug: "pricing-v1", url: "..." }] }

Step 2: (Optional) Fetch the current HTML from the artifact URL to confirm the issue.

Step 3: Regenerate with a refinement prompt:
  od_generate_design {
    projectId: "proj-abc123",
    prompt: "Keep everything from the previous version. Change only: make the nav sticky at top, add a subtle shadow on scroll. Use position: sticky, top: 0, z-index: 50.",
    kind: "prototype"
  }
  → { html: "<!doctype html>..." }

Step 4: Lint:
  od_lint_artifact { html }

Step 5: Save with the SAME slug to overwrite, or a new slug for versioning:
  od_save_artifact {
    projectId: "proj-abc123",
    slug: "pricing-v1",       # overwrites
    # or: slug: "pricing-v2",  # versioned
    html
  }
```

**Important:** `od_generate_design` is single-turn. It doesn't have memory of previous designs in this project. The new generation is fully fresh — the prompt must include enough context to reproduce the parts you want to keep. Long-running design preferences belong in `customInstructions` on the project (set via `od_update_project`), not in the per-generation prompt.

**Slug strategy:**
- For drafts where the user is still iterating: overwrite the same slug (`pricing-v1`).
- For checkpoints worth keeping: use versioned slugs (`pricing-v1`, `pricing-v2`).
- For A/B variants: descriptive slugs (`pricing-dark`, `pricing-light`).

## Workflow D — Multi-Page Consistency via Stored customInstructions

**User intent:** "Make me a full SaaS site — pricing, about, FAQ — they all need to look like one product."

**Env required:** `OD_DAEMON_URL` + BYOK (same as Workflow B).

The trick to consistency: set design preferences ONCE on the project via `customInstructions`, then pass `projectId` to every `od_generate_design` call. The MCP fetches the project record and merges the stored brand rules into the system prompt automatically — no need to repeat them on every call.

```
Step 1: Create the project with full brand rules:
  od_create_project({
    name: "Acme SaaS",
    kind: "site",
    fidelity: "mid",
    customInstructions: "Brand: deep indigo #4F46E5 + warm cream #FAF7F2. Inter for body, Fraunces for headlines. Rounded-2xl everything. Voice: confident, slightly playful. Dark mode optional but design light-first."
  })
  → { project: { id: "proj-abc", ... } }

Step 2: Generate each page — pass projectId, NOT the full brand spec:
  od_generate_design({
    projectId: "proj-abc",                       # ← key: auto-fetches stored brand
    prompt: "Pricing page with 3 tiers (Free / Pro $29/mo / Enterprise)",
    kind: "prototype"
  })
  → HTML with the brand applied — you didn't have to paste it

  od_generate_design({
    projectId: "proj-abc",
    prompt: "About page with team grid and timeline",
    kind: "prototype"
  })
  → same brand language across pages

  od_generate_design({
    projectId: "proj-abc",
    prompt: "FAQ page, 12 questions across 3 categories",
    kind: "prototype"
  })
  → consistent typography, palette, and voice

Step 3: Lint + save each one (Workflow B steps 3-4 unchanged).
```

**Per-call override:**

If one page needs to deviate (holiday landing, feature launch, etc.), pass `projectInstructions` on that single call — it's appended after the stored rules with a `---` separator, so the LLM treats it as a fresher refinement of the brand:

```
od_generate_design({
  projectId: "proj-abc",
  prompt: "Black Friday landing page",
  projectInstructions: "Seasonal override: add deep red #DC2626 as secondary accent for CTAs and badges. Keep everything else from the brand."
})
```

**When `projectId` is omitted** (backwards compatible):
- Behavior is identical to Workflow B — no extra HTTP call, no auto-fetch
- You can still pass `projectInstructions` explicitly if you want per-call instructions without project context

**Common pitfalls:**

- Don't paste the full brand spec into BOTH `customInstructions` AND `projectInstructions` — you'll get duplication in the system prompt and the LLM may over-emphasize the repeated parts.
- A 404 from `od_generate_design` with a `projectId` argument means the project doesn't exist — use `od_list_projects` to confirm the id.
- Updating `customInstructions` mid-project: subsequent `od_generate_design` calls will see the new rules; previously-generated artifacts are unaffected.

## Cross-Cutting Tips

- **One project, many artifacts.** A project is a logical grouping (e.g., "Pricing Page"); artifacts are slugged HTML files inside it (e.g., `pricing-v1`, `pricing-faq`).
- **`customInstructions` is durable, prompt is per-call.** Use `customInstructions` for design tokens, brand colors, font stack. Use `prompt` for what to build *this time*.
- **Read errors before retrying.** A 401 won't fix itself by re-running. See [errors.md](errors.md).
- **Streaming is synchronous from the LLM's view.** Once `od_generate_design` is called, wait for the result. Don't issue parallel tool calls — they'll race the stream.
